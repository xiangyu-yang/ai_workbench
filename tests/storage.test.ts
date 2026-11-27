import { afterAll, describe, expect, it } from 'vitest';
import { deleteObject, getObject, putObject, storageBackend } from '@/server/storage';

const key = `workspaces/org_storage_test/thread_storage_test/${Date.now()}.txt`;

describe('storage adapter', () => {
  it('writes and reads through the configured backend', async () => {
    const stored = await putObject(key, 'storage-smoke-test', 'text/plain');
    expect(stored.backend).toBe(storageBackend());
    expect(stored.size).toBe(Buffer.byteLength('storage-smoke-test'));
    const buffer = await getObject(stored.ref);
    expect(buffer.toString('utf8')).toBe('storage-smoke-test');
  });

  it('round-trips UTF-8 content', async () => {
    const utf8Key = `${key}.utf8`;
    const stored = await putObject(utf8Key, '贵州茅台', 'text/plain');
    const buffer = await getObject(stored.ref);
    expect(buffer.toString('utf8')).toBe('贵州茅台');
    await deleteObject(stored.ref);
  });
});

afterAll(async () => {
  await deleteObject(key);
});
