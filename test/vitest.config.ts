/**
 * Vitest project `integration`: the cross-package tests in the repo-level `test/`
 * folder (headless game runs, input record/replay, lint rules, tooling and layout
 * invariants, root scripts). Run with `pnpm test:integration`; also part of
 * `pnpm test` and `pnpm test:all`.
 *
 * @module
 */
import { defineShmupProject } from '../vitest.shared.js';

// Repo-level integration tests: they live directly in this folder (test/**).
export default defineShmupProject('integration', { include: ['**/*.test.ts'] });
