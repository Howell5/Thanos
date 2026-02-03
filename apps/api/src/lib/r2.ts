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
import { validateEnv } from "../env";

// Lazy initialization - client is created on first use
let r2Client: S3Client | null = null;
let initialized = false;

function getR2Client(): S3Client | null {
  if (!initialized) {
    const env = validateEnv();
    r2Client =
      env.R2_ENDPOINT && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY
        ? new S3Client({
            region: "auto",
            endpoint: env.R2_ENDPOINT,
            credentials: {
              accessKeyId: env.R2_ACCESS_KEY_ID,
              secretAccessKey: env.R2_SECRET_ACCESS_KEY,
            },
          })
        : null;
    initialized = true;
  }
  return r2Client;
}

function getEnv() {
  return validateEnv();
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
  if (!client) {
    throw new Error(
      "R2 not configured. Please set R2_ENDPOINT, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY.",
    );
  }

  const env = getEnv();
  const command = new PutObjectCommand({
    Bucket: env.R2_BUCKET,
    Key: options.key,
    Body: options.data,
    ContentType: options.contentType,
    Metadata: options.metadata,
  });

  await client.send(command);

  // Generate public URL
  const url = env.R2_PUBLIC_URL
    ? `${env.R2_PUBLIC_URL}/${options.key}`
    : await getR2SignedUrl(options.key);

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
  if (!client) {
    throw new Error("R2 not configured.");
  }

  const env = getEnv();
  const command = new DeleteObjectCommand({
    Bucket: env.R2_BUCKET,
    Key: key,
  });

  await client.send(command);
}

/**
 * Generate a signed URL for private access
 */
export async function getR2SignedUrl(key: string, expiresIn = 3600): Promise<string> {
  const client = getR2Client();
  if (!client) {
    throw new Error("R2 not configured.");
  }

  const env = getEnv();
  const command = new GetObjectCommand({
    Bucket: env.R2_BUCKET,
    Key: key,
  });

  return getSignedUrl(client, command, { expiresIn });
}

/**
 * Check if a file exists in R2
 */
export async function existsInR2(key: string): Promise<boolean> {
  const client = getR2Client();
  if (!client) {
    return false;
  }

  const env = getEnv();
  try {
    const command = new HeadObjectCommand({
      Bucket: env.R2_BUCKET,
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

/**
 * Check if R2 is configured and available
 */
export function isR2Configured(): boolean {
  return !!getR2Client();
}
