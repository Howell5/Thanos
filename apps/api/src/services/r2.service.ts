/**
 * R2 Storage Service Implementation
 * Wraps the existing r2.ts functions into an injectable service
 */

import {
  type PresignedUploadResult,
  type UploadOptions,
  type UploadResult,
  deleteFromR2,
  generateImageKey,
  generateMediaKey,
  generateUploadUrl,
  isR2Configured,
  uploadToR2,
} from "../lib/r2";
import type { IR2Service } from "./types";

/**
 * Production R2 service that wraps actual storage API calls
 */
export class R2Service implements IR2Service {
  async upload(options: UploadOptions): Promise<UploadResult> {
    return uploadToR2(options);
  }

  async delete(key: string): Promise<void> {
    return deleteFromR2(key);
  }

  generateImageKey(userId: string, projectId: string): string {
    return generateImageKey(userId, projectId);
  }

  generateMediaKey(userId: string, projectId: string, extension: string): string {
    return generateMediaKey(userId, projectId, extension);
  }

  async generatePresignedUploadUrl(
    key: string,
    contentType: string,
    expiresIn?: number,
  ): Promise<PresignedUploadResult> {
    return generateUploadUrl(key, contentType, expiresIn);
  }

  isConfigured(): boolean {
    return isR2Configured();
  }
}

/**
 * Create the default R2 service instance
 */
export function createR2Service(): IR2Service {
  return new R2Service();
}
