/**
 * Runs a real production `vite build` of the probe into a temporary directory.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { build } from 'vite';

import { PROJECT_ROOT } from './project';

/** The files of one build. */
export interface BuiltProbe {
  dir: string;
  html: string;
  appJs: string;
}

/**
 * Builds the app with the project's vite.config.ts into `outDir`.
 *
 * @param reportUrl - value for `import.meta.env.VITE_REPORT_URL` (reporting off when omitted).
 */
export async function buildProbe(outDir: string, reportUrl?: string): Promise<BuiltProbe> {
  await build({
    root: PROJECT_ROOT,
    configFile: join(PROJECT_ROOT, 'vite.config.ts'),
    logLevel: 'silent',
    define: { 'import.meta.env.VITE_REPORT_URL': JSON.stringify(reportUrl ?? '') },
    build: { outDir, emptyOutDir: true },
  });
  return {
    dir: outDir,
    html: readFileSync(join(outDir, 'index.html'), 'utf8'),
    appJs: readFileSync(join(outDir, 'app.js'), 'utf8'),
  };
}
