import { defineShmupProject } from '../vitest.shared.js';

// Repo-level integration tests: they live directly in this folder (test/**).
export default defineShmupProject('integration', { include: ['**/*.test.ts'] });
