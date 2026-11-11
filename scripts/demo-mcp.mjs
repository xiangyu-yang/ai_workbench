/**
 * 示例 MCP 服务（stdio）。用于本地/私有化演示连接器链路：
 *   command: node
 *   args: scripts/demo-mcp.mjs
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({ name: 'cuter-demo-mcp', version: '1.0.0' });

server.registerTool(
  'echo',
  {
    title: '回显',
    description: '回显输入文本，用于验证连接器链路',
    inputSchema: { text: z.string().describe('要回显的文本') },
  },
  async ({ text }) => ({ content: [{ type: 'text', text: `Echo: ${text}` }] }),
);

server.registerTool(
  'get_time',
  {
    title: '当前时间',
    description: '返回服务器当前时间（ISO 8601）',
    inputSchema: {},
  },
  async () => ({ content: [{ type: 'text', text: new Date().toISOString() }] }),
);

server.registerTool(
  'search_tickets',
  {
    title: '查询工单',
    description: '示例：按状态查询客户支持工单',
    inputSchema: {
      status: z.enum(['open', 'pending', 'closed']).describe('工单状态'),
      limit: z.number().int().min(1).max(100).optional().describe('返回条数（1-100）'),
    },
  },
  async ({ status, limit }) => {
    const data = [
      { id: 'T-1042', title: '登录后无法加载仪表盘', status: 'open', priority: 'P1' },
      { id: 'T-1039', title: '账单导出缺少字段', status: 'pending', priority: 'P2' },
      { id: 'T-1031', title: 'SSO 配置咨询', status: 'closed', priority: 'P3' },
    ].filter((item) => item.status === status);
    return {
      content: [
        { type: 'text', text: JSON.stringify({ tickets: data.slice(0, limit || 10) }, null, 2) },
      ],
    };
  },
);

async function main() {
  await server.connect(new StdioServerTransport());
  console.error('[demo-mcp] ready');
}

void main();
