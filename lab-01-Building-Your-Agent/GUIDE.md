# Lab 01: Building Your Agent

In this lab, you'll build a weather assistant from scratch — starting with a basic agent and tool, then adding memory for multi-turn conversations, and finally connecting to an external MCP server for advanced weather capabilities.

> **How to approach these labs:** You can't learn Mastra in one day, so focus on conceptually understanding what each new addition provides. There are questions throughout to help you think about use cases and what's happening behind the scenes. Don't worry about memorizing APIs — focus on the *why*.

## Prerequisites

- Node.js >= 22.13.0
- An OpenAI API key

## Setup

1. Copy `.env.example` to `.env` and add your OpenAI API key:

```bash
cp .env.example .env
```

2. Install dependencies:

```bash
npm install
```

3. Start Mastra Studio:

```bash
npm run dev
```

Open [http://localhost:4111](http://localhost:4111) to access Mastra Studio.

---

## Part 1: Your First Agent and Tool

### Concepts

**Mastra** is a TypeScript framework for building AI agents. A Mastra project is organized under `src/mastra/` with directories for `agents/`, `tools/`, and `workflows/`. The entry point is `src/mastra/index.ts`, where you create a `Mastra` instance and register your agents.

**An agent** is an LLM with a persistent identity, instructions, and access to tools. You define agents using the `Agent` class with an `id`, `name`, `instructions` (system prompt), and `model`.

**Tools** are functions the agent can decide to call. Each tool has an `id`, `description`, `inputSchema`, `outputSchema` (defined with Zod), and an `execute` function. The agent reads the tool's description and schema to decide when and how to call it.

### Step 1: Create the Weather Agent

Create a new file `src/mastra/agents/weather-agent.ts`:

```typescript
import { Agent } from "@mastra/core/agent";

export const weatherAgent = new Agent({
  id: "weather-agent",
  name: "Weather Agent",
  instructions: `
    You are a helpful weather assistant that provides accurate weather information.

    When responding:
    - Always ask for a location if none is provided
    - If the location name isn't in English, translate it
    - Include relevant details like humidity, wind conditions, and precipitation
    - Keep responses concise but informative
  `,
  model: "openai/gpt-5-mini",
});
```

Now register the agent in `src/mastra/index.ts`:

```typescript
import { Mastra } from "@mastra/core/mastra";
import { weatherAgent } from "./agents/weather-agent";

export const mastra = new Mastra({
  agents: { weatherAgent },
});
```

Restart the dev server and test in Mastra Studio. Try asking: "What's the weather in Tokyo?"

> **Note:** You may see warnings in the terminal about missing storage or memory configuration — that's expected. We'll add those in Part 2.

The agent will respond using its general knowledge — it can't access real-time weather data yet. That's what we'll fix next.

### Step 2: Create the Weather Tool

Create a new file `src/mastra/tools/weather-tool.ts`:

```typescript
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

interface GeocodingResponse {
  results: {
    latitude: number;
    longitude: number;
    name: string;
  }[];
}

interface WeatherResponse {
  current: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    wind_speed_10m: number;
    wind_gusts_10m: number;
    weather_code: number;
  };
}

export const weatherTool = createTool({
  id: "get-weather",
  description: "Get current weather for a location",
  inputSchema: z.object({
    location: z.string().describe("City name"),
  }),
  outputSchema: z.object({
    temperature: z.number(),
    feelsLike: z.number(),
    humidity: z.number(),
    windSpeed: z.number(),
    windGust: z.number(),
    conditions: z.string(),
    location: z.string(),
  }),
  execute: async (inputData) => {
    return await getWeather(inputData.location);
  },
});

const getWeather = async (location: string) => {
  const geocodingUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`;
  const geocodingResponse = await fetch(geocodingUrl);
  const geocodingData = (await geocodingResponse.json()) as GeocodingResponse;

  if (!geocodingData.results?.[0]) {
    throw new Error(`Location '${location}' not found`);
  }

  const { latitude, longitude, name } = geocodingData.results[0];

  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,weather_code`;

  const response = await fetch(weatherUrl);
  const data = (await response.json()) as WeatherResponse;

  return {
    temperature: data.current.temperature_2m,
    feelsLike: data.current.apparent_temperature,
    humidity: data.current.relative_humidity_2m,
    windSpeed: data.current.wind_speed_10m,
    windGust: data.current.wind_gusts_10m,
    conditions: getWeatherCondition(data.current.weather_code),
    location: name,
  };
};

function getWeatherCondition(code: number): string {
  const conditions: Record<number, string> = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Foggy",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    56: "Light freezing drizzle",
    57: "Dense freezing drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    66: "Light freezing rain",
    67: "Heavy freezing rain",
    71: "Slight snow fall",
    73: "Moderate snow fall",
    75: "Heavy snow fall",
    77: "Snow grains",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    85: "Slight snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail",
  };
  return conditions[code] || "Unknown";
}
```

### Step 3: Wire the Tool into the Agent

Update `src/mastra/agents/weather-agent.ts` to import and use the tool:

```typescript
import { Agent } from "@mastra/core/agent";
import { weatherTool } from "../tools/weather-tool";

export const weatherAgent = new Agent({
  id: "weather-agent",
  name: "Weather Agent",
  instructions: `
    You are a helpful weather assistant that provides accurate weather information.

    When responding:
    - Always ask for a location if none is provided
    - If the location name isn't in English, translate it
    - Include relevant details like humidity, wind conditions, and precipitation
    - Keep responses concise but informative

    Use the weatherTool to fetch current weather data.
  `,
  model: "openai/gpt-5-mini",
  tools: { weatherTool },
});
```

Restart the dev server and test again. Ask "What's the weather in Tokyo?" — the agent should now call the tool and return real-time weather data. You can see the tool call in Mastra Studio's conversation view.

---

## Part 2: Adding Memory

### Concepts

**The problem:** By default, agents are stateless — each call is independent with no memory of prior messages. Try this: ask "What's the weather in Paris?" and then "Is that typical for this time of year?" The agent won't know which city you're referring to.

> **Think about it:** In a vanilla LLM API call, how would you maintain conversation context? What would you need to pass along with each request?

**Memory types in Mastra:**

- **Message History**: Stores recent messages in a conversation thread — like a chat log. Enables multi-turn conversations where the agent remembers what was said.
- **Semantic Recall**: Vector-based search across past conversations. Lets the agent recall relevant information from previous threads based on meaning, not just recency.
- **Observational Memory (OM)**: Uses background AI agents to automatically compress long conversations. The Observer creates concise notes (5-40x compression), and the Reflector condenses those notes further when they grow too large. This prevents "context rot" where too much raw history degrades agent performance.

**Storage:** Memory needs persistent storage to survive server restarts. We use LibSQL (a lightweight SQLite-compatible database) for local development.

**threadId / resourceId:** `threadId` isolates conversations into separate threads. `resourceId` identifies a user across threads.

### Step 4: Add memory to the agent

Update `src/mastra/agents/weather-agent.ts`:

```typescript
import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { weatherTool } from "../tools/weather-tool";

export const weatherAgent = new Agent({
  id: "weather-agent",
  name: "Weather Agent",
  instructions: `
    You are a helpful weather assistant that provides accurate weather information.

    When responding:
    - Always ask for a location if none is provided
    - If the location name isn't in English, translate it
    - Include relevant details like humidity, wind conditions, and precipitation
    - Keep responses concise but informative

    Use the weatherTool to fetch current weather data.
  `,
  model: "openai/gpt-5-mini",
  tools: { weatherTool },
  memory: new Memory(),
});
```

### Step 5: Add persistent storage

Update `src/mastra/index.ts`:

```typescript
import { Mastra } from "@mastra/core/mastra";
import { LibSQLStore } from "@mastra/libsql";
import { weatherAgent } from "./agents/weather-agent";

export const mastra = new Mastra({
  agents: { weatherAgent },
  storage: new LibSQLStore({
    id: "mastra-storage",
    url: "file:./mastra.db",
  }),
});
```

### Step 6: Test multi-turn conversations

Restart the dev server. Now try the same conversation:

1. "What's the weather in Paris?"
2. "Is that typical for this time of year?"

The agent should now remember you were asking about Paris and use its general knowledge to answer the follow-up.

Try starting a new conversation with a different `threadId` — the threads should be completely independent.

### Step 7: Enable Semantic Recall

Semantic recall uses vector embeddings to find relevant information from past conversations based on meaning. Update `src/mastra/agents/weather-agent.ts`:

```typescript
import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { LibSQLVector } from "@mastra/libsql";
import { weatherTool } from "../tools/weather-tool";

export const weatherAgent = new Agent({
  id: "weather-agent",
  name: "Weather Agent",
  instructions: `...`,
  model: "openai/gpt-5-mini",
  tools: { weatherTool },
  memory: new Memory({
    vector: new LibSQLVector({
      id: "weather-agent-vector",
      url: "file:./mastra.db",
    }),
    embedder: "openai/text-embedding-3-small",
    options: {
      semanticRecall: {
        topK: 3,
        messageRange: 2,
        scope: "resource",
      },
    },
  }),
});
```

> **Think about it:** With `scope: "resource"`, semantic recall searches across all threads for the same user. Imagine a user mentioned in a previous conversation that they sunburn easily and only like walking on cloudy days. If they later ask "Would it be a good day for a walk in Boston?", semantic recall could surface that preference — even from a completely different thread. What kinds of user preferences would be valuable to recall in a weather assistant?

### Step 8: Enable Observational Memory

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

You can configure OM with custom models and thresholds. Add this to the `options` in your Memory config in `src/mastra/agents/weather-agent.ts`:

```typescript
memory: new Memory({
  vector: new LibSQLVector({
    id: "weather-agent-vector",
    url: "file:./mastra.db",
  }),
  embedder: "openai/text-embedding-3-small",
  options: {
    semanticRecall: {
      topK: 3,
      messageRange: 2,
      scope: "resource",
    },
    observationalMemory: {
      model: 'openai/gpt-5-mini',
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
`,
    },
  },
}),
```

Working memory has two scopes: **`resource`** (default, persists across all threads for the same user) and **`thread`** (isolated per conversation).

---

## Part 3: Connecting to MCP

### Concepts

Your weather tool works great for current conditions — but what if you need extended forecasts, air quality data, historical weather, or marine conditions? You could spend weeks building all those tools yourself. Or, you could connect to an MCP server that already provides them.

**MCP (Model Context Protocol)** is an open standard for sharing tools between AI systems. An MCP server exposes tools, and a client discovers and calls them — like a plugin system for AI. In this case, we'll connect to Open-Meteo's MCP server, which provides 15+ weather-related tools covering forecasts, air quality, marine weather, historical data, and more.

The key insight: your agent can use both your local tools (that you wrote) and external MCP tools (that someone else wrote) side by side.

### Step 9: Create the MCP client

Create a new file `src/mastra/mcp/mcp-client.ts`:

```typescript
import { MCPClient } from '@mastra/mcp';

