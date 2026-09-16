# content/strings/ — the UI string tables

Every label the canvas UI draws — the title's mode select, the menus, the Options screen and its
pages, the rebind and input-test screens, the end screens, the hi-score tables, the HUD's words —
by id, one file per language (plan M2-16 built the table, **M3-03** added the languages;
`shmup_feat.md` §21 "Localization via JSON string tables + bitmap font atlases"). Loaded by the
core's `data` module (kind `strings`, plan §3.5) and shown by `core/scenes` (`SceneFlow.text`).

`en.strings.json` holds exactly the built-in English table of `packages/core/src/ui/strings.ts`
(`DEFAULT_UI_TEXT`) — `pnpm content:check` keeps the two equal, and a source scan keeps every label
of the scenes and the UI kit in the table. A translation is a file `<language>.strings.json` with
the ids it translates; any id it leaves out falls back to English (`core/ui` `resolveUiText`).
Content text — zone and boss names, the story, the endings, the credits, weapon and input profile
labels — lives with that content, not here.

## The languages that ship

| File | Language | Script | Note |
|---|---|---|---|
| `en.strings.json` | English | ASCII | The built-in table; every other language falls back to it id by id |
| `es.strings.json` | Español | ASCII + `Á É Í Ó Ú Ñ Ü ¿ ¡` | |
| `ja.strings.json` | ニホンゴ | **katakana only** | No kanji, no hiragana — the way 1980s arcade hardware wrote Japanese |

> **These translations are placeholders, like the art and the music.** They were written by the
> build agent, not by a native speaker, and nobody has reviewed them. Treat them the way you treat
> `PLACEHOLDER_SHIP`: correct in shape, provisional in wording. A native-speaker pass is on the
> owner's list (plan §8.9,
> [`docs/client/outstanding-work.md`](../../docs/client/outstanding-work.md#13-decide-what-to-do-about-the-placeholder-spanish-and-japanese))
> and needs no code — it is an edit of these two files. The katakana **glyphs** are placeholder
> pixel art for the same reason ([`docs/dev/real-assets.md`](../../docs/dev/real-assets.md)).
>
> **A native speaker reviewing a file needs four things:** every id must stay answered; the fixed
> ids below must keep their English text; every character must be one the font draws (`UI_GLYPHS`);
> and a value must fit the width its screen gives the English — 6 px a character. `pnpm content:check`
> enforces the first three.

The player picks the language in **OPTIONS → DISPLAY → LANGUAGE**; the choice is stored in the save
(`options.display.language`) and is shown **from the next launch**, because the scene flow resolves
the table once, when it builds its screens. Adding a file here adds a row to that menu by itself
(`core/ui` `uiLanguageIds`): a language the game does not name in `UI_LANGUAGES` is offered under
its upper-cased id.

## Format (formatVersion 1)

```jsonc
{
  "formatVersion": 1,
  "kind": "strings",
  "language": "fr",                    // lower-case ISO 639-1, optionally -region (pt-br); one file per language
  "strings": {                         // UI string id → text (ids: core/ui UI_TEXT_IDS)
    "pressOk": "APPUYEZ SUR OK",       // 1–48 characters the bitmap font draws (core/ui UI_GLYPHS)
    "zoneCard": "ZONE {0}",            // {0} / {1}: values filled in by the screen (a zone label, a count …)
    "sfx.PlayerShot": "TIR"            // the sound test's names: sfx.<SFX_CUES name>
  }
}
```

## Rules the loader checks (`core/data`)

- every id must be a known UI string id — else `unknown UI string id "…"`;
- every text must use only the glyphs the bitmap font has (`core/ui` `UI_GLYPHS`: printable ASCII,
  `← ↑ → ↓ ● ★ ✕`, the Latin-1 capitals and the katakana subset) — else `uses a character the
  bitmap font does not have`. The font source and `UI_GLYPHS` are kept equal by
  `test/scripts/assets/font.test.ts`, so anything this accepts really can be drawn;
- a **fixed id** (`core/ui` `FIXED_UI_TEXT_IDS`) must keep its English text: the game's name, `HI`,
  `1P` / `2P`, `---`, `*`, `SMDLO?!` and the two-character HUD and power-meter codes. The HUD draws
  them in a few pixels of a bar it cannot grow, and the auto-order screen indexes `orderCodes`
  character by character. Listing one with its English text is fine; changing it is an issue;
- a language may have one file only.

Keep a translation within the width its screen gives the English text — the bitmap font is 6 px a
character and a line is 384 px, so 64 characters fill the screen and a menu value has far less. The
schema's own limit is 48 characters.

## Adding a language

1. Write `content/strings/<id>.strings.json` with **every** id (`pnpm content:check` requires full
   coverage for a shipped language — a gap would fall back to English mid-screen, which reads as a
   bug).
2. If it needs glyphs the font lacks, add them to `assets/source/fonts/pixel6x8.font.json` **and**
   to `UI_GLYPHS` in `packages/core/src/ui/strings.ts` in the same commit, then run `pnpm assets`.
   See [`docs/dev/asset-pipeline.md`](../../docs/dev/asset-pipeline.md) — "Katakana and the CJK
   budget" for what a real kanji set would cost.
3. Name it in `UI_LANGUAGES` (`packages/core/src/ui/strings.ts`) so the menu shows it in its own
   script rather than as an upper-cased id.
