import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const xml = readFileSync(new URL('../../public/config.xml', import.meta.url), 'utf8');

describe('tizen/public/config.xml', () => {
  it('targets the tv-samsung profile with the required privileges', () => {
    expect(xml).toContain('<tizen:profile name="tv-samsung"/>');
    expect(xml).toContain('http://tizen.org/privilege/tv.inputdevice');
    expect(xml).toContain('http://tizen.org/privilege/internet');
    expect(xml).toContain('<content src="index.html"/>');
  });

  it('uses a 10-character alphanumeric package id matching the application id', () => {
    const match = /<tizen:application id="([A-Za-z0-9]{10})\.(\w+)" package="([A-Za-z0-9]+)"/.exec(
      xml,
    );
    expect(match).not.toBeNull();
    expect(match?.[3]).toBe(match?.[1]);
    expect(match?.[3]).toHaveLength(10);
  });
});
