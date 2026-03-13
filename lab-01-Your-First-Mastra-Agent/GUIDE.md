# Lab 01: Your First Mastra Agent

In this lab, you'll create your first AI agent with Mastra and give it the ability to fetch real-time weather data using a tool.

## Concepts

**Mastra** is a TypeScript framework for building AI agents. A Mastra project is organized under `src/mastra/` with directories for `agents/`, `tools/`, and `workflows/`. The entry point is `src/mastra/index.ts`, where you create a `Mastra` instance and register your agents.

**An agent** is an LLM with a persistent identity, instructions, and access to tools. You define agents using the `Agent` class with an `id`, `name`, `instructions` (system prompt), and `model`.

**Tools** are functions the agent can decide to call. Each tool has an `id`, `description`, `inputSchema`, `outputSchema` (defined with Zod), and an `execute` function. The agent reads the tool's description and schema to decide when and how to call it.

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

## Part 1: Create the Weather Agent

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
  model: "openai/gpt-4.1-mini",
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

The agent will respond using its general knowledge — it can't access real-time weather data yet. That's what we'll fix next.

## Part 2: Create the Weather Tool

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

## Part 3: Wire the Tool into the Agent

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
  model: "openai/gpt-4.1-mini",
  tools: { weatherTool },
});
```

Restart the dev server and test again. Ask "What's the weather in Tokyo?" — the agent should now call the tool and return real-time weather data. You can see the tool call in Mastra Studio's conversation view.

## What You Built

- A Mastra project with a weather agent that has a persistent identity and instructions
- A weather tool that fetches real-time data from the Open-Meteo API (no API key needed)
- The agent decides when to call the tool based on the user's question
