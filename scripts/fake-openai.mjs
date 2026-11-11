/**
 * 本地 OpenAI 兼容测试服务（仅用于开发验证 stdio/SSE 流式适配）：
 *   node scripts/fake-openai.mjs
 *   然后在「模型供应商」添加 Base URL: http://127.0.0.1:4010/v1
 */
import http from 'node:http';

const PORT = Number(process.env.FAKE_OPENAI_PORT || 4010);

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url.endsWith('/models')) {
    return sendJson(res, 200, {
      object: 'list',
      data: [
        { id: 'fake-gpt', object: 'model' },
        { id: 'fake-gpt-mini', object: 'model' },
      ],
    });
  }
  if (req.method === 'POST' && req.url.includes('/chat/completions')) {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      let payload = {};
      try {
        payload = JSON.parse(raw);
      } catch {
        return sendJson(res, 400, { error: { message: 'invalid json' } });
      }
      const messages = payload.messages || [];
      const last = [...messages].reverse().find((m) => m.role === 'user');
      const prompt =
        typeof last?.content === 'string'
          ? last.content
          : (last?.content || []).map((part) => part.text || '').join(' ');
      const text = `这是来自 fake-openai 的流式回答。\n\n你刚才说：**${String(prompt).slice(0, 120)}**\n\n- 协议：OpenAI Chat Completions\n- 模式：SSE streaming\n- 用途：验证 Cuter 模型网关\n`;
      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      const chunks = text.match(/[\s\S]{1,8}/g) || [];
      let index = 0;
      const timer = setInterval(() => {
        if (index >= chunks.length) {
          clearInterval(timer);
          res.write(
            `data: ${JSON.stringify({
              choices: [{ delta: {}, finish_reason: 'stop', index: 0 }],
              usage: { prompt_tokens: 28, completion_tokens: 46 },
            })}\n\n`,
          );
          res.write('data: [DONE]\n\n');
          res.end();
          return;
        }
        res.write(
          `data: ${JSON.stringify({
            id: 'chatcmpl-fake',
            object: 'chat.completion.chunk',
            model: payload.model || 'fake-gpt',
            choices: [{ index: 0, delta: { content: chunks[index++] }, finish_reason: null }],
          })}\n\n`,
        );
      }, 15);
      res.on('close', () => clearInterval(timer));
    });
    return;
  }
  sendJson(res, 404, { error: { message: 'not found' } });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[fake-openai] listening on http://127.0.0.1:${PORT}`);
});
