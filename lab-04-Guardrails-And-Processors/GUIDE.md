# Lab 04: Guardrails & Processors

## What Are Guardrails?

Processors are middleware that intercept messages before they reach the LLM (`inputProcessors`) or after a response comes back (`outputProcessors`). They enforce security and quality controls like content moderation, PII detection, and prompt injection prevention.

**Use case:** Prevent your agent from processing sensitive data, block malicious prompts, or validate that inputs meet certain criteria before the LLM sees them.

All processors live in `@mastra/core/processors` — no extra packages needed.

## Key Concepts

- **`inputProcessors`** — Run before messages reach the LLM
- **`outputProcessors`** — Run after the LLM responds, before the user sees it
- **Strategies** — `block` (halt execution), `warn` (log and continue), `redact` (replace sensitive content), `detect` (flag without action)
- **Tripwire** — When a processor blocks a request, the response includes a `tripwire` property (no error is thrown)

## Step 1: Add a PII Detector

The `PIIDetector` scans messages for personally identifiable information like emails, phone numbers, and credit card numbers.

Open `src/mastra/agents/weather-agent.ts` and add a PII detector as an input processor:

```typescript
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { PIIDetector } from '@mastra/core/processors';
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
  inputProcessors: [
    new PIIDetector({
      model: 'openai/gpt-4.1-mini',
      strategy: 'redact',
      detectionTypes: ['email', 'phone', 'credit-card'],
      redactionMethod: 'mask',
    }),
  ],
});
```

**Test it in Studio** (`npm run dev`):
- Send: `"What's the weather like? My email is john@example.com"`
- The PII detector should redact the email before the LLM processes it

## Step 2: Understand Tripwires (Blocked Requests)

Change the strategy from `'redact'` to `'block'`:

```typescript
inputProcessors: [
  new PIIDetector({
    model: 'openai/gpt-4.1-mini',
    strategy: 'block',
    detectionTypes: ['email', 'phone', 'credit-card'],
  }),
],
```

When a processor blocks a request, the agent doesn't throw an error. Instead, the response includes a `tripwire` property with:
- `tripwire.reason` — Why it was blocked
- `tripwire.processorId` — Which processor blocked it
- `tripwire.metadata` — Additional context

Test this in Studio — send a message containing PII like `"My email is john@example.com"` and observe how the agent handles the blocked request. You should see the tripwire information in Studio's response.

After testing, change the strategy back to `'redact'` for the remaining steps.

## Step 3: Add a Custom Processor

Built-in processors cover common cases, but you can create custom ones by implementing the `Processor` interface.

Create `src/mastra/processors/weather-guardrail.ts`:

```typescript
import type { Processor, ProcessInputArgs, MastraMessageV2 } from '@mastra/core';

export class WeatherGuardrail implements Processor {
  id = 'weather-guardrail';

  async processInput({ messages, abort }: ProcessInputArgs): Promise<MastraMessageV2[]> {
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== 'user') {
      return messages;
    }

    const text = lastMessage.content.parts
      ?.filter((part): part is { type: 'text'; text: string } => part.type === 'text')
      .map((part) => part.text)
      .join(' ')
      .toLowerCase();

    if (!text) {
      return messages;
    }

    const hasWeatherIntent =
      /weather|temperature|forecast|rain|snow|wind|humid|sunny|cloudy|storm/.test(text);
    const hasLocation = /in\s+\w+|at\s+\w+|\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/.test(
      lastMessage.content.parts
        ?.filter((part): part is { type: 'text'; text: string } => part.type === 'text')
        .map((part) => part.text)
        .join(' ') || '',
    );

    if (hasWeatherIntent && !hasLocation) {
      abort('Please include a city or location in your weather query.');
    }

    return messages;
  }
}
```

This processor checks if a weather-related query includes a location. If not, it blocks the request and asks the user to specify one.

## Step 4: Combine Multiple Processors

Wire the custom processor into the agent alongside the PII detector. Processors execute **sequentially** — order matters:

1. Custom validation first (check the query is well-formed)
2. Security checks second (redact PII)

Update `src/mastra/agents/weather-agent.ts`:

```typescript
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
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
  memory: new Memory(),
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
```

**Test in Studio:**
- `"What's the weather?"` → Should be blocked (no location)
- `"Weather in Tokyo"` → Should work normally
- `"Weather in Paris, my phone is 555-1234"` → Should work but redact the phone number

## What You Built

- An agent with a PII detector that redacts sensitive information from user input
- A custom guardrail processor that validates weather queries include a location
- Understanding of how processors chain sequentially and how tripwires handle blocked requests
