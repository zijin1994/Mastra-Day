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
