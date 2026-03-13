# Lab 05: Workflows

In this lab, you'll create a multi-step workflow that fetches weather data and uses the agent to suggest activities based on the forecast.

## Concepts

**Agents vs Workflows:** Agents are autonomous — they decide what to do and which tools to call. Workflows are deterministic — the developer defines the exact sequence of steps. Use workflows for repeatable pipelines where you want consistent, predictable execution.

**Steps** are the building blocks of a workflow. Each step has an `inputSchema`, `outputSchema`, and an `execute` function. The output of one step flows into the next.

**Chaining:** Use `.then()` to connect steps in sequence. Call `.commit()` to finalize the workflow (this validates the step chain).

## Steps

### Step 1: Create the workflow

Create a new file `src/mastra/workflows/weather-workflow.ts`:

```typescript
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';

const forecastSchema = z.object({
  date: z.string(),
  maxTemp: z.number(),
  minTemp: z.number(),
  precipitationChance: z.number(),
  condition: z.string(),
  location: z.string(),
});

function getWeatherCondition(code: number): string {
  const conditions: Record<number, string> = {
    0: 'Clear sky',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Foggy',
    48: 'Depositing rime fog',
    51: 'Light drizzle',
    53: 'Moderate drizzle',
    55: 'Dense drizzle',
    61: 'Slight rain',
    63: 'Moderate rain',
    65: 'Heavy rain',
    71: 'Slight snow fall',
    73: 'Moderate snow fall',
    75: 'Heavy snow fall',
    95: 'Thunderstorm',
  };
  return conditions[code] || 'Unknown';
}

const fetchWeather = createStep({
  id: 'fetch-weather',
  description: 'Fetches weather forecast for a given city',
  inputSchema: z.object({
    city: z.string().describe('The city to get the weather for'),
  }),
  outputSchema: forecastSchema,
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error('Input data not found');
    }

    const geocodingUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(inputData.city)}&count=1`;
    const geocodingResponse = await fetch(geocodingUrl);
    const geocodingData = (await geocodingResponse.json()) as {
      results: { latitude: number; longitude: number; name: string }[];
    };

    if (!geocodingData.results?.[0]) {
      throw new Error(`Location '${inputData.city}' not found`);
    }

    const { latitude, longitude, name } = geocodingData.results[0];

    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=precipitation,weathercode&timezone=auto,&hourly=precipitation_probability,temperature_2m`;
    const response = await fetch(weatherUrl);
    const data = (await response.json()) as {
      current: {
        time: string;
        precipitation: number;
        weathercode: number;
      };
      hourly: {
        precipitation_probability: number[];
        temperature_2m: number[];
      };
    };

    return {
      date: new Date().toISOString(),
      maxTemp: Math.max(...data.hourly.temperature_2m),
      minTemp: Math.min(...data.hourly.temperature_2m),
      condition: getWeatherCondition(data.current.weathercode),
      precipitationChance: data.hourly.precipitation_probability.reduce(
        (acc, curr) => Math.max(acc, curr),
        0,
      ),
      location: name,
    };
  },
});

const planActivities = createStep({
  id: 'plan-activities',
  description: 'Suggests activities based on weather conditions',
  inputSchema: forecastSchema,
  outputSchema: z.object({
    activities: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    const forecast = inputData;

    if (!forecast) {
      throw new Error('Forecast data not found');
    }

    const agent = mastra?.getAgent('weatherAgent');
    if (!agent) {
      throw new Error('Weather agent not found');
    }

    const prompt = `Based on the following weather forecast for ${forecast.location}, suggest appropriate outdoor and indoor activities:
      ${JSON.stringify(forecast, null, 2)}

      Include morning activities, afternoon activities, indoor alternatives, and any weather considerations.`;

    const response = await agent.stream([
      {
        role: 'user',
        content: prompt,
      },
    ]);

    let activitiesText = '';

    for await (const chunk of response.textStream) {
      process.stdout.write(chunk);
      activitiesText += chunk;
    }

    return {
      activities: activitiesText,
    };
  },
});

const weatherWorkflow = createWorkflow({
  id: 'weather-workflow',
  inputSchema: z.object({
    city: z.string().describe('The city to get the weather for'),
  }),
  outputSchema: z.object({
    activities: z.string(),
  }),
})
  .then(fetchWeather)
  .then(planActivities);

weatherWorkflow.commit();

export { weatherWorkflow };
```

### Step 2: Register the workflow

Update `src/mastra/index.ts` to include the workflow:

```typescript
import { Mastra } from '@mastra/core/mastra';
import { LibSQLStore } from '@mastra/libsql';
import { weatherAgent } from './agents/weather-agent';
import { weatherWorkflow } from './workflows/weather-workflow';

export const mastra = new Mastra({
  agents: { weatherAgent },
  workflows: { weatherWorkflow },
  storage: new LibSQLStore({
    url: 'file:./mastra.db',
  }),
});
```

### Step 3: Test the workflow

Restart the dev server. In Mastra Studio, navigate to the Workflows section and run the weather workflow with a city name (e.g., "San Francisco").

Watch both steps execute in sequence:
1. `fetchWeather` calls the Open-Meteo API and returns forecast data
2. `planActivities` passes that forecast to the weather agent, which suggests activities

Notice how the output of step 1 automatically becomes the input of step 2 — this is the data flow that `.then()` provides.

## What You Built

- A two-step workflow that fetches weather and plans activities
- Understanding of `createStep()` with typed input/output schemas
- How to chain steps with `.then()` and finalize with `.commit()`
- How to use an agent inside a workflow step via `mastra.getAgent()`
