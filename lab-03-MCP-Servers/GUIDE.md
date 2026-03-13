# Lab 03: MCP Servers

In this lab, you'll connect the weather agent to an external MCP (Model Context Protocol) server, giving it access to additional weather capabilities without writing new tool code.

## Concepts

**MCP (Model Context Protocol)** is an open standard for sharing tools between AI systems. A server exposes tools, and a client discovers and calls them. This lets your agent use tools provided by others without writing the implementation yourself.

**Use case:** Connect your agent to external tool providers — like a weather MCP server that offers alerts, extended forecasts, or historical data — alongside your existing local tools.

## Steps

### Step 1: Create the MCP client

Create a new file `src/mastra/mcp/mcp-client.ts`:

```typescript
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
```

The `@dangahagan/weather-mcp` server provides weather data from NOAA and Open-Meteo — no API key needed.

### Step 2: Add MCP tools to the agent

Update `src/mastra/agents/weather-agent.ts` to include MCP tools alongside local tools:

```typescript
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { weatherTool } from '../tools/weather-tool';
import { mcpTools } from '../mcp/mcp-client';

export const weatherAgent = new Agent({
  id: 'weather-agent',
  name: 'Weather Agent',
  instructions: `
    You are a helpful weather assistant that provides accurate weather information.

    When responding:
    - Always ask for a location if none is provided
    - If the location name isn't in English, translate it
    - Include relevant details like humidity, wind conditions, and precipitation
    - Keep responses concise but informative

    Use the weatherTool to fetch current weather data.
    You also have access to additional weather tools via MCP for alerts and extended forecasts.
  `,
  model: 'openai/gpt-4.1-mini',
  tools: { weatherTool, ...mcpTools },
  memory: new Memory(),
});
```

### Step 3: Test

Restart the dev server. Try asking:
- "What's the weather in Tokyo?" — uses the local weather tool
- "Are there any weather alerts for New York?" — may use the MCP weather tools

In Mastra Studio, you can see which tools the agent calls and whether they're local or from the MCP server.

## What You Built

- An MCP client that connects to an external weather MCP server
- An agent that uses both local tools and MCP-provided tools
- Understanding of how MCP enables tool interoperability across AI systems
