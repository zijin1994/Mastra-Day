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
