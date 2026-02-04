/**
 * Cloudflare R2 Storage Service
 * Uses AWS SDK v3 with S3-compatible API
 */

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Presigned URL expiration time (seconds)
const PRESIGN_EXPIRATION = 30 * 60; // 30 minutes

/**
 * Lazy getters for R2 configuration
 * These read environment variables at call time, not at module load time
 */
function getR2Config() {
  return {
    accountId: process.env.R2_ACCOUNT_ID || "",
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
    bucketName: process.env.R2_BUCKET || "berryon-medias",
    cdnDomain: process.env.R2_CDN_DOMAIN || "img.berryon.art",
  };
}

/**
 * Check if R2 is configured
 */
export function isR2Configured(): boolean {
  const config = getR2Config();
  return !!(config.accountId && config.accessKeyId && config.secretAccessKey);
}

/**
 * Create R2 S3 client
 */
function createR2Client(): S3Client {
  const config = getR2Config();

  if (!config.accountId || !config.accessKeyId || !config.secretAccessKey) {
    throw new Error(
      "R2 is not configured. Please set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY.",
    );
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

// Singleton client
let r2Client: S3Client | null = null;

function getR2Client(): S3Client {
  if (!r2Client) {
    r2Client = createR2Client();
  }
  return r2Client;
}

export interface UploadOptions {
  key: string;
  data: Buffer;
  contentType: string;
  metadata?: Record<string, string>;
}

export interface UploadResult {
  key: string;
  url: string;
  size: number;
}

/**
 * Upload a file to R2 storage
 */
export async function uploadToR2(options: UploadOptions): Promise<UploadResult> {
  const client = getR2Client();
  const config = getR2Config();

  const command = new PutObjectCommand({
    Bucket: config.bucketName,
    Key: options.key,
    Body: options.data,
    ContentType: options.contentType,
    Metadata: options.metadata,
  });

  await client.send(command);

  // Generate CDN URL
  const url = `https://${config.cdnDomain}/${options.key}`;

  return {
    key: options.key,
    url,
    size: options.data.length,
  };
}

/**
 * Delete a file from R2 storage
 */
export async function deleteFromR2(key: string): Promise<void> {
  const client = getR2Client();
  const config = getR2Config();

  const command = new DeleteObjectCommand({
    Bucket: config.bucketName,
    Key: key,
  });

  await client.send(command);
}

/**
 * Generate a signed URL for private access (GET)
 */
export async function getR2SignedUrl(key: string, expiresIn = PRESIGN_EXPIRATION): Promise<string> {
  const client = getR2Client();
  const config = getR2Config();

  const command = new GetObjectCommand({
    Bucket: config.bucketName,
    Key: key,
  });

  return getSignedUrl(client, command, { expiresIn });
}

export interface PresignedUploadResult {
  uploadUrl: string;
  cdnUrl: string;
  key: string;
  expiresIn: number;
}

/**
 * Generate a presigned URL for direct upload from client (PUT)
 * This allows frontend to upload directly to R2 without going through the backend
 */
export async function generateUploadUrl(
  key: string,
  contentType: string,
  expiresIn = PRESIGN_EXPIRATION,
): Promise<PresignedUploadResult> {
  const client = getR2Client();
  const config = getR2Config();

  const command = new PutObjectCommand({
    Bucket: config.bucketName,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn });
  const cdnUrl = `https://${config.cdnDomain}/${key}`;

  return {
    uploadUrl,
    cdnUrl,
    key,
    expiresIn,
  };
}

/**
 * Check if a file exists in R2
 */
export async function existsInR2(key: string): Promise<boolean> {
  if (!isR2Configured()) {
    return false;
  }

  const client = getR2Client();
  const config = getR2Config();

  try {
    const command = new HeadObjectCommand({
      Bucket: config.bucketName,
      Key: key,
    });
    await client.send(command);
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate a unique key for an image
 */
export function generateImageKey(_userId: string, projectId: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `projects/${projectId}/images/${timestamp}-${random}.png`;
}
