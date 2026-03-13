import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { LibSQLVector } from '@mastra/libsql';
import { PIIDetector } from '@mastra/core/processors';
import { weatherTool } from '../tools/weather-tool';
import { mcpTools } from '../mcp/mcp-client';
import { WeatherGuardrail } from '../processors/weather-guardrail';

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
    },
  }),
  inputProcessors: [
    new WeatherGuardrail(),
    new PIIDetector({
      model: 'openai/gpt-4.1-mini',
      strategy: 'redact',
      detectionTypes: ['email', 'phone', 'credit-card'],
      redactionMethod: 'mask',
    }),
  ],
});
