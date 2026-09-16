#!/usr/bin/env node
/**
 * Launches the installed app on a paired webOS TV:
 *   ares-launch --device $WEBOS_DEVICE dev.shmupcup.game
 *
 * Usage: WEBOS_DEVICE=<name> pnpm --filter @shmup/webos webos:run
 * **Never run in CI, and never yet run at all** (plan M3-03: no LG hardware). Inspect the running
 * app with `ares-inspect --device $WEBOS_DEVICE --app dev.shmupcup.game`.
 */
import { APP_ID, launchCommand, requireDevice, run } from './webos-env.mjs';

/** The device to launch on (from `ares-setup-device`). */
const device = requireDevice();
const { command, args } = launchCommand(device);
run(command, args);
console.log(`Launched ${APP_ID} on ${device}.`);
