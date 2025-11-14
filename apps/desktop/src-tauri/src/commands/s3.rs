use crate::error::{Result, RowFlowError};
use crate::state::AppState;
use crate::types::{
    S3BucketInfo, S3ConnectionProfile, S3DeleteError, S3DeleteObjectsRequest, S3DeleteResult,
    S3GetObjectRequest, S3GetObjectResponse, S3ListRequest, S3ListResult, S3Object,
    S3PresignedUrlRequest, S3PresignedUrlResponse, S3PutObjectRequest,
};
use aws_config::meta::region::RegionProviderChain;
use aws_config::BehaviorVersion;
use aws_credential_types::Credentials;
use aws_sdk_s3::config::Region;
use aws_sdk_s3::primitives::ByteStream;
use aws_sdk_s3::Client as S3Client;
use std::time::{Duration, SystemTime};
use tauri::State;

fn normalized_path_prefix(path_prefix: Option<&String>) -> Option<&str> {
    path_prefix.map(|prefix| prefix.trim_matches('/')).filter(|trimmed| !trimmed.is_empty())
}

fn build_full_s3_key(path_prefix: Option<&String>, key: &str) -> String {
    if let Some(base) = normalized_path_prefix(path_prefix) {
        let trimmed_key = key.trim_start_matches('/');

        if trimmed_key.is_empty() {
            base.to_string()
        } else if trimmed_key == base {
            trimmed_key.to_string()
        } else if trimmed_key.starts_with(base) {
            let remainder = &trimmed_key[base.len()..];
            if remainder.is_empty() || remainder.starts_with('/') {
                trimmed_key.to_string()
            } else {
                format!("{}/{}", base, trimmed_key)
            }
        } else {
            format!("{}/{}", base, trimmed_key)
        }
    } else {
        key.to_string()
    }
}

fn base_prefix_for_listing(path_prefix: Option<&String>) -> Option<String> {
    path_prefix.and_then(|prefix| {
        let trimmed_start = prefix.trim_start_matches('/');
        if trimmed_start.is_empty() {
            None
        } else if trimmed_start.len() == prefix.len() {
            Some(prefix.clone())
        } else {
            Some(trimmed_start.to_string())
        }
    })
}

fn build_effective_prefix(
    path_prefix: Option<&String>,
    requested_prefix: Option<&String>,
) -> Option<String> {
    match requested_prefix {
        Some(prefix) if !prefix.is_empty() => {
            let combined = build_full_s3_key(path_prefix, prefix);
            if combined.is_empty() {
                None
            } else {
                Some(combined)
            }
        }
        _ => base_prefix_for_listing(path_prefix),
    }
}

/// Create S3 client from connection profile
async fn create_s3_client(profile: &S3ConnectionProfile) -> Result<S3Client> {
    log::info!("Creating S3 client for bucket: {}", profile.bucket);

    // Create credentials
    let credentials = if let Some(session_token) = &profile.session_token {
        Credentials::new(
            &profile.access_key_id,
            &profile.secret_access_key,
            Some(session_token.clone()),
            None,
            "RowFlow",
        )
    } else {
        Credentials::new(&profile.access_key_id, &profile.secret_access_key, None, None, "RowFlow")
    };

    // Set up region
    let region_provider = RegionProviderChain::first_try(Region::new(profile.region.clone()));

    // Build config
    let mut config_builder = aws_config::defaults(BehaviorVersion::latest())
        .region(region_provider)
        .credentials_provider(credentials);

    // If custom endpoint is provided, use it
    let config = if let Some(endpoint) = &profile.endpoint {
        config_builder = config_builder.endpoint_url(endpoint);
        config_builder.load().await
    } else {
        config_builder.load().await
    };

    // Create S3 client
    let mut s3_config_builder = aws_sdk_s3::config::Builder::from(&config);

    // Enable path-style addressing for S3-compatible services
    if profile.force_path_style {
        s3_config_builder = s3_config_builder.force_path_style(true);
    }

    let s3_config = s3_config_builder.build();
    let client = S3Client::from_conf(s3_config);

    Ok(client)
}

