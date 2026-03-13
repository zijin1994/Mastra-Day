# Lab 06: Evals and Scorers

In this lab, you'll add evaluation scorers to measure the quality of your agent's responses, plus logging and observability for tracing.

## Concepts

**Why evaluate agents?** Agent output is non-deterministic — the same question can produce different answers. Scorers automatically measure quality on a 0-1 scale. Use them to catch regressions when you change prompts, compare models, or monitor production quality.

**Scorers** are functions that take an agent interaction and return a score. Mastra provides prebuilt scorers (tool call appropriateness, completeness, etc.) and lets you create custom LLM-judged scorers for domain-specific criteria.

**Observability** adds structured logging (PinoLogger) and tracing (Observability with exporters) so you can see what your agent is doing under the hood.

All dependencies (`@mastra/evals`, `@mastra/loggers`, `@mastra/observability`) are already in `package.json`.

## Steps

### Step 1: Create the scorers

Create a new file `src/mastra/scorers/weather-scorer.ts`:

```typescript
import { ToolCallAppropriatenessScorer, CompletenessScorer } from '@mastra/evals/scorers/prebuilt';
import { createScorer } from '@mastra/evals/scorers';

const toolCallAppropriatenessScorer = new ToolCallAppropriatenessScorer({
  strict: false,
});

const completenessScorer = new CompletenessScorer();

const translationScorer = createScorer({
  name: 'Translation Quality',
  description: 'Evaluates if non-English location names are correctly translated',
})
  .preprocess(async ({ output, input }) => {
    const userText = typeof input === 'string' ? input : JSON.stringify(input);
    const assistantText = typeof output === 'string' ? output : JSON.stringify(output);
    return { userText, assistantText };
  })
  .analyze(async ({ preprocessed }) => {
    return {
      hasNonEnglishLocation: /[^\x00-\x7F]/.test(preprocessed.userText),
      userText: preprocessed.userText,
      assistantText: preprocessed.assistantText,
    };
  })
  .generateScore(async ({ analyzed }) => {
    if (!analyzed.hasNonEnglishLocation) {
      return { score: 1, confidence: 1 };
    }
    return { score: 0.5, confidence: 0.8 };
  })
  .generateReason(async ({ score, analyzed }) => {
    if (score.score === 1) {
      return { reason: 'No non-English locations detected or translation handled correctly' };
    }
    return { reason: 'Non-English location detected - verify translation quality' };
  })
  .build({
    model: 'openai/gpt-4.1-mini',
  });

export const scorers = { toolCallAppropriatenessScorer, completenessScorer, translationScorer };
export { toolCallAppropriatenessScorer, completenessScorer, translationScorer };
```

Three scorers:
- **toolCallAppropriatenessScorer** (prebuilt): Did the agent call the right tool?
- **completenessScorer** (prebuilt): Did the response fully address the question?
- **translationScorer** (custom): Does the agent handle non-English location names? Uses `createScorer()` with a pipeline: `.preprocess()` → `.analyze()` → `.generateScore()` → `.generateReason()`

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
    You also have access to additional weather tools via MCP for alerts and extended forecasts.
  `,
  model: 'openai/gpt-4.1-mini',
  tools: { weatherTool, ...mcpTools },
  memory: new Memory(),
  scorers: {
    toolCallAppropriateness: {
      scorer: scorers.toolCallAppropriatenessScorer,
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
import { toolCallAppropriatenessScorer, completenessScorer, translationScorer } from './scorers/weather-scorer';

export const mastra = new Mastra({
  workflows: { weatherWorkflow },
  agents: { weatherAgent },
  scorers: { toolCallAppropriatenessScorer, completenessScorer, translationScorer },
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
- A custom LLM-judged scorer using `createScorer()` with the preprocess → analyze → score → reason pipeline
- Structured logging with PinoLogger and tracing with Observability
- The complete weather agent application with all Mastra features
