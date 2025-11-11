use crate::error::{Result, RowFlowError};
use crate::types::{OllamaModelInfo, OllamaStatus};

use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json;
use std::time::Duration;

const DEFAULT_ENDPOINT: &str = "http://127.0.0.1:11434";

pub struct OllamaClient {
    endpoint: String,
    http: Client,
}

impl OllamaClient {
    pub fn new(endpoint: Option<String>) -> Self {
        let endpoint = endpoint
            .or_else(|| std::env::var("OLLAMA_ENDPOINT").ok())
            .unwrap_or_else(|| DEFAULT_ENDPOINT.to_string());

        let http = Client::builder()
            .timeout(Duration::from_secs(60))
            .build()
            .expect("failed to build reqwest client");

        Self { endpoint, http }
    }

    pub fn endpoint(&self) -> &str {
        &self.endpoint
    }

    pub async fn status(&self) -> Result<OllamaStatus> {
        let mut status = OllamaStatus {
            available: false,
            endpoint: self.endpoint.clone(),
            version: None,
            models: Vec::new(),
            message: None,
        };

        let version_url = format!("{}/api/version", self.endpoint);

        match self.http.get(&version_url).send().await {
            Ok(response) => {
                if !response.status().is_success() {
                    let status_code = response.status();
                    let body = response.text().await.unwrap_or_default();
                    status.message = Some(format!("Ollama returned {}: {}", status_code, body));
                    return Ok(status);
                }

                let payload: VersionResponse = response.json().await?;
                status.available = true;
                status.version = Some(payload.version);
            }
            Err(error) => {
                status.message = Some(error.to_string());
                return Ok(status);
            }
        }

        // Only fetch tags if the endpoint is available
        let tags_url = format!("{}/api/tags", self.endpoint);
        match self.http.get(&tags_url).send().await {
            Ok(response) => {
                if response.status().is_success() {
                    let payload: TagsResponse = response.json().await?;
                    status.models = payload.models;
                } else {
                    let body = response.text().await.unwrap_or_default();
                    status.message =
                        Some(format!("Failed to list models: {}", body.trim().to_string()));
                }
            }
            Err(error) => {
                status.message = Some(error.to_string());
            }
        }

        Ok(status)
    }

    pub async fn pull_model(&self, model: &str) -> Result<()> {
        let url = format!("{}/api/pull", self.endpoint);
        let response = self
            .http
            .post(&url)
            .json(&PullRequest { name: model.to_string() })
            .send()
            .await
            .map_err(|error| RowFlowError::OllamaError(error.to_string()))?;

        let status = response.status();
        let body =
            response.text().await.map_err(|error| RowFlowError::OllamaError(error.to_string()))?;

        if !status.is_success() {
            return Err(RowFlowError::OllamaError(format!(
                "Failed to pull model {}: {}",
                model, body
            )));
        }

        for line in body.lines() {
            if line.trim().is_empty() {
                continue;
            }

            let value: serde_json::Value = serde_json::from_str(line)
                .map_err(|error| RowFlowError::OllamaError(error.to_string()))?;

            if let Some(error) = value.get("error") {
                return Err(RowFlowError::OllamaError(error.to_string()));
            }

            if let Some(status) = value.get("status").and_then(|value| value.as_str()) {
                if status.eq_ignore_ascii_case("success") {
                    return Ok(());
                }
            }
        }

        Ok(())
    }


    pub async fn embed(&self, model: &str, inputs: &[String]) -> Result<Vec<Vec<f32>>> {
        if inputs.is_empty() {
            return Ok(Vec::new());
        }

        let url = format!("{}/api/embed", self.endpoint);
        let response = self
            .http
            .post(&url)
            .json(&EmbedRequest { model: model.to_string(), input: inputs })
            .send()
            .await
            .map_err(|error| RowFlowError::OllamaError(error.to_string()))?;

        if !response.status().is_success() {
            let body = response.text().await.unwrap_or_else(|_| "unknown error".to_string());
            return Err(RowFlowError::OllamaError(format!("Embedding request failed: {}", body)));
        }

        let payload: EmbedResponse =
            response.json().await.map_err(|error| RowFlowError::OllamaError(error.to_string()))?;

        Ok(payload.embeddings)
    }

    pub async fn generate(&self, model: &str, prompt: &str, context: Option<&str>) -> Result<String> {
        // Build the full prompt with context
        let full_prompt = if let Some(ctx) = context {
            format!(r#"You are a PostgreSQL SQL expert. Generate a SQL query to answer the user's question.

Database Context:
{}

User Question: {}

Instructions:
- Analyze the question to understand what data relationships are being asked about
- If the question asks about relationships, connections, or how data is related, use JOINs to connect tables
- Use foreign key relationships when available to join tables correctly
- For questions about "how is data related", "show relationships", "connect tables", etc., create JOIN queries
- Use appropriate JOIN types (INNER, LEFT, RIGHT) based on the question
- Include relevant columns from multiple tables when showing relationships
- Use proper PostgreSQL syntax including JSONB operators (->, ->>) when needed
- Return ONLY the SQL query, no explanations or markdown formatting
- Ensure the query is syntactically correct and can be executed directly"#, ctx, prompt)
        } else {
            format!(r#"You are a PostgreSQL SQL expert. Generate a SQL query to answer the user's question.

User Question: {}

Instructions:
- Analyze the question to understand what data is being requested
- If the question asks about relationships or connections between tables, use JOINs
- Return ONLY the SQL query, no explanations or markdown formatting
- Ensure the query is syntactically correct and can be executed directly"#, prompt)
        };

        let request = GenerateRequest {
            model: model.to_string(),
            prompt: full_prompt,
            stream: false,
        };

        self.send_generate(request).await
    }

    pub async fn complete(&self, model: &str, prompt: &str) -> Result<String> {
        let request = GenerateRequest {
            model: model.to_string(),
            prompt: prompt.to_string(),
            stream: false,
        };

        self.send_generate(request).await
    }

    async fn send_generate(&self, request: GenerateRequest) -> Result<String> {
        let url = format!("{}/api/generate", self.endpoint);

        let response = self
            .http
            .post(&url)
            .json(&request)
            .send()
            .await
            .map_err(|error| RowFlowError::OllamaError(error.to_string()))?;

        if !response.status().is_success() {
            let body = response.text().await.unwrap_or_else(|_| "unknown error".to_string());
            return Err(RowFlowError::OllamaError(format!("Generate request failed: {}", body)));
        }

        let payload: GenerateResponse =
            response.json().await.map_err(|error| RowFlowError::OllamaError(error.to_string()))?;

        Ok(payload.response.trim().to_string())
    }
}

#[derive(Debug, Deserialize)]
struct VersionResponse {
    version: String,
}

#[derive(Debug, Deserialize)]
struct TagsResponse {
    models: Vec<OllamaModelInfo>,
}

#[derive(Debug, Serialize)]
struct PullRequest {
    name: String,
}

#[derive(Debug, Serialize)]
struct EmbedRequest<'a> {
    model: String,
    input: &'a [String],
}

#[derive(Debug, Deserialize)]
struct EmbedResponse {
    embeddings: Vec<Vec<f32>>,
}

#[derive(Debug, Serialize)]
struct GenerateRequest {
    model: String,
    prompt: String,
    stream: bool,
}

#[derive(Debug, Deserialize)]
struct GenerateResponse {
    response: String,
}