/// Connect to S3 and validate access
#[tauri::command]
pub async fn connect_s3(
    state: State<'_, AppState>,
    profile: S3ConnectionProfile,
) -> Result<String> {
    log::info!("Connecting to S3 bucket: {}", profile.bucket);

    let client = create_s3_client(&profile).await?;

    // Test connection by listing bucket (limit 1)
    client.list_objects_v2().bucket(&profile.bucket).max_keys(1).send().await.map_err(|e| {
        RowFlowError::ConnectionError(format!("Failed to connect to S3 bucket: {}", e))
    })?;

    // Store connection
    let connection_id = state.create_s3_connection(profile, client).await?;

    Ok(connection_id)
}

/// Disconnect from S3
#[tauri::command]
pub async fn disconnect_s3(state: State<'_, AppState>, connection_id: String) -> Result<()> {
    log::info!("Disconnecting S3 connection: {}", connection_id);
    state.remove_s3_connection(&connection_id).await
}

/// Test S3 connection
#[tauri::command]
pub async fn test_s3_connection(profile: S3ConnectionProfile) -> Result<S3BucketInfo> {
    log::info!("Testing S3 connection to bucket: {}", profile.bucket);

    let client = create_s3_client(&profile).await?;

    // Try to head the bucket
    let result =
        client.head_bucket().bucket(&profile.bucket).send().await.map_err(|e| {
            RowFlowError::ConnectionError(format!("Failed to access S3 bucket: {}", e))
        })?;

    // Get bucket region if available
    let region =
        result.bucket_region().map(|r| r.to_string()).unwrap_or_else(|| profile.region.clone());

    Ok(S3BucketInfo {
        name: profile.bucket.clone(),
        creation_date: None, // HeadBucket doesn't return creation date
        region,
    })
}

/// List objects in S3 bucket
#[tauri::command]
pub async fn list_s3_objects(
    state: State<'_, AppState>,
    connection_id: String,
    request: S3ListRequest,
) -> Result<S3ListResult> {
    log::info!("Listing S3 objects for connection: {}", connection_id);

    let (client, profile) = state.get_s3_client(&connection_id).await?;

    // Build prefix with path_prefix if set
    let prefix = build_effective_prefix(profile.path_prefix.as_ref(), request.prefix.as_ref());

    let mut list_request = client.list_objects_v2().bucket(&profile.bucket);

    if let Some(p) = &prefix {
        list_request = list_request.prefix(p);
    }

    if let Some(d) = &request.delimiter {
        list_request = list_request.delimiter(d);
    }

    if let Some(max_keys) = request.max_keys {
        list_request = list_request.max_keys(max_keys);
    }

    if let Some(token) = &request.continuation_token {
        list_request = list_request.continuation_token(token);
    }

    let result = list_request
        .send()
        .await
        .map_err(|e| RowFlowError::InternalError(format!("Failed to list S3 objects: {}", e)))?;

    // Convert objects
    let objects: Vec<S3Object> = result
        .contents()
        .iter()
        .map(|obj| {
            let key = obj.key().unwrap_or_default().to_string();
            let is_directory = key.ends_with('/');

            S3Object {
                key: key.clone(),
                size: obj.size().unwrap_or(0),
                last_modified: obj.last_modified().map(|dt| dt.to_string()).unwrap_or_default(),
                etag: obj.e_tag().unwrap_or_default().to_string(),
                content_type: None, // ListObjects doesn't return content type
                storage_class: obj.storage_class().map(|sc| sc.as_str().to_string()),
                is_directory,
            }
        })
        .collect();

    // Get common prefixes (directories)
    let common_prefixes: Vec<String> = result
        .common_prefixes()
        .iter()
        .filter_map(|cp| cp.prefix().map(|p| p.to_string()))
        .collect();

    Ok(S3ListResult {
        objects,
        common_prefixes,
        is_truncated: result.is_truncated().unwrap_or(false),
        continuation_token: result.next_continuation_token().map(|t| t.to_string()),
    })
}

