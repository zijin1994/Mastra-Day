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
