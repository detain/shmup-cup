#!/usr/bin/env node
/**
 * Installs the packaged `.ipk` on a paired webOS TV:
 *   ares-install --device $WEBOS_DEVICE release/<app>.ipk
 *
 * Usage: WEBOS_DEVICE=<name> pnpm --filter @shmup/webos webos:install
 * **Never run in CI, and never yet run at all** (plan M3-03: no LG hardware).
 */
import { findIpk, installCommand, requireDevice, run } from './webos-env.mjs';

/** The device to install on (from `ares-setup-device`). */
const device = requireDevice();
/** The package to install. */
const ipk = findIpk();
if (ipk === null) {
  console.error(
    'No .ipk in apps/webos/release — run `pnpm --filter @shmup/webos webos:package` first.',
  );
  process.exit(1);
}
const { command, args } = installCommand(device, ipk);
run(command, args);
console.log(`Installed ${ipk} on ${device}. Next: webos:run`);
