import { Agent } from '@mastra/core/agent';
import { weatherTool } from '../tools/weather-tool';

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
  `,
  model: 'openai/gpt-4.1-mini',
  tools: { weatherTool },
});