/// Get S3 object content
#[tauri::command]
pub async fn get_s3_object(
    state: State<'_, AppState>,
    connection_id: String,
    request: S3GetObjectRequest,
) -> Result<S3GetObjectResponse> {
    log::info!("Getting S3 object: {} for connection: {}", request.key, connection_id);

    let (client, profile) = state.get_s3_client(&connection_id).await?;

    let full_key = build_full_s3_key(profile.path_prefix.as_ref(), &request.key);

    let result = client
        .get_object()
        .bucket(&profile.bucket)
        .key(&full_key)
        .send()
        .await
        .map_err(|e| RowFlowError::InternalError(format!("Failed to get S3 object: {}", e)))?;

    // Extract metadata before consuming the body
    let content_type = result.content_type().map(|ct| ct.to_string());
    let content_length = result.content_length().unwrap_or(0);
    let last_modified = result.last_modified().map(|dt| dt.to_string());
    let etag = result.e_tag().map(|e| e.to_string());

    // Read body into bytes
    let content = result
        .body
        .collect()
        .await
        .map_err(|e| RowFlowError::InternalError(format!("Failed to read S3 object body: {}", e)))?
        .into_bytes()
        .to_vec();

    Ok(S3GetObjectResponse { content, content_type, content_length, last_modified, etag })
}

/// Upload object to S3
#[tauri::command]
pub async fn put_s3_object(
    state: State<'_, AppState>,
    connection_id: String,
    request: S3PutObjectRequest,
) -> Result<String> {
    log::info!("Uploading S3 object: {} for connection: {}", request.key, connection_id);

    let (client, profile) = state.get_s3_client(&connection_id).await?;

    let full_key = build_full_s3_key(profile.path_prefix.as_ref(), &request.key);

    let body = ByteStream::from(request.content);

    let mut put_request = client.put_object().bucket(&profile.bucket).key(&full_key).body(body);

    if let Some(content_type) = &request.content_type {
        put_request = put_request.content_type(content_type);
    }

    let result = put_request
        .send()
        .await
        .map_err(|e| RowFlowError::InternalError(format!("Failed to upload S3 object: {}", e)))?;

    Ok(result.e_tag().unwrap_or_default().to_string())
}

/// Delete objects from S3
#[tauri::command]
pub async fn delete_s3_objects(
    state: State<'_, AppState>,
    connection_id: String,
    request: S3DeleteObjectsRequest,
) -> Result<S3DeleteResult> {
    log::info!("Deleting {} S3 objects for connection: {}", request.keys.len(), connection_id);

    let (client, profile) = state.get_s3_client(&connection_id).await?;

    let mut deleted = Vec::new();
    let mut errors = Vec::new();

    // Delete objects one by one for simplicity
    for key in &request.keys {
        let full_key = build_full_s3_key(profile.path_prefix.as_ref(), key);

        match client.delete_object().bucket(&profile.bucket).key(&full_key).send().await {
            Ok(_) => {
                deleted.push(key.clone());
            }
            Err(e) => {
                errors.push(S3DeleteError {
                    key: key.clone(),
                    code: "DeleteFailed".to_string(),
                    message: format!("{}", e),
                });
            }
        }
    }

    Ok(S3DeleteResult { deleted, errors })
}

/// Generate presigned URL for S3 object
#[tauri::command]
pub async fn get_s3_presigned_url(
    state: State<'_, AppState>,
    connection_id: String,
    request: S3PresignedUrlRequest,
) -> Result<S3PresignedUrlResponse> {
    log::info!(
        "Generating presigned URL for S3 object: {} for connection: {}",
        request.key,
        connection_id
    );

    let (client, profile) = state.get_s3_client(&connection_id).await?;

    let full_key = build_full_s3_key(profile.path_prefix.as_ref(), &request.key);

    let expires_in = Duration::from_secs(request.expires_in);

    let presigned_request = client
        .get_object()
        .bucket(&profile.bucket)
        .key(&full_key)
        .presigned(
            aws_sdk_s3::presigning::PresigningConfig::builder()
                .expires_in(expires_in)
                .build()
                .map_err(|e| {
                    RowFlowError::InternalError(format!("Failed to build presigning config: {}", e))
                })?,
        )
        .await
        .map_err(|e| {
            RowFlowError::InternalError(format!("Failed to generate presigned URL: {}", e))
        })?;

    let expires_at = SystemTime::now() + expires_in;
    let expires_at_str = chrono::DateTime::<chrono::Utc>::from(expires_at).to_rfc3339();

    Ok(S3PresignedUrlResponse {
        url: presigned_request.uri().to_string(),
        expires_at: expires_at_str,
    })
}
