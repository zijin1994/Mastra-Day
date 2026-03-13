# Lab 02: Agent Memory

In this lab, you'll add memory to the weather agent so it can maintain context across a multi-turn conversation.

## Concepts

**The problem:** By default, agents are stateless — each call is independent with no memory of prior messages. If you ask "What's the weather in Paris?" and then "What about tomorrow?", the agent won't know which city you're referring to.

**Memory types in Mastra:**

- **Message History**: Stores recent messages in a conversation thread — like a chat log. Enables multi-turn conversations where the agent remembers what was said.
- **Semantic Recall**: Vector-based search across past conversations. Lets the agent recall relevant information from previous threads.
- **Observational Memory (OM)**: Mastra's newest memory system. Uses two background AI agents — an Observer and a Reflector — to automatically compress long conversations. The Observer creates concise notes (5-40x compression), and the Reflector condenses those notes further when they grow too large. This prevents "context rot" where too much raw history degrades agent performance.

**Storage:** Memory needs persistent storage to survive server restarts. We use LibSQL (a lightweight SQLite-compatible database) for local development.

**threadId / resourceId:** `threadId` isolates conversations into separate threads. `resourceId` identifies a user across threads.

## Steps

### Step 1: See the problem

Start the dev server and open Mastra Studio. Ask the weather agent:

1. "What's the weather in Paris?"
2. Then ask: "What about tomorrow?"

The agent won't know which city you mean — it has no memory of the previous message.

### Step 2: Add memory to the agent

Update `src/mastra/agents/weather-agent.ts`:

```typescript
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
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
  memory: new Memory(),
});
```

### Step 3: Add persistent storage

Update `src/mastra/index.ts`:

```typescript
import { Mastra } from '@mastra/core/mastra';
import { LibSQLStore } from '@mastra/libsql';
import { weatherAgent } from './agents/weather-agent';

export const mastra = new Mastra({
  agents: { weatherAgent },
  storage: new LibSQLStore({
    url: 'file:./mastra.db',
  }),
});
```

### Step 4: Test multi-turn conversations

Restart the dev server. Now try the same conversation:

1. "What's the weather in Paris?"
2. "What about tomorrow?"

The agent should now remember that you were asking about Paris.

Try starting a new conversation with a different `threadId` — the threads should be completely independent.

### Step 5: Semantic Recall

Semantic recall uses vector embeddings to find relevant information from past conversations based on meaning. It's enabled by default when memory is configured. You can customize its behavior:

```typescript
memory: new Memory({
  options: {
    semanticRecall: {
      topK: 3,           // Number of similar messages to retrieve (default: 3)
      messageRange: 2,    // Messages before/after each match for context (default: 2)
      scope: 'resource',  // 'thread' (current thread only) or 'resource' (across all threads for the user)
    },
  },
}),
```

You can also configure the embedder:

```typescript
import { ModelRouterEmbeddingModel } from '@mastra/core/llm';

memory: new Memory({
  embedder: new ModelRouterEmbeddingModel('openai/text-embedding-3-small'),
}),
```

To disable semantic recall (e.g., for latency-sensitive use cases):

```typescript
memory: new Memory({
  options: {
    semanticRecall: false,
  },
}),
```

### Step 6: Enable Observational Memory

For long-running conversations, enable OM to automatically compress history:

```typescript
memory: new Memory({
  options: {
    observationalMemory: true,
  },
}),
```

OM works in three tiers:
1. **Recent messages** — exact conversation history for the current exchange
2. **Observations** — the Observer agent compresses older messages into concise notes
3. **Reflections** — the Reflector condenses observations when they accumulate

You can configure OM with custom models and thresholds:

```typescript
memory: new Memory({
  options: {
    observationalMemory: {
      model: 'openai/gpt-4.1-mini',
      observation: {
        messageTokens: 30_000, // trigger observation at this many tokens
      },
      reflection: {
        observationTokens: 40_000, // trigger reflection at this many tokens
      },
    },
  },
}),
```

### Note: Working Memory

Working memory is the agent's scratchpad — small, structured state (like a user's name or preferred temperature unit) that persists across interactions. Unlike message history which stores full conversations, working memory stores key facts the agent should always have available.

You define a template that tells the agent what to track:

```typescript
memory: new Memory({
  options: {
    workingMemory: {
      enabled: true,
      template: `# User Profile
- **Name**:
- **Location**:
- **Preferred Units**: [Celsius/Fahrenheit]
- **Interests**:
`,
    },
  },
}),
```

The agent automatically updates this template as it learns about the user. You can also use a Zod schema instead of a markdown template for structured JSON data:

```typescript
import { z } from 'zod';

memory: new Memory({
  options: {
    workingMemory: {
      enabled: true,
      schema: z.object({
        name: z.string().optional(),
        location: z.string().optional(),
        preferredUnits: z.enum(['Celsius', 'Fahrenheit']).optional(),
      }),
    },
  },
}),
```

Working memory has two scopes:
- **`resource`** (default) — persists across all threads for the same user
- **`thread`** — isolated per conversation thread

## What You Built

- An agent with persistent memory that maintains context across multi-turn conversations
- LibSQL storage so memory survives server restarts
- Understanding of semantic recall for meaning-based search across conversations
- Understanding of Observational Memory for handling long conversations efficiently
