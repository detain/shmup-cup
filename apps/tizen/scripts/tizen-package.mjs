#!/usr/bin/env node
/**
 * Signs and packages apps/tizen/dist into a .wgt with the Tizen CLI:
 *   tizen package -t wgt -s $TIZEN_PROFILE -- dist
 *
 * Usage: pnpm --filter @shmup/tizen build && TIZEN_PROFILE=<profile> pnpm --filter @shmup/tizen tizen:package
 * (PowerShell: $env:TIZEN_PROFILE="<profile>"; pnpm --filter @shmup/tizen tizen:package)
 * See tizen-env.mjs for all environment variables. Not run in CI.
 */
import { DIST_DIR, findWgt, requireBuild, requireEnv, run, tizenCli } from './tizen-env.mjs';

requireBuild();
/** Certificate profile used to sign the widget (required). */
const profile = requireEnv(
  'TIZEN_PROFILE',
  'name of the Tizen certificate profile (author + Samsung distributor certificate).',
);
run(tizenCli(), ['package', '-t', 'wgt', '-s', profile, '--', DIST_DIR]);
console.log(`Packaged ${findWgt() ?? '(no .wgt found)'} in ${DIST_DIR}. Next: tizen:install`);
