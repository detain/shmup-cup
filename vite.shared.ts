/**
 * Settings shared by every Vite (apps) and Vitest (all projects) config.
 *
 * @module
 */
import { defaultClientConditions, defaultServerConditions } from 'vite';

/**
 * Custom package.json `exports` condition that points workspace packages at their
 * TypeScript sources (`src/index.ts`) instead of the built `dist/`. Keeps dev servers,
 * app builds and tests working without building packages first; `tsc` builds of the
 * packages disable it (`customConditions: []`) and use `dist/` types instead.
 */
export const SOURCE_CONDITION = '@shmup/source';

/** Browser-side resolve conditions with workspace sources first. */
export const clientConditions: string[] = [SOURCE_CONDITION, ...defaultClientConditions];

/** Node/SSR-side resolve conditions with workspace sources first. */
export const serverConditions: string[] = [SOURCE_CONDITION, ...defaultServerConditions];
