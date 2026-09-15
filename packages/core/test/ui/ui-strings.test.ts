/**
 * The UI string table (plan M2-16 acceptance "strings table covers every UI label"): the built-in
 * English table (every id non-empty, drawable by the bitmap font, within the length limit, one
 * `sfx.<cue>` name per SFX cue), `resolveUiText` (a content table over English, missing / bad
 * entries falling back), `formatUiText`, a **source scan** proving the scenes and the UI kit draw
 * no label that is not in the table, and a scene flow on a content table showing its words (the
 * title, the HUD, the Options screen, the rebind screen's actions).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadContent } from '../../src/data/index.js';
import { SFX_CUE_NAMES } from '../../src/events/index.js';
import { createGame } from '../../src/game/index.js';
import { Action, commitPlayerInput } from '../../src/input/index.js';
import { createHeadlessPlatform } from '../../src/platform/index.js';
import { DrawOp } from '../../src/presentation/index.js';
import { buildSceneLabels } from '../../src/scenes/index.js';
import {
  DEFAULT_UI_TEXT,
  MAX_UI_TEXT_LENGTH,
  UI_TEXT_IDS,
  formatUiText,
  resolveUiText,
} from '../../src/ui/index.js';

/** The characters of the bitmap font (`pixel6x8`): printable ASCII and a few symbols. */
const GLYPHS = /^[\x20-\x7e←↑→↓●★✕]+$/;

describe('core/ui string table (M2-16)', () => {
  it('holds every label, non-empty, drawable and short enough', () => {
    expect(UI_TEXT_IDS.length).toBeGreaterThan(250);
    for (const id of UI_TEXT_IDS) {
      const text = DEFAULT_UI_TEXT[id];
      expect(text, id).toMatch(GLYPHS);
      expect(text.length, id).toBeLessThanOrEqual(MAX_UI_TEXT_LENGTH);
    }
    for (const cue of SFX_CUE_NAMES) expect(UI_TEXT_IDS).toContain('sfx.' + cue);
    expect(DEFAULT_UI_TEXT['sfx.PlayerShot']).toBe('PLAYER SHOT');
    expect(Object.isFrozen(DEFAULT_UI_TEXT)).toBe(true);
  });

  it('resolves a content table over English, entry by entry', () => {
    expect(resolveUiText(null)).toBe(DEFAULT_UI_TEXT);
    expect(resolveUiText({})).toBe(DEFAULT_UI_TEXT);
    expect(resolveUiText({ pressOk: DEFAULT_UI_TEXT.pressOk })).toBe(DEFAULT_UI_TEXT);
    const text = resolveUiText({ pressOk: 'APPUYEZ SUR OK', hi: '', gameOver: 7, nope: 'X' });
    expect(text.pressOk).toBe('APPUYEZ SUR OK');
    expect(text.hi).toBe('HI');
    expect(text.gameOver).toBe('GAME OVER');
    expect(text.nope).toBeUndefined();
    expect(Object.keys(text)).toEqual(UI_TEXT_IDS);
  });

  it('fills templates', () => {
    expect(formatUiText(DEFAULT_UI_TEXT.zoneClear, 'B')).toBe('ZONE B CLEAR');
    expect(formatUiText(DEFAULT_UI_TEXT.rateFormat, 7.5)).toBe('7.5/S');
    expect(formatUiText('{0}-{1}-{0}', 'A', 2)).toBe('A-2-A');
    expect(formatUiText('{1}', 'A')).toBe('');
  });

  it('builds the scenes’ label lists from a table', () => {
    const labels = buildSceneLabels(resolveUiText({ difficultyHard: 'DIFFICILE', rank1: '1ER' }));
    expect(labels.difficulty).toEqual(['EASY', 'NORMAL', 'DIFFICILE', 'ARCADE']);
    expect(labels.hiScoreRanks[0]).toBe('1ER');
    expect(labels.rates).toEqual(['7.5/S', '10/S', '12/S', '15/S', '20/S', '30/S']);
    expect(labels.debounce.slice(0, 3)).toEqual(['AUTO', '0 TICKS', '1 TICKS']);
    expect(labels.sfx).toHaveLength(SFX_CUE_NAMES.length);
    expect(labels.actions.PowerUp).toBe('POWER-UP');
  });
});

/**
 * Strips comments from TypeScript source (block and line comments; strings are kept).
 *
 * @param source - The source.
 * @returns The code without comments.
 */
