export type ChunkOptions = { size?: number; overlap?: number; maxChunks?: number };

/**
 * 结构化分块：优先按标题/空行/句子边界切分，保持语义完整，
 * 再以字符重叠保证跨块上下文连续。
 */
export function chunkText(input: string, options: ChunkOptions = {}): string[] {
  const size = Math.max(200, options.size ?? 900);
  const overlap = Math.min(Math.max(0, options.overlap ?? 120), Math.floor(size / 2));
  const maxChunks = options.maxChunks ?? 1200;

  const text = input
    .replace(/\r\n/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
  if (!text) return [];
  if (text.length <= size) return [text];

  const blocks = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = '';

  const flush = () => {
    const value = current.trim();
    if (value) chunks.push(value);
    current = overlap > 0 && value.length > overlap ? value.slice(-overlap) : '';
  };

  for (const block of blocks) {
    if (block.length > size * 1.6) {
      // 超长段落按句子切分
      const sentences = block.split(/(?<=[。！？!?；;])|\n/).filter((s) => s.trim());
      for (const sentence of sentences) {
        if ((current + sentence).length > size) flush();
        current += sentence;
      }
      if (current.length > size) flush();
      continue;
    }
    if ((current + '\n\n' + block).length > size && current.trim()) flush();
    current += (current ? '\n\n' : '') + block;
    if (current.length >= size) flush();
    if (chunks.length >= maxChunks) break;
  }
  if (current.trim() && chunks.length < maxChunks) {
    const value = current.trim();
    if (value.length > overlap || chunks.length === 0) chunks.push(value);
  }
  return chunks.slice(0, maxChunks);
}
