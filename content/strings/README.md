# content/strings/ — the UI string tables

Every label the canvas UI draws — the title's mode select, the menus, the Options screen and its
pages, the rebind and input-test screens, the end screens, the hi-score tables, the HUD's words —
by id, one file per language (plan M2-16: the string-table infrastructure for M3's localization;
`shmup_feat.md` §21 "Localization via JSON string tables + bitmap font atlases"). Loaded by the
core's `data` module (kind `strings`, plan §3.5) and shown by `core/scenes` (`SceneFlow.text`).

The shipped game shows `en.strings.json`. It holds exactly the built-in English table of
`packages/core/src/ui/strings.ts` (`DEFAULT_UI_TEXT`) — `pnpm content:check` keeps the two equal,
and a source scan keeps every label of the scenes and the UI kit in the table. A translation is a
file `<language>.strings.json` with the ids it translates; any id it leaves out falls back to
English (`core/ui` `resolveUiText`). Content text — zone and boss names, the story, the endings,
the credits, weapon and input profile labels — lives with that content, not here.

## Format (formatVersion 1)

```jsonc
{
  "formatVersion": 1,
  "kind": "strings",
  "language": "fr",                    // lower-case ISO 639-1, optionally -region (pt-br); one file per language
  "strings": {                         // UI string id → text (ids: core/ui UI_TEXT_IDS)
    "pressOk": "APPUYEZ SUR OK",       // 1–48 characters of the bitmap font: printable ASCII and ← ↑ → ↓ ● ★ ✕
    "zoneCard": "ZONE {0}",            // {0} / {1}: values filled in by the screen (a zone label, a count …)
    "sfx.PlayerShot": "TIR"            // the sound test's names: sfx.<SFX_CUES name>
  }
}
```

Rules the loader checks (`core/data`): every id must be a known UI string id (`unknown UI string
id "…"`), every text must use only the bitmap font's glyphs (`pixel6x8`: printable ASCII and the
arrows / symbols it draws), and a language may have one file only. Keep a translation within the
width its screen gives the English text — the bitmap font is 6 px a character, 384 px a line.
