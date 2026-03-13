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