function stripComments(source: string): string {
  let out = '';
  let i = 0;
  let quote = '';
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (quote !== '') {
      out += c;
      if (c === '\\') {
        out += next ?? '';
        i += 2;
        continue;
      }
      if (c === quote) quote = '';
      i++;
      continue;
    }
    if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      i = end < 0 ? source.length : end + 2;
      continue;
    }
    if (c === '/' && next === '/') {
      const end = source.indexOf('\n', i);
      i = end < 0 ? source.length : end;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') quote = c;
    out += c;
    i++;
  }
  return out;
}

/**
 * Quoted literals that look like UI words: two or more upper-case letters in a row.
 *
 * @param code - Code without comments.
 * @returns The literals' texts.
 */
function uiWords(code: string): string[] {
  const out: string[] = [];
  for (const match of code.matchAll(/(['"`])((?:\\.|(?!\1).)*)\1/g)) {
    const text = match[2] ?? '';
    if (/[A-Z]{2,}/.test(text) && !/[a-z]/.test(text)) out.push(text);
  }
  return out;
}

describe('core/ui string table coverage (M2-16)', () => {
  it('the scenes and the UI kit draw no label outside the table', () => {
    const src = new URL('../../src/', import.meta.url);
    const files = [
      ...readdirSync(new URL('scenes/', src)).map((name) => `scenes/${name}`),
      'ui/index.ts',
    ];
    // Not labels: the name entry's glyph set and the HUD's meter label frames (art — the atlas's
    // `hud/meter-labels` frame names, replaced by art, never drawn as text).
    const allowed = new Set([
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-! ',
      'SPEED',
      'MISSILE',
      'DOUBLE',
      'LASER',
      'OPTION',
      'SPREAD',
      '2-WAY',
      'TORPEDO',
      'TAIL',
      'VERTICAL',
      'FREE WAY',
      'RIPPLE',
      'CYCLONE',
      'TWIN',
      // M3-01: the Extra Edit weapons' frames.
      'CONTROL',
      'UPPER',
      'SMALL SP',
      'HAWK',
      '2-WAY BK',
      'BACK DBL',
      'SPR GUN',
    ]);
    const found: string[] = [];
    for (const file of files) {
      const code = stripComments(readFileSync(new URL(file, src), 'utf8'));
      for (const word of uiWords(code)) if (!allowed.has(word)) found.push(`${file}: ${word}`);
    }
    expect(found).toEqual([]);
  });

  it('the meter label frames really are the atlas frames, not drawn text', () => {
    const code = readFileSync(new URL('../../src/ui/index.ts', import.meta.url), 'utf8');
    expect(code).toContain('export const METER_LABEL_FRAMES');
    expect(code).not.toMatch(/setString\([^)]*METER_LABEL_FRAMES/);
  });
});

describe('core/scenes on a content string table (M2-16)', () => {
  it('draws the content’s words: the title, the Options screen, the HUD', () => {
    const { db, issues } = loadContent([
      {
        path: 'strings/xx.strings.json',
        data: {
          formatVersion: 1,
          kind: 'strings',
          language: 'en',
          strings: {
            pressOk: 'APPUYEZ SUR OK',
            titleOptions: 'REGLAGES',
            optionsTitle: 'REGLAGES',
            optMaster: 'GENERAL',
            hi: 'RECORD',
          },
        },
      },
    ]);
    expect(issues).toEqual([]);
    const platform = createHeadlessPlatform();
    const game = createGame(platform, {}, db, { scenes: 'title' });
    const flow = game.scenes!;
    expect(flow.text.pressOk).toBe('APPUYEZ SUR OK');
    const texts = (): string[] => {
      const ui = game.renderFrame().ui;
      const out: string[] = [];
      for (let i = 0; i < ui.count; i++) {
        if (ui.op[i] === DrawOp.Text) out.push(ui.strings[ui.ref[i]]);
      }
      return out;
    };
    const player = platform.snapshot.players[0];
    const press = (action: number): void => {
      commitPlayerInput(player, action);
      game.step();
      commitPlayerInput(player, 0);
      game.step();
    };
    expect(texts()).toEqual(expect.arrayContaining(['APPUYEZ SUR OK', 'RECORD']));
    press(Action.Confirm);
    expect(texts()).toContain('REGLAGES');
    while (flow.title.menu.focus !== 3) press(Action.Down);
    press(Action.Confirm);
    expect(texts()).toEqual(expect.arrayContaining(['REGLAGES', 'GENERAL', 'MUSIC']));
    // The HUD: its words come from the table too.
    const hud = flow.game.hud;
    expect(hud.text.hi).toBe('RECORD');
  });
});
