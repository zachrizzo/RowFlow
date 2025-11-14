import { FileType, FileTypeInfo } from '@/types/s3';
import {
  FileImage,
  FileVideo,
  FileAudio,
  FileText,
  FileCode,
  FileArchive,
  File,
  FileCog,
} from 'lucide-react';

const mimeTypeMap: Record<string, FileType> = {
  // Images
  'image/jpeg': 'image',
  'image/jpg': 'image',
  'image/png': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  'image/svg+xml': 'image',
  'image/bmp': 'image',
  'image/tiff': 'image',

  // Videos
  'video/mp4': 'video',
  'video/webm': 'video',
  'video/ogg': 'video',
  'video/quicktime': 'video',
  'video/x-msvideo': 'video',

  // Audio
  'audio/mpeg': 'audio',
  'audio/mp3': 'audio',
  'audio/wav': 'audio',
  'audio/ogg': 'audio',
  'audio/webm': 'audio',

  // Documents
  'application/pdf': 'pdf',
  'text/plain': 'text',
  'text/markdown': 'markdown',
  'text/csv': 'csv',

  // Code
  'application/json': 'json',
  'application/xml': 'xml',
  'text/xml': 'xml',
  'text/html': 'code',
  'text/css': 'code',
  'text/javascript': 'code',
  'application/javascript': 'code',
  'application/typescript': 'code',

  // Archives
  'application/zip': 'archive',
  'application/x-zip-compressed': 'archive',
  'application/gzip': 'archive',
  'application/x-tar': 'archive',
  'application/x-7z-compressed': 'archive',
  'application/x-rar-compressed': 'archive',
};

const extensionMap: Record<string, FileType> = {
  // Images
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  gif: 'image',
  webp: 'image',
  svg: 'image',
  bmp: 'image',
  ico: 'image',
  tiff: 'image',
  tif: 'image',

  // Videos
  mp4: 'video',
  webm: 'video',
  ogg: 'video',
  ogv: 'video',
  mov: 'video',
  avi: 'video',
  mkv: 'video',
  flv: 'video',

  // Audio
  mp3: 'audio',
  wav: 'audio',
  flac: 'audio',
  aac: 'audio',

  // Documents
  pdf: 'pdf',
  txt: 'text',
  md: 'markdown',
  csv: 'csv',

  // Code
  json: 'json',
  xml: 'xml',
  html: 'code',
  htm: 'code',
  css: 'code',
  js: 'code',
  jsx: 'code',
  ts: 'code',
  tsx: 'code',
  py: 'code',
  rs: 'code',
  go: 'code',
  java: 'code',
  c: 'code',
  cpp: 'code',
  h: 'code',
  hpp: 'code',
  sh: 'code',
  bash: 'code',
  yaml: 'code',
  yml: 'code',
  toml: 'code',
  sql: 'code',
  rb: 'code',
  php: 'code',

  // Archives
  zip: 'archive',
  tar: 'archive',
  gz: 'archive',
  '7z': 'archive',
  rar: 'archive',
  bz2: 'archive',
};

export function getFileType(key: string, contentType?: string): FileType {
  // Try content type first
  if (contentType) {
    const mappedContentType = mimeTypeMap[contentType.toLowerCase()];
    if (mappedContentType) {
      return mappedContentType;
    }
  }

  // Try extension
  const extension = key.split('.').pop()?.toLowerCase();
  if (extension) {
    const mappedType = extensionMap[extension];
    if (mappedType) {
      return mappedType;
    }
  }

  // Check if it's likely binary
  if (contentType?.startsWith('application/') && !contentType.includes('json') && !contentType.includes('xml')) {
    return 'binary';
  }

  return 'unknown';
}

export function getFileTypeInfo(key: string, contentType?: string): FileTypeInfo {
  const type = getFileType(key, contentType);

  const canPreview = ['image', 'video', 'audio', 'pdf', 'text', 'code', 'json', 'xml', 'csv', 'markdown'].includes(type);

  let icon = 'file';
  switch (type) {
    case 'image':
      icon = 'image';
      break;
    case 'video':
      icon = 'video';
      break;
    case 'audio':
      icon = 'audio';
      break;
    case 'pdf':
    case 'text':
    case 'markdown':
    case 'csv':
      icon = 'text';
      break;
    case 'code':
    case 'json':
    case 'xml':
      icon = 'code';
      break;
    case 'archive':
      icon = 'archive';
      break;
    case 'binary':
      icon = 'cog';
      break;
    default:
      icon = 'file';
  }

  return {
    type,
    icon,
    canPreview,
    mimeType: contentType,
  };
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function getFileIcon(type: FileType) {
  switch (type) {
    case 'image':
      return FileImage;
    case 'video':
      return FileVideo;
    case 'audio':
      return FileAudio;
    case 'text':
    case 'markdown':
    case 'csv':
      return FileText;
    case 'code':
    case 'json':
    case 'xml':
      return FileCode;
    case 'archive':
      return FileArchive;
    case 'binary':
      return FileCog;
    default:
      return File;
  }
}
