/**
 * The `ares-*` wrapper scripts (plan M3-03). **They have never been run** — no LG hardware, no
 * webOS SDK — so what is testable is the command line each one would build and the guards that
 * stop it before it reaches a device.
 *
 * @module
 */
import { describe, expect, it } from 'vitest';
import {
  APP_ID,
  aresCli,
  installCommand,
  launchCommand,
  packageCommand,
} from '../../scripts/webos-env.mjs';

describe('webos ares wrappers (M3-03, never run)', () => {
  it('resolves the tools from PATH, or from ARES_BIN when it is set', () => {
    const previous = process.env.ARES_BIN;
    delete process.env.ARES_BIN;
    expect(aresCli('ares-package')).toBe('ares-package');
    process.env.ARES_BIN = '/opt/webOS_TV_SDK/CLI/bin';
    expect(aresCli('ares-package')).toBe('/opt/webOS_TV_SDK/CLI/bin/ares-package');
    if (previous === undefined) delete process.env.ARES_BIN;
    else process.env.ARES_BIN = previous;
  });

  it('packages dist/ into release/', () => {
    const { command, args } = packageCommand();
    expect(command).toMatch(/ares-package/);
    expect(args[1]).toBe('-o');
    expect(args[0]).toMatch(/apps[\\/]webos[\\/]dist$/);
    expect(args[2]).toMatch(/apps[\\/]webos[\\/]release$/);
  });

  it('installs and launches against a named device, by the appinfo id', () => {
    const install = installCommand('tv1', 'shmupcup_1.0.0_all.ipk');
    expect(install.command).toMatch(/ares-install/);
    expect(install.args.slice(0, 2)).toEqual(['--device', 'tv1']);
    expect(install.args[2]).toMatch(/release[\\/]shmupcup_1\.0\.0_all\.ipk$/);

    expect(launchCommand('tv1')).toMatchObject({ args: ['--device', 'tv1', APP_ID] });
    expect(APP_ID).toBe('dev.shmupcup.game');
  });
});
