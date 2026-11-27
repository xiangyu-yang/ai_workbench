import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR, env } from '@/server/env';

/**
 * 对象存储适配层。
 *
 * - local：DATA_DIR 下的共享卷，适合单机或共享 NFS；
 * - s3：S3/MinIO，适合 Web/Worker 多副本。
 *
 * artifacts 与 chat attachments 统一走这里；Agent workspace 仍由
 * security/workspace.ts 管理，因为执行器需要文件级路径与沙箱校验。
 */

export type StorageBackend = 'local' | 's3';

export function storageBackend(): StorageBackend {
  return env.S3_BUCKET ? 's3' : 'local';
}

export function isS3Ref(ref: string): boolean {
  return /^s3:\/\//i.test(ref || '');
}

function localPath(key: string): string {
  const normalized = key.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.includes('\0') || normalized.split('/').includes('..')) {
    throw new Error('非法对象键');
  }
  const full = path.join(DATA_DIR, normalized);
  const root = path.resolve(DATA_DIR);
  if (full !== root && !full.startsWith(root + path.sep)) throw new Error('对象键越界');
  return full;
}

type S3Module = typeof import('@aws-sdk/client-s3');

let s3Module: Promise<S3Module> | null = null;
let s3Client: Promise<InstanceType<S3Module['S3Client']>> | null = null;

async function getS3() {
  if (!env.S3_BUCKET) throw new Error('S3_BUCKET 未配置');
  if (!s3Module) s3Module = import('@aws-sdk/client-s3');
  const module = await s3Module;
  if (!s3Client) {
    s3Client = Promise.resolve(
      new module.S3Client({
        region: env.S3_REGION,
        endpoint: env.S3_ENDPOINT || undefined,
        forcePathStyle: env.S3_FORCE_PATH_STYLE,
        credentials: env.S3_ACCESS_KEY_ID
          ? {
              accessKeyId: env.S3_ACCESS_KEY_ID,
              secretAccessKey: env.S3_SECRET_ACCESS_KEY,
            }
          : undefined,
      }),
    );
  }
  return { module, client: await s3Client };
}

async function ensureBucket(
  module: S3Module,
  client: InstanceType<S3Module['S3Client']>,
  bucket: string,
): Promise<void> {
  try {
    await client.send(new module.HeadBucketCommand({ Bucket: bucket }));
  } catch {
    try {
      await client.send(new module.CreateBucketCommand({ Bucket: bucket }));
    } catch (error) {
      const message = (error as Error).message || '';
      // 并发创建或桶已存在时 HeadBucket 的权限受限，直接让 PutObject 报真实错误。
      if (!/BucketAlreadyOwnedByYou|BucketAlreadyExists/i.test(message)) {
        console.warn('[cuter] S3 自动创建 bucket 失败，继续尝试写入：', message);
      }
    }
  }
}

export async function putObject(
  key: string,
  body: string | Buffer,
  contentType = 'application/octet-stream',
): Promise<{ ref: string; key: string; size: number; backend: StorageBackend }> {
  const buffer = typeof body === 'string' ? Buffer.from(body, 'utf8') : body;
  if (storageBackend() === 'local') {
    const full = localPath(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, buffer);
    return { ref: key.replace(/\\/g, '/'), key, size: buffer.byteLength, backend: 'local' };
  }

  const { module, client } = await getS3();
  const bucket = env.S3_BUCKET;
  await ensureBucket(module, client, bucket);
  await client.send(
    new module.PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ContentLength: buffer.byteLength,
    }),
  );
  return { ref: `s3://${bucket}/${key}`, key, size: buffer.byteLength, backend: 's3' };
}

export async function getObject(ref: string): Promise<Buffer> {
  if (!ref) throw new Error('对象引用为空');
  if (!isS3Ref(ref)) {
    return fs.readFile(localPath(ref));
  }
  const match = /^s3:\/\/([^/]+)\/(.+)$/i.exec(ref);
  if (!match) throw new Error('非法 S3 对象引用');
  const bucket = match[1];
  const key = match[2];
  const { module, client } = await getS3();
  const result = await client.send(new module.GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!result.Body) throw new Error('S3 返回空对象');
  const bytes = await result.Body.transformToByteArray();
  return Buffer.from(bytes);
}

export async function deleteObject(ref: string): Promise<void> {
  if (!ref) return;
  if (!isS3Ref(ref)) {
    await fs.rm(localPath(ref), { force: true });
    return;
  }
  const match = /^s3:\/\/([^/]+)\/(.+)$/i.exec(ref);
  if (!match) return;
  const { module, client } = await getS3();
  await client.send(new module.DeleteObjectCommand({ Bucket: match[1], Key: match[2] }));
}
