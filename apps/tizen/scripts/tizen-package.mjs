#!/usr/bin/env node
/**
 * Signs and packages apps/tizen/dist into a .wgt with the Tizen CLI:
 *   tizen package -t wgt -s $TIZEN_PROFILE -- dist
 * Old .wgt files are removed first; the result is renamed without spaces (dist/ShmupCup.wgt).
 *
 * Usage: pnpm --filter @shmup/tizen build && TIZEN_PROFILE=<profile> pnpm --filter @shmup/tizen tizen:package
 * (PowerShell: $env:TIZEN_PROFILE="<profile>"; pnpm --filter @shmup/tizen tizen:package)
 * See tizen-env.mjs for all environment variables. Not run in CI.
 */
import {
  DIST_DIR,
  findWgt,
  installableWgt,
  removeWgts,
  requireBuild,
  requireEnv,
  run,
  tizenCli,
} from './tizen-env.mjs';

requireBuild();
/** Certificate profile used to sign the widget (required). */
const profile = requireEnv(
  'TIZEN_PROFILE',
  'name of the Tizen certificate profile (author + Samsung distributor certificate).',
);
removeWgts();
run(tizenCli(), ['package', '-t', 'wgt', '-s', profile, '--', DIST_DIR]);
/** The package the CLI wrote ("Shmup Cup.wgt"), or null. */
const wgt = findWgt();
console.log(
  `Packaged ${wgt === null ? '(no .wgt found)' : installableWgt(wgt)} in ${DIST_DIR}. Next: tizen:install`,
);
