/**
 * The browser-test instructions stay true to the Playwright config and CI (regression: M2-18
 * review round 1 — after the `firefox` project was added, the docs still said to install Chromium
 * only and still showed CI's old `pnpm test:e2e --shard=<i>/5` command):
 *
 * - every doc that explains `pnpm test:e2e` tells you to install the browsers of **every** Playwright
 *   project once (`pnpm exec playwright install --with-deps chromium firefox`) and how to run one
 *   engine (`--project=…`);
 * - the CI table of `docs/dev/build-test-deploy.md` lists every `pnpm` command `ci.yml` runs, as
 *   written there (a matrix shard as `<i>`), and names the `e2e-firefox` job; every `pnpm test:e2e`
 *   in that table picks a project, as CI does;
 * - both troubleshooting tables cover a missing Firefox.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file: string): string => readFileSync(join(repo, file), 'utf8');

const CONFIG = read('test/e2e/playwright.config.ts');
const CI = read('.github/workflows/ci.yml');
const BUILD_DOC = read('docs/dev/build-test-deploy.md');

/** The Playwright projects (their names are the browsers they need). */
const PROJECTS = [
  ...CONFIG.slice(CONFIG.indexOf('projects:')).matchAll(/^\s{6}name: '([a-z]+)',$/gm),
].map((match) => match[1]);

/** The docs that explain how to run `pnpm test:e2e`. */
const E2E_DOCS = [
  'docs/dev/build-test-deploy.md',
  'docs/dev/rendering-and-shell.md',
  'README.md',
  'docs/dev/repo-layout.md',
];

/**
 * The section of a Markdown document under a heading, up to the next heading of the same level.
 *
 * @param doc - The document.
 * @param heading - The heading line (`## CI`).
 * @returns The section's text.
 */
function section(doc: string, heading: string): string {
  const start = doc.indexOf(`\n${heading}\n`);
  expect(start, heading).toBeGreaterThanOrEqual(0);
  const level = heading.slice(0, heading.indexOf(' ') + 1);
  const end = doc.indexOf(`\n${level}`, start + heading.length + 2);
  return doc.slice(start, end < 0 ? doc.length : end);
}

describe('e2e docs match the Playwright projects (M2-18 review regression)', () => {
  it('finds the chromium and firefox projects in the config', () => {
    expect(PROJECTS).toEqual(['chromium', 'firefox']);
  });

  it('tells every reader to install the browsers of every project', () => {
    const install = `pnpm exec playwright install --with-deps ${PROJECTS.join(' ')}`;
    for (const doc of E2E_DOCS.slice(0, 3)) expect(read(doc), doc).toContain(install);
  });

  it('explains how to run one engine with --project', () => {
    for (const doc of E2E_DOCS.slice(0, 3)) {
      const text = read(doc);
      expect(text, doc).toMatch(/--project=chromium/);
      expect(text, doc).toMatch(/firefox/i);
    }
    // The repository map's command list says the determinism spec also runs in Firefox.
    const layout = read('docs/dev/repo-layout.md');
    const line = layout.split('\n').find((l) => l.startsWith('pnpm test:e2e'));
    expect(line).toMatch(/Firefox/);
  });

  it('covers a missing Firefox in both troubleshooting tables', () => {
    for (const doc of ['docs/dev/build-test-deploy.md', 'docs/dev/rendering-and-shell.md']) {
      expect(read(doc), doc).toMatch(/Executable doesn't exist … firefox/);
      expect(read(doc), doc).toContain('pnpm exec playwright install --with-deps firefox');
    }
  });
});

describe('the CI table of build-test-deploy.md matches ci.yml (M2-18 review regression)', () => {
  const table = section(BUILD_DOC, '## CI');
  /** Every `run: pnpm …` command of ci.yml, a matrix shard written as `<i>`. */
  const commands = [...CI.matchAll(/^\s+run: (pnpm .+)$/gm)].map((match) =>
    match[1].replace(/\$\{\{ matrix\.shard \}\}/g, '<i>').trim(),
  );

  it('reads the pnpm commands of ci.yml', () => {
    expect(commands).toContain('pnpm test:e2e --project=chromium --shard=<i>/5');
    expect(commands).toContain('pnpm test:e2e --project=firefox');
    expect(commands).toContain('pnpm exec playwright install --with-deps firefox');
  });

  it('lists every one of them as written', () => {
    for (const command of new Set(commands)) expect(table, command).toContain(`\`${command}\``);
  });

  it('names the e2e-firefox job, which ci.yml has', () => {
    expect(CI).toMatch(/^ {2}e2e-firefox:$/m);
    expect(table).toContain('`e2e-firefox`');
  });

  it('never shows an e2e command without a project, as CI never runs one', () => {
    const e2e = [...table.matchAll(/`(pnpm test:e2e[^`]*)`/g)].map((match) => match[1]);
    expect(e2e.length).toBeGreaterThanOrEqual(2);
    for (const command of e2e) expect(command, command).toMatch(/--project=(chromium|firefox)/);
    for (const command of commands.filter((c) => c.startsWith('pnpm test:e2e'))) {
      expect(command).toMatch(/--project=(chromium|firefox)/);
    }
  });

  it('describes the test concurrency the way CI shards it', () => {
    const concurrency = section(BUILD_DOC, '## Test concurrency');
    expect(concurrency).toContain('--project=chromium --shard=i/5');
    expect(concurrency).toContain('--project=firefox');
  });
});
