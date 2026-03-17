# Lab 06: Evals and Scorers

In this lab, you'll add evaluation scorers to measure the quality of your agent's responses, plus logging and observability for tracing.

## Concepts

**Why evaluate agents?** Agent output is non-deterministic — the same question can produce different answers. Scorers automatically measure quality on a 0-1 scale. Use them to catch regressions when you change prompts, compare models, or monitor production quality.

**Scorers** are functions that take an agent interaction and return a score. Mastra provides prebuilt scorers (tool call accuracy, completeness, etc.) and lets you create custom scorers for domain-specific criteria.

**Observability** adds structured logging (PinoLogger) and tracing (Observability with exporters) so you can see what your agent is doing under the hood.

All dependencies (`@mastra/evals`, `@mastra/loggers`, `@mastra/observability`) are already in `package.json`.

## Steps

### Step 1: Create the scorers

Create a new file `src/mastra/scorers/weather-scorer.ts`:

```typescript
import { createToolCallAccuracyScorerLLM, createCompletenessScorer } from '@mastra/evals/scorers/prebuilt';
import { getUserMessageFromRunInput, getAssistantMessageFromRunOutput } from '@mastra/evals/scorers/utils';
import { createScorer } from '@mastra/core/evals';

const toolCallAccuracyScorer = createToolCallAccuracyScorerLLM({
  model: 'openai/gpt-5-mini',
  availableTools: [
    { id: 'weatherTool', description: 'Get current weather for a location' },
    { id: 'weather_weather_forecast', description: 'Get weather forecast data for coordinates' },
    { id: 'weather_air_quality', description: 'Get air quality forecast including PM2.5, ozone, AQI' },
    { id: 'weather_geocoding', description: 'Search for locations by name, returns coordinates' },
    { id: 'weather_weather_archive', description: 'Get historical weather data from 1940 to present' },
    { id: 'weather_marine_weather', description: 'Get marine weather including wave height and sea temperature' },
    { id: 'weather_elevation', description: 'Get elevation data for coordinates' },
  ],
});

const completenessScorer = createCompletenessScorer();

const translationScorer = createScorer({
  id: 'translation-quality',
  name: 'Translation Quality',
  description: 'Evaluates if non-English location names are correctly translated',
  type: 'agent',
})
  .preprocess(({ run }) => {
    const userText = getUserMessageFromRunInput(run.input) || '';
    const assistantText = getAssistantMessageFromRunOutput(run.output) || '';
    return { userText, assistantText };
  })
  .generateScore(({ results }) => {
    const { userText } = results.preprocessStepResult || {};
    const hasNonEnglishLocation = /[^\x00-\x7F]/.test(userText || '');
    if (!hasNonEnglishLocation) {
      return 1;
    }
    return 0.5;
  })
  .generateReason(({ score }) => {
    if (score === 1) {
      return 'No non-English locations detected or translation handled correctly';
    }
    return 'Non-English location detected - verify translation quality';
  });

export const scorers = { toolCallAccuracyScorer, completenessScorer, translationScorer };
export { toolCallAccuracyScorer, completenessScorer, translationScorer };
```

Three scorers:

- **toolCallAccuracyScorer** (prebuilt): Did the agent call the right tool? Uses LLM-based semantic evaluation.
- **completenessScorer** (prebuilt): Did the response fully address the question?
- **translationScorer** (custom): Does the agent handle non-English location names? Uses `createScorer()` from `@mastra/core/evals` with a pipeline: `.preprocess()` → `.generateScore()` → `.generateReason()`

### Step 2: Wire scorers into the agent

Update `src/mastra/agents/weather-agent.ts`:

```typescript
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { weatherTool } from '../tools/weather-tool';
import { mcpTools } from '../mcp/mcp-client';
import { scorers } from '../scorers/weather-scorer';

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
  memory: new Memory(),
  scorers: {
    toolCallAccuracy: {
      scorer: scorers.toolCallAccuracyScorer,
      sampling: { type: 'ratio', rate: 1 },
    },
    completeness: {
      scorer: scorers.completenessScorer,
      sampling: { type: 'ratio', rate: 1 },
    },
    translation: {
      scorer: scorers.translationScorer,
      sampling: { type: 'ratio', rate: 1 },
    },
  },
});
```

### Step 3: Add logging and observability

Update `src/mastra/index.ts`:

```typescript
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { Observability, DefaultExporter } from '@mastra/observability';
import { weatherWorkflow } from './workflows/weather-workflow';
import { weatherAgent } from './agents/weather-agent';
import { toolCallAccuracyScorer, completenessScorer, translationScorer } from './scorers/weather-scorer';

export const mastra = new Mastra({
  workflows: { weatherWorkflow },
  agents: { weatherAgent },
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

The `DefaultExporter` sends traces to Mastra Studio — you'll see them automatically when you open Studio.

### Step 4: Test

Restart the dev server. Ask the agent a few questions and check Mastra Studio for:

- Score results on each interaction
- Trace data showing the full execution flow
- Logger output in the console

### Bonus: Ship traces to Mastra Cloud

If you want to send traces to [Mastra Cloud](https://cloud.mastra.ai), you can add the `CloudExporter`. Sign up for a free account and grab your API key, then add it to your `.env` file:

```
MASTRA_CLOUD_API_KEY=your-api-key-here
```

Then update the exporters array in `src/mastra/index.ts`:

```typescript
import { Observability, DefaultExporter, CloudExporter } from '@mastra/observability';

// ...
observability: new Observability({
  configs: {
    default: {
      serviceName: 'mastra',
      exporters: [
        new DefaultExporter(),
        new CloudExporter(),
      ],
    },
  },
}),
```

This lets you view traces, scores, and logs in the Mastra Cloud dashboard alongside your local Studio.

## What You Built

- Three scorers measuring tool usage, response completeness, and translation quality
- A custom scorer using `createScorer()` from `@mastra/core/evals` with the preprocess → score → reason pipeline
- Structured logging with PinoLogger and tracing with Observability
- The complete weather agent application with all Mastra features
