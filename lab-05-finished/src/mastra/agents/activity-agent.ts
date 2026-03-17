import { Agent } from '@mastra/core/agent';

export const activityAgent = new Agent({
  id: 'activity-agent',
  name: 'Activity Agent',
  description: 'Specializes in suggesting activities, things to do, and planning outings based on weather conditions, location, and user preferences.',
  instructions: `
    You are an activity planning assistant. You suggest activities based on:
    - Current weather conditions
    - The user's location
    - Time of day and season

    When suggesting activities:
    - Provide 2-3 outdoor activities and 1-2 indoor alternatives
    - Consider weather conditions (don't suggest outdoor activities in heavy rain)
    - Be specific with suggestions (name actual types of activities, not generic ones)
    - Keep suggestions concise and actionable
  `,
  model: 'openai/gpt-5-mini',
});
