import { MCPClient } from '@mastra/mcp';

const mcp = new MCPClient({
  servers: {
    notion: {
      command: 'npx',
      args: ['-y', '@notionhq/notion-mcp-server'],
      env: {
        NOTION_TOKEN: process.env.NOTION_TOKEN!,
      },
    },
  },
});

let mcpTools: Record<string, any> = {};

try {
  console.log('Initializing MCP servers...');
  mcpTools = await mcp.listTools();
  console.log(`MCP initialized with ${Object.keys(mcpTools).length} tools`);
  console.log('Available MCP tools:', Object.keys(mcpTools).join(', '));
} catch (error) {
  console.error('Failed to initialize MCP tools:', error);
  mcpTools = {};
}

export { mcp, mcpTools };
