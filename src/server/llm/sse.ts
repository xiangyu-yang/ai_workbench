/** 逐行读取 SSE，带空闲超时保护 */
export async function* sseLines(
  body: ReadableStream<Uint8Array>,
  opts: { idleMs?: number; onIdleAbort?: () => void } = {},
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const idleMs = opts.idleMs ?? 120_000;
  let buffer = '';
  try {
    while (true) {
      const result = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) =>
          setTimeout(() => {
            opts.onIdleAbort?.();
            reject(new Error('模型响应超时（长时间无数据）'));
          }, idleMs),
        ),
      ]);
      if (result.done) break;
      buffer += decoder.decode(result.value, { stream: true });
      let index: number;
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index).replace(/\r$/, '');
        buffer = buffer.slice(index + 1);
        if (line.length > 0) yield line;
      }
    }
    if (buffer.trim()) yield buffer.trim();
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* ignore */
    }
  }
}

export function parseSseData(line: string): string | null {
  if (!line.startsWith('data:')) return null;
  return line.slice(5).trimStart();
}
