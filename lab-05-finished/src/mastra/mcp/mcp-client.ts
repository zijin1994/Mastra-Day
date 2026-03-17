import { MCPClient } from '@mastra/mcp';

const mcp = new MCPClient({
  servers: {
    weather: {
      command: 'npx',
      args: ['-y', 'open-meteo-mcp-server'],
    },
  },
});

let mcpTools: Record<string, any> = {};

try {
  console.log('Initializing MCP servers...');
  mcpTools = await mcp.listTools();
  console.log(`MCP initialized with ${Object.keys(mcpTools).length} tools`);
} catch (error) {
  console.error('Failed to initialize MCP tools:', error);
  mcpTools = {};
}

export { mcp, mcpTools };
