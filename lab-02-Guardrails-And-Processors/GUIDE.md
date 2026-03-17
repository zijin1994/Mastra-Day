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
    You also have access to additional weather tools via MCP for forecasts, geocoding, air quality, and historical data.
  `,
  model: 'openai/gpt-5-mini',
  tools: { weatherTool, ...mcpTools },
  memory: new Memory(),
  inputProcessors: [
    new PIIDetector({
      model: 'openai/gpt-5-mini',
      strategy: 'redact',
      detectionTypes: ['email', 'phone', 'credit-card'],
      redactionMethod: 'mask',
    }),
  ],
});
```

**Test it in Studio** (`npm run dev`):

- Send: `"What's the weather like? My email is john@example.com"`
- Check the **terminal** for `[PIIDetector] Redacted PII: PII detected. Types: email` — this confirms the processor ran
- The agent's response should not reference the email, since it was redacted before reaching the LLM
- Note: Studio shows the original message you typed, not the redacted version. In Lab 06 we'll add logging and observability for better visibility into processor activity

## Step 2: Understand Tripwires (Blocked Requests)

Change the strategy from `'redact'` to `'block'`:

```typescript
inputProcessors: [
  new PIIDetector({
    model: 'openai/gpt-5-mini',
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

Here we'll build a guardrail that checks whether a weather query includes a location. This is a good use case for an LLM-based processor — understanding user intent and whether a location is present requires semantic understanding (e.g., "What's it like outside?" is a weather query, and "the bay area" is a location).

Create `src/mastra/processors/weather-guardrail.ts`:

```typescript
import type { Processor, ProcessInputArgs, ProcessInputResult } from '@mastra/core/processors';
import { Agent } from '@mastra/core/agent';
import { z } from 'zod';

const classifierSchema = z.object({
  isWeatherQuery: z.boolean().describe('true if the user is asking about weather, temperature, forecast, or conditions'),
  hasLocation: z.boolean().describe('true if a specific city, region, or place is mentioned in the current message or conversation context'),
});

const classifierAgent = new Agent({
  id: 'weather-classifier',
  name: 'Weather Classifier',
  model: 'openai/gpt-5-mini',
  instructions: 'You analyze user messages and conversation context for a weather assistant. Determine if the message is weather-related and if a location is specified.',
});

export class WeatherGuardrail implements Processor {
  id = 'weather-guardrail';

  async processInput({ messages, abort }: ProcessInputArgs): Promise<ProcessInputResult> {
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== 'user') {
      return messages;
    }

    const text = lastMessage.content.parts
      ?.filter((part): part is { type: 'text'; text: string } => part.type === 'text')
      .map((part) => part.text)
      .join(' ');

    if (!text) {
      return messages;
    }

    const recentMessages = messages.slice(-6).map((msg) => {
      const content = msg.content.parts
        ?.filter((part): part is { type: 'text'; text: string } => part.type === 'text')
        .map((part) => part.text)
        .join(' ');
      return `${msg.role}: ${content}`;
    }).join('\n');

    const response = await classifierAgent.generate(recentMessages, {
      structuredOutput: { schema: classifierSchema },
    });

    if (response.object?.isWeatherQuery && !response.object?.hasLocation) {
      abort('Please include a city or location in your weather query.');
    }

    return messages;
  }
}
```

This processor uses structured output to guarantee the classifier returns valid typed data — no JSON parsing needed. The Zod schema defines the expected shape, and Mastra enforces it at the model level. It passes recent conversation history to the classifier, so follow-up questions like "What about tomorrow?" still work after a location has been established.

> **Think about it:** This guardrail currently uses the last 6 messages for context. What happens if the location was mentioned further back in the conversation? Can you think of a way to get conversation context without hardcoding a message window? *(Hint: remember `systemMessages` from Lab 02 — memory processors run before input processors and inject context like Observational Memory observations.)*

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
    You also have access to additional weather tools via MCP for forecasts, geocoding, air quality, and historical data.
  `,
  model: 'openai/gpt-5-mini',
  tools: { weatherTool, ...mcpTools },
  memory: new Memory(),
  inputProcessors: [
    new WeatherGuardrail(),
    new PIIDetector({
      model: 'openai/gpt-5-mini',
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
