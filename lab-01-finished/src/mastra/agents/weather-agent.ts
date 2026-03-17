import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { LibSQLVector } from '@mastra/libsql';
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
    You also have access to additional weather tools via MCP for forecasts, geocoding, air quality, and historical data.
  `,
  model: 'openai/gpt-5-mini',
  tools: { weatherTool, ...mcpTools },
  memory: new Memory({
    vector: new LibSQLVector({
      id: 'weather-agent-vector',
      url: 'file:./mastra.db',
    }),
    embedder: 'openai/text-embedding-3-small',
    options: {
      semanticRecall: {
        topK: 3,
        messageRange: 2,
        scope: 'resource',
      },
      observationalMemory: {
        model: 'openai/gpt-5-mini',
        observation: {
          messageTokens: 30_000,
        },
        reflection: {
          observationTokens: 40_000,
        },
      },
    },
  }),
});