const mcp = new MCPClient({
  servers: {
    weather: {
      command: 'npx',
      args: ['-y', 'open-meteo-mcp-server'],
    },
  },
});

let mcpTools: Record<string, any> = {};

try {
  console.log('Initializing MCP servers...');
  mcpTools = await mcp.listTools();
  console.log(`MCP initialized with ${Object.keys(mcpTools).length} tools`);
} catch (error) {
  console.error('Failed to initialize MCP tools:', error);
  mcpTools = {};
}

export { mcp, mcpTools };
```

### Step 10: Add MCP tools to the agent

Update `src/mastra/agents/weather-agent.ts` to include MCP tools alongside your local tool:

```typescript
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
```

### Step 11: Test

Restart the dev server. Try asking:

- "What's the weather in Tokyo?" — uses your local weather tool
- "What's the air quality in Paris?" — uses the MCP air quality tool
- "What will the weather be like in London this week?" — uses the MCP forecast tool

In Mastra Studio, you can see which tools the agent calls and whether they're local or from the MCP server.

> **Think about it:** Your agent now has 15+ tools available. How does it decide which one to call? What role do the tool `description` and `inputSchema` play in that decision?

---

## What You Built

- A Mastra project with a weather agent that has a persistent identity and instructions
- A weather tool that fetches real-time data from the Open-Meteo API (no API key needed)
- Persistent memory with LibSQL storage for multi-turn conversations
- Semantic recall for meaning-based search across conversation history
- An MCP client connecting to 15+ external weather tools — without writing any of that tool code
- An agent that seamlessly uses both local and external tools
