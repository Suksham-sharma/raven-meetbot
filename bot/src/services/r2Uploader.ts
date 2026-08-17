import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  CompletedPart,
} from "@aws-sdk/client-s3";
import botConfig from "../config";

const MIN_PART_SIZE = 5 * 1024 * 1024;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

class R2Uploader {
  private client: S3Client;
  private bucket: string;
  private key: string;
  private uploadId: string | null = null;
  private parts: CompletedPart[] = [];
  private partNumber = 0;
  private buffer: Buffer[] = [];
  private bufferSize = 0;
  private totalBytes = 0;
  private completed = false;
  private flushPromise: Promise<void> = Promise.resolve();

  constructor(key: string) {
    this.client = new S3Client({
      region: botConfig.R2_REGION,
      endpoint: botConfig.R2_ENDPOINT,
      credentials: {
        accessKeyId: botConfig.R2_ACCESS_KEY_ID,
        secretAccessKey: botConfig.R2_SECRET_ACCESS_KEY,
      },
    });
    this.bucket = botConfig.R2_BUCKET;
    this.key = key;
  }

  async init(): Promise<void> {
    const { UploadId } = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: this.key,
        ContentType: this.key.endsWith(".jsonl")
          ? "application/x-ndjson"
          : "video/webm",
      })
    );

    if (!UploadId) throw new Error("Failed to create multipart upload");
    this.uploadId = UploadId;
    console.log(`[R2] Multipart upload started: ${this.key} (${UploadId})`);
  }

  async addChunk(data: Buffer): Promise<void> {
    if (this.completed) return;

    this.flushPromise = this.flushPromise.then(async () => {
      if (this.completed) return;

      this.buffer.push(data);
      this.bufferSize += data.length;

      if (this.bufferSize >= MIN_PART_SIZE) {
        await this.flushBuffer();
      }
    });

    return this.flushPromise;
  }

  private async flushBuffer(): Promise<void> {
    if (this.buffer.length === 0 || !this.uploadId) return;

    const body = Buffer.concat(this.buffer);
    this.buffer = [];
    this.bufferSize = 0;
    this.partNumber++;

    const partNumber = this.partNumber;
    await this.uploadPartWithRetry(body, partNumber);
  }

  private async uploadPartWithRetry(
    body: Buffer,
    partNumber: number
  ): Promise<void> {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const { ETag } = await this.client.send(
          new UploadPartCommand({
            Bucket: this.bucket,
            Key: this.key,
            UploadId: this.uploadId!,
            PartNumber: partNumber,
            Body: body,
          })
        );

        this.parts.push({ ETag, PartNumber: partNumber });
        this.totalBytes += body.length;
        return;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (attempt === MAX_RETRIES) {
          console.error(
            `[R2] Upload part ${partNumber} failed after ${MAX_RETRIES} retries: ${message}`
          );
          throw err;
        }
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1) + Math.random() * 500;
        console.warn(
          `[R2] Upload part ${partNumber} attempt ${attempt} failed, retrying in ${Math.round(delay)}ms: ${message}`
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  async complete(): Promise<string> {
    if (this.completed || !this.uploadId) {
      return this.key;
    }

    if (this.buffer.length > 0) {
      await this.flushBuffer();
    }

    if (this.parts.length === 0) {
      await this.abort();
      return this.key;
    }

    this.parts.sort((a, b) => (a.PartNumber ?? 0) - (b.PartNumber ?? 0));

    try {
      await this.client.send(
        new CompleteMultipartUploadCommand({
          Bucket: this.bucket,
          Key: this.key,
          UploadId: this.uploadId,
          MultipartUpload: { Parts: this.parts },
        })
      );
    } catch (err) {
      console.warn("[R2] CompleteMultipartUpload failed, retrying once...");
      await this.client.send(
        new CompleteMultipartUploadCommand({
          Bucket: this.bucket,
          Key: this.key,
          UploadId: this.uploadId,
          MultipartUpload: { Parts: this.parts },
        })
      );
    }

    this.completed = true;
    console.log(
      `[R2] Upload complete: ${this.key} (${this.parts.length} parts)`
    );
    return this.key;
  }

  getTotalBytes(): number {
    return this.totalBytes;
  }

  async abort(): Promise<void> {
    if (!this.uploadId || this.completed) return;

    try {
      await this.client.send(
        new AbortMultipartUploadCommand({
          Bucket: this.bucket,
          Key: this.key,
          UploadId: this.uploadId,
        })
      );
      console.log(`[R2] Upload aborted: ${this.key}`);
    } catch (err) {
      console.warn(`[R2] Abort failed (will auto-clean): ${this.key}`);
    }
    this.completed = true;
  }
}

export default R2Uploader;
