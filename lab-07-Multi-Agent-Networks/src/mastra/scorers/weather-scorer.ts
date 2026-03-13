import { ToolCallAppropriatenessScorer, CompletenessScorer } from '@mastra/evals/scorers/prebuilt';
import { createScorer, ScorerResult } from '@mastra/evals/scorers';

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
