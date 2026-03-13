import { MCPClient } from '@mastra/mcp';

const mcp = new MCPClient({
  servers: {
    weather: {
      command: 'npx',
      args: ['-y', '@dangahagan/weather-mcp'],
    },
  },
});

let mcpTools: Record<string, any> = {};

try {
  console.log('Initializing MCP servers...');
  mcpTools = await mcp.getTools();
  console.log(`MCP initialized with ${Object.keys(mcpTools).length} tools`);
} catch (error) {
  console.error('Failed to initialize MCP tools:', error);
  mcpTools = {};
}

export { mcp, mcpTools };
