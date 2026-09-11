#!/usr/bin/env node
/**
 * Launches the installed app on the TV:
 *   [sdb connect $TV_IP]
 *   tizen run -p ShmpCupGam.ShmupCup [-s <serial>]
 *
 * Usage: TV_IP=192.168.1.50 pnpm --filter @shmup/tizen tizen:run
 * See tizen-env.mjs for all environment variables. Not run in CI.
 */
import { APP_ID, resolveTarget, run, tizenCli } from './tizen-env.mjs';

const target = resolveTarget();
run(tizenCli(), ['run', '-p', APP_ID, ...(target ? ['-s', target] : [])]);
