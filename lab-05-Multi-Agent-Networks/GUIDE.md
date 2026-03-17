# Lab 07: Multi-Agent Networks

In this lab, you'll create multiple specialized agents and coordinate them through a supervisor agent that delegates tasks to the right specialist.

## Concepts

**Multi-agent pattern:** Instead of one agent doing everything, each agent specializes in a single domain. A supervisor agent coordinates them — routing questions to the right specialist. Use this for complex tasks that span multiple domains.

**Supervisor pattern:** In Mastra, you list agents in the `agents` property of a supervisor agent. These agents automatically become callable tools (named `agent-<name>`). The supervisor decides which agent to delegate to based on their `description` fields.

**Good descriptions matter:** The supervisor reads each agent's `description` to decide who handles what. Clear, specific descriptions improve delegation accuracy.

## Steps

### Step 1: Add a description to the weather agent

Update `src/mastra/agents/weather-agent.ts` to add a `description` field:

```typescript
export const weatherAgent = new Agent({
  id: 'weather-agent',
  name: 'Weather Agent',
  description: 'Specializes in fetching and reporting current weather conditions, forecasts, and weather alerts for any location.',
  // ... keep existing instructions, model, tools, memory, scorers
});
```

### Step 2: Create the activity agent

Create a new file `src/mastra/agents/activity-agent.ts`:

```typescript
import { Agent } from '@mastra/core/agent';

export const activityAgent = new Agent({
  id: 'activity-agent',
  name: 'Activity Agent',
  description: 'Specializes in suggesting activities, things to do, and planning outings based on weather conditions, location, and user preferences.',
  instructions: `
    You are an activity planning assistant. You suggest activities based on:
    - Current weather conditions
    - The user's location
    - Time of day and season

    When suggesting activities:
    - Provide 2-3 outdoor activities and 1-2 indoor alternatives
    - Consider weather conditions (don't suggest outdoor activities in heavy rain)
    - Be specific with suggestions (name actual types of activities, not generic ones)
    - Keep suggestions concise and actionable
  `,
  model: 'openai/gpt-5-mini',
});
```

### Step 3: Create the supervisor agent

Create a new file `src/mastra/agents/supervisor-agent.ts`:

```typescript
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
```

The `agents` property makes both agents available as callable tools to the supervisor.

### Step 4: Register all agents

Update `src/mastra/index.ts` to include all agents:

```typescript
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { Observability, DefaultExporter } from '@mastra/observability';
import { weatherWorkflow } from './workflows/weather-workflow';
import { weatherAgent } from './agents/weather-agent';
import { activityAgent } from './agents/activity-agent';
import { supervisorAgent } from './agents/supervisor-agent';
import { toolCallAccuracyScorer, completenessScorer, translationScorer } from './scorers/weather-scorer';

export const mastra = new Mastra({
  workflows: { weatherWorkflow },
  agents: { weatherAgent, activityAgent, supervisorAgent },
  scorers: { toolCallAccuracyScorer, completenessScorer, translationScorer },
  storage: new LibSQLStore({
    id: 'mastra-storage',
    url: 'file:./mastra.db',
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'mastra',
        exporters: [
          new DefaultExporter(),
        ],
      },
    },
  }),
});
```

### Step 5: Test delegation

Restart the dev server. In Mastra Studio, select the **Supervisor Agent** and try:

1. "What's the weather in San Francisco?" — should delegate to the weather agent only
2. "What should I do this weekend in Tokyo?" — should delegate to both agents
3. "Suggest some indoor activities for a rainy day" — should delegate to the activity agent only

Watch the tool calls in Studio to see how the supervisor routes each question.

## What You Built

- A specialized activity agent focused on activity planning
- A supervisor agent that coordinates between weather and activity agents
- Understanding of how the `agents` property converts agents into callable tools
- A complete multi-agent weather and activity planning system
