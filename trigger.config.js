import { defineConfig } from '@trigger.dev/sdk/v3';

export default defineConfig({
  project: 'eolys-assistant-edOi',
  runtime: 'node',
  logLevel: 'log',
  maxDuration: 300,
  dirs: ['./jobs'],
});
