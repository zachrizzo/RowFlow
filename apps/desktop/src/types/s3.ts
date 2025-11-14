// TypeScript types for S3 operations (matching Rust backend types)

export interface S3ConnectionProfile {
  id?: string;
  name: string;
  endpoint?: string; // Optional custom endpoint (e.g., MinIO, R2)
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string; // For temporary credentials
  pathPrefix?: string; // Optional path prefix
  forcePathStyle: boolean; // For S3-compatible services
}

export interface S3Object {
  key: string;
  size: number;
  lastModified: string;
  etag: string;
  contentType?: string;
  storageClass?: string;
  isDirectory: boolean;
}

export interface S3ListResult {
  objects: S3Object[];
  commonPrefixes: string[]; // Directories
  isTruncated: boolean;
  continuationToken?: string;
}

export interface S3ListRequest {
  prefix?: string;
  delimiter?: string;
  maxKeys?: number;
  continuationToken?: string;
}

export interface S3GetObjectRequest {
  key: string;
}

export interface S3GetObjectResponse {
  content: number[]; // byte array
  contentType?: string;
  contentLength: number;
  lastModified?: string;
  etag?: string;
}

export interface S3PutObjectRequest {
  key: string;
  content: number[]; // byte array
  contentType?: string;
}

export interface S3DeleteObjectsRequest {
  keys: string[];
}

export interface S3DeleteResult {
  deleted: string[];
  errors: S3DeleteError[];
}

export interface S3DeleteError {
  key: string;
  code: string;
  message: string;
}

export interface S3PresignedUrlRequest {
  key: string;
  expiresIn: number; // seconds
}

export interface S3PresignedUrlResponse {
  url: string;
  expiresAt: string;
}

export interface S3BucketInfo {
  name: string;
  creationDate?: string;
  region: string;
}

// Connection status for UI state management
export type S3ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface S3ConnectionState {
  profile: S3ConnectionProfile;
  status: S3ConnectionStatus;
  connectionId?: string;
  bucketInfo?: S3BucketInfo;
  error?: string;
}

// Stored S3 profile (without sensitive runtime data)
export interface StoredS3Profile extends Omit<S3ConnectionProfile, 'id'> {
  id: string;
  createdAt: number;
  updatedAt: number;
}

// S3 Browser state
export interface S3BrowserState {
  currentPrefix: string; // Current "folder" path
  objects: S3Object[];
  selectedKeys: Set<string>;
  viewMode: 'grid' | 'list';
  sortBy: 'name' | 'size' | 'date';
  sortDirection: 'asc' | 'desc';
  filter: string;
}

// File preview data
export interface FilePreviewData {
  key: string;
  contentType?: string;
  content: Uint8Array | string;
  size: number;
  lastModified?: string;
}

// Helper type for file type detection
export type FileType =
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'text'
  | 'code'
  | 'json'
  | 'xml'
  | 'csv'
  | 'markdown'
  | 'archive'
  | 'binary'
  | 'unknown';

export interface FileTypeInfo {
  type: FileType;
  icon: string;
  canPreview: boolean;
  mimeType?: string;
}
