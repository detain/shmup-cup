/**
 * Per-test-file setup: remove the temporary directories created through `helpers/project.ts`.
 */

import { afterAll } from 'vitest';

import { cleanupTempDirs } from './helpers/project';

afterAll(() => {
  cleanupTempDirs();
});
