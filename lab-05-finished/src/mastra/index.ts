import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { Observability, DefaultExporter } from '@mastra/observability';
import { codingAgent } from './agents/coding-agent';
import { toolCallAccuracyScorer, completenessScorer, codeQualityScorer, safetyComplianceScorer } from './scorers/coding-scorers';

export const mastra = new Mastra({
  agents: { codingAgent },
  scorers: { toolCallAccuracyScorer, completenessScorer, codeQualityScorer, safetyComplianceScorer },
  storage: new LibSQLStore({
    id: 'mastra-storage',
    url: 'file:./mastra.db',
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'mastra',
        exporters: [
          new DefaultExporter(),
        ],
      },
    },
  }),
});
