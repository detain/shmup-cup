/**
 * # scenes — scene stack / game state machine
 *
 * **Status: placeholder.** Declares the intended public API only; no game logic yet.
 *
 * **Responsibility.** The scene stack that sequences the whole game: Boot, Attract, Title, Mode / Ship /
 * Weapon select, Zone map, Game (sub-states StageIntro, Play, BossWarning, Boss,
 * StageClear, Death/Respawn, Continue, GameOver), NameEntry, HiScore, Ending, Credits,
 * with Pause and Options as overlays. Scenes read the same action snapshot as gameplay,
 * so remote, gamepad and keyboard all drive menus. Back-key semantics live here: pause in
 * game, back in menus, exit confirmation on the title (Tizen store requirement).
 *
 * **Implements.**
 * - shmup_feat.md §17 Screens, UI flow & HUD — scene flow
 * - shmup_feat.md §22 — scene stack / state machine
 * - shmup_feat.md §23 — Tizen Back key and exit confirmation
 *
 * **Intended public API.** The declarations below (and the `Planned` notes at the
 * end of the file) are the contract later steps implement.
 *
 * @module
 */
import type { InputSnapshot } from '../input/index.js';
import { defineModule } from '../module-info.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'scenes',
  status: 'placeholder',
  specRefs: ['shmup_feat.md §17', 'shmup_feat.md §22', 'shmup_feat.md §23'],
});

/** Scene identifiers. */
export type SceneId =
  | 'boot'
  | 'attract'
  | 'title'
  | 'select'
  | 'map'
  | 'game'
  | 'pause'
  | 'options'
  | 'nameEntry'
  | 'hiScore'
  | 'ending'
  | 'credits';

/** A scene on the stack. */
export interface Scene {
  readonly id: SceneId;
  /** Overlays (pause, options) let the scene below keep rendering. */
  readonly overlay: boolean;
  enter(): void;
  /** One simulation tick with this tick's input. */
  tick(input: InputSnapshot): void;
  exit(): void;
}

/** The scene stack. */
export interface SceneStack {
  readonly top: Scene | null;
  push(scene: Scene): void;
  pop(): void;
  replace(scene: Scene): void;
}
