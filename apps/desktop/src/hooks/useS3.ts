import { invoke } from '@tauri-apps/api/core';
import { useState, useCallback } from 'react';
import type {
  S3ConnectionProfile,
  S3BucketInfo,
  S3ListRequest,
  S3ListResult,
  S3GetObjectRequest,
  S3GetObjectResponse,
  S3PutObjectRequest,
  S3DeleteObjectsRequest,
  S3DeleteResult,
  S3PresignedUrlRequest,
  S3PresignedUrlResponse,
} from '@/types/s3';

export function useS3() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connectS3 = useCallback(async (profile: S3ConnectionProfile): Promise<string> => {
    setLoading(true);
    setError(null);
    try {
      const connectionId = await invoke<string>('connect_s3', { profile });
      return connectionId;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const disconnectS3 = useCallback(async (connectionId: string): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      await invoke('disconnect_s3', { connectionId });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const testS3Connection = useCallback(
    async (profile: S3ConnectionProfile): Promise<S3BucketInfo> => {
      setLoading(true);
      setError(null);
      try {
        const bucketInfo = await invoke<S3BucketInfo>('test_s3_connection', { profile });
        return bucketInfo;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const listS3Objects = useCallback(
    async (connectionId: string, request: S3ListRequest): Promise<S3ListResult> => {
      setLoading(true);
      setError(null);
      try {
        const result = await invoke<S3ListResult>('list_s3_objects', {
          connectionId,
          request,
        });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const getS3Object = useCallback(
    async (connectionId: string, request: S3GetObjectRequest): Promise<S3GetObjectResponse> => {
      setLoading(true);
      setError(null);
      try {
        const result = await invoke<S3GetObjectResponse>('get_s3_object', {
          connectionId,
          request,
        });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const putS3Object = useCallback(
    async (connectionId: string, request: S3PutObjectRequest): Promise<string> => {
      setLoading(true);
      setError(null);
      try {
        const etag = await invoke<string>('put_s3_object', {
          connectionId,
          request,
        });
        return etag;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const deleteS3Objects = useCallback(
    async (connectionId: string, request: S3DeleteObjectsRequest): Promise<S3DeleteResult> => {
      setLoading(true);
      setError(null);
      try {
        const result = await invoke<S3DeleteResult>('delete_s3_objects', {
          connectionId,
          request,
        });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const getS3PresignedUrl = useCallback(
    async (
      connectionId: string,
      request: S3PresignedUrlRequest
    ): Promise<S3PresignedUrlResponse> => {
      setLoading(true);
      setError(null);
      try {
        const result = await invoke<S3PresignedUrlResponse>('get_s3_presigned_url', {
          connectionId,
          request,
        });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return {
    loading,
    error,
    connectS3,
    disconnectS3,
    testS3Connection,
    listS3Objects,
    getS3Object,
    putS3Object,
    deleteS3Objects,
    getS3PresignedUrl,
  };
}
