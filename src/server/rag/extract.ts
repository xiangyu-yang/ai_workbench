const MAX_CHARS = 400_000;

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function extractText(params: {
  buffer: Buffer;
  mime: string;
  name: string;
}): Promise<string> {
  const { buffer, mime, name } = params;
  const lower = name.toLowerCase();

  if (mime === 'application/pdf' || lower.endsWith('.pdf')) {
    const { extractText: extractPdf, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const result = await extractPdf(pdf, { mergePages: true });
    const text = Array.isArray(result.text) ? result.text.join('\n\n') : result.text;
    return text.slice(0, MAX_CHARS);
  }

  if (
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    lower.endsWith('.docx')
  ) {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value.slice(0, MAX_CHARS);
  }

  if (mime.includes('html') || lower.endsWith('.html') || lower.endsWith('.htm')) {
    return stripHtml(buffer.toString('utf8')).slice(0, MAX_CHARS);
  }

  if (
    mime.startsWith('text/') ||
    /\.(txt|md|markdown|csv|json|yml|yaml|log|xml|tsv)$/.test(lower)
  ) {
    return buffer.toString('utf8').slice(0, MAX_CHARS);
  }

  // 兜底：尝试按 UTF-8 解码，若二进制比例过高则拒绝
  const decoded = buffer.toString('utf8');
  const replacement = (decoded.match(/\uFFFD/g) || []).length;
  if (decoded.length > 0 && replacement / decoded.length < 0.02) {
    return decoded.slice(0, MAX_CHARS);
  }
  throw new Error(`暂不支持的文件类型：${mime || name}。支持 PDF / DOCX / TXT / MD / CSV / JSON / HTML`);
}
