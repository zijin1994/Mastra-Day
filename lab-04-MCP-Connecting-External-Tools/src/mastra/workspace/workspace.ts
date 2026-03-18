import { Workspace, LocalFilesystem, LocalSandbox } from '@mastra/core/workspace';

const WORKSPACE_PATH = process.env.WORKSPACE_PATH || './workspace';

export const workspace = new Workspace({
  id: 'codebuddy-workspace',
  filesystem: new LocalFilesystem({
    basePath: WORKSPACE_PATH,
  }),
  sandbox: new LocalSandbox({
    workingDirectory: WORKSPACE_PATH,
  }),
  skills: ['/skills'],
});
