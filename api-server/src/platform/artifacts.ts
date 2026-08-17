import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NoSuchKey,
  NotFound,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createReadStream, createWriteStream } from "fs";
import { access, copyFile, mkdir, stat, unlink, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { pipeline } from "stream/promises";
import type { Readable } from "stream";
import systemConfig from "./config/index";

export interface ResolvedArtifact {
  path: string;
  cleanup: () => Promise<void>;
}

export interface ArtifactStore {
  resolve(key: string): Promise<ResolvedArtifact>;
  write(key: string, data: string | Buffer): Promise<void>;
  writeFile(key: string, localPath: string): Promise<void>;
  writeStream(key: string, stream: NodeJS.ReadableStream, contentType?: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  playbackUrl(key: string): Promise<string | null>;
  presignUpload(key: string, contentType: string): Promise<string | null>;
  delete(key: string): Promise<void>;
}

export class ArtifactNotFoundError extends Error {
  constructor(public readonly key: string) {
    super(`artifact not found: ${key}`);
    this.name = "ArtifactNotFoundError";
  }
}

// Wrong here is not cosmetic: a browser handed an mp4 labelled video/webm may
// refuse to play it, and the label is baked into the object at upload time.
function contentType(key: string): string {
  if (key.endsWith(".jsonl")) return "application/x-ndjson";
  if (key.endsWith(".mp4")) return "video/mp4";
  if (key.endsWith(".jpg")) return "image/jpeg";
  return "video/webm";
}

const PLAYBACK_URL_TTL_S = 6 * 60 * 60;

class R2ArtifactStore implements ArtifactStore {
  private client: S3Client;
  private bucket: string;

  constructor() {
    this.client = new S3Client({
      region: systemConfig.R2_REGION,
      endpoint: systemConfig.R2_ENDPOINT,
      credentials: {
        accessKeyId: systemConfig.R2_ACCESS_KEY_ID,
        secretAccessKey: systemConfig.R2_SECRET_ACCESS_KEY,
      },
    });
    this.bucket = systemConfig.R2_BUCKET;
  }

  async resolve(key: string): Promise<ResolvedArtifact> {
    let body: Readable;
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key })
      );
      body = res.Body as Readable;
    } catch (err) {
      if (err instanceof NoSuchKey || err instanceof NotFound) {
        throw new ArtifactNotFoundError(key);
      }
      throw err;
    }

    const tmp = path.join(os.tmpdir(), `artifact-${process.pid}-${key.replace(/[^\w.-]/g, "_")}`);
    await pipeline(body, createWriteStream(tmp));
    return {
      path: tmp,
      cleanup: () => unlink(tmp).catch(() => undefined),
    };
  }

  async write(key: string, data: string | Buffer): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: contentType(key),
      })
    );
  }

  // ContentLength is required because a stream has no inherent length and the
  // SDK will not buffer it to find one.
  async writeFile(key: string, localPath: string): Promise<void> {
    const { size } = await stat(localPath);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: createReadStream(localPath),
        ContentLength: size,
        ContentType: contentType(key),
      })
    );
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (err) {
      if (err instanceof NotFound || err instanceof NoSuchKey) return false;
      throw err;
    }
  }

  async writeStream(key: string, stream: NodeJS.ReadableStream, contentTypeOverride?: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: stream as unknown as Readable,
        ContentType: contentTypeOverride ?? contentType(key),
      })
    );
  }

  async playbackUrl(key: string): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: PLAYBACK_URL_TTL_S }
    );
  }

  async presignUpload(key: string, contentTypeHeader: string): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentTypeHeader || contentType(key),
      }),
      { expiresIn: 3600 }
    );
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch {}
  }
}

// The read half of the bot's local-disk fallback. Without it the write side
// degrades gracefully and the read side throws: capture succeeds, diarize dies,
// and the meeting never reaches Postgres.
class LocalArtifactStore implements ArtifactStore {
  private dir = systemConfig.RECORDINGS_DIR;

  // cleanup is a no-op: unlinking here would delete the recording itself.
  async resolve(key: string): Promise<ResolvedArtifact> {
    const full = path.join(this.dir, key);
    if (!(await this.exists(key))) throw new ArtifactNotFoundError(key);
    return { path: full, cleanup: async () => undefined };
  }

  async write(key: string, data: string | Buffer): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(path.join(this.dir, key), data);
  }

  // copyFile, not rename: the source is a temp file the caller still owns and
  // may sit on a different device, where rename() fails with EXDEV.
  async writeFile(key: string, localPath: string): Promise<void> {
    const dest = path.join(this.dir, key);
    if (path.resolve(dest) === path.resolve(localPath)) return;
    await mkdir(this.dir, { recursive: true });
    await copyFile(localPath, dest);
  }

  async exists(key: string): Promise<boolean> {
    try {
      await access(path.join(this.dir, key));
      return true;
    } catch {
      return false;
    }
  }

  async writeStream(key: string, stream: NodeJS.ReadableStream, contentType?: string): Promise<void> {
    const dest = path.join(this.dir, key);
    await mkdir(this.dir, { recursive: true });
    await pipeline(stream as unknown as Readable, createWriteStream(dest));
  }

  async playbackUrl(): Promise<null> {
    return null;
  }

  async presignUpload(): Promise<null> {
    return null;
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(path.join(this.dir, key));
    } catch {}
  }
}

let store: ArtifactStore | null = null;

export function getArtifactStore(): ArtifactStore {
  if (store) return store;
  const hasR2 =
    systemConfig.R2_ENDPOINT &&
    systemConfig.R2_ACCESS_KEY_ID &&
    systemConfig.R2_SECRET_ACCESS_KEY;
  // Mirrors createStorageSink()'s test exactly — the two sides have to agree on
  // which store is live or they will read and write in different places.
  store = hasR2 ? new R2ArtifactStore() : new LocalArtifactStore();
  return store;
}
