import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { weatherAgent } from './weather-agent';
import { activityAgent } from './activity-agent';

export const supervisorAgent = new Agent({
  id: 'supervisor-agent',
  name: 'Supervisor Agent',
  instructions: `
    You are a helpful planning assistant that coordinates between specialized agents.

    You have access to:
    - A weather agent that can fetch real-time weather data
    - An activity agent that can suggest things to do

    When a user asks a question:
    - If they need weather information, delegate to the weather agent
    - If they want activity suggestions, delegate to the activity agent
    - If they want both (e.g., "What should I do this weekend in SF?"), use both agents

    Combine the responses into a cohesive, helpful answer.
  `,
  model: 'openai/gpt-5-mini',
  agents: { weatherAgent, activityAgent },
  memory: new Memory(),
});
