#!/usr/bin/env node
/**
 * Packages apps/webos/dist into a `.ipk` with LG's webOS TV CLI:
 *   ares-package dist -o release
 *
 * Usage: pnpm --filter @shmup/webos build && pnpm --filter @shmup/webos webos:package
 * See webos-env.mjs for the environment variables. **Never run in CI, and never yet run at all**
 * (the project has no LG hardware or developer account — plan M3-03).
 */
import {
  RELEASE_DIR,
  findIpk,
  packageCommand,
  removeIpks,
  requireBuild,
  run,
} from './webos-env.mjs';

requireBuild();
removeIpks();
const { command, args } = packageCommand();
run(command, args);
/** The package the CLI wrote, or null. */
const ipk = findIpk();
console.log(`Packaged ${ipk ?? '(no .ipk found)'} in ${RELEASE_DIR}. Next: webos:install`);
