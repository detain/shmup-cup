/**
 * # controls — the rebind screen's host side (M2-16)
 *
 * **Responsibility.** Implements the core scene flow's `ControlsSetup` (the Options screen's
 * REBIND KEYS / PAD and the rebind screen) over the app's input profiles and the input adapter:
 * the devices the player can rebind (the key profile in use and the gamepad profile, as the
 * content wrote them), the names of the keys each action has (with the player's rebinding), the
 * next key or button captured by the adapter (`@shmup/input-web` `WebInput.beginCapture`), and
 * the rebinding itself (`rebindAction` with its conflict detection, `resetBindings`) — every change
 * stored in the save's `options.input.bindings` and applied at once through the app's
 * `ShellInputProfiles.customize`.
 *
 * Nothing here runs per frame except {@link ShellControlsOptions.input}'s capture read in
 * `pollCapture` (a field read — no allocation); the rest are menu actions.
 *
 * **Implements.** shmup_feat.md §4 "[P1] Rebinding per device (keyboard / each gamepad / remote),
 * conflict detection, reset to defaults, persistence"; §21 "Controls: rebind".
 *
 * **Public API.** {@link createShellControls}, {@link ShellControlsOptions},
 * {@link ShellCaptureInput}, {@link ShellRebindProfiles}.
 *
 * @module
 */
import {
  CaptureStatus,
  RebindStatus,
  defineModule,
  type ActionName,
  type ControlsSetup,
  type InputContext,
  type InputOptions,
  type RebindDevice,
  type RebindOutcome,
  type SaveStore,
} from '@shmup/core';
import {
  actionTokens,
  bindingKeysLabel,
  captureToken,
  rebindAction,
  resetBindings,
  type CaptureKind,
  type CapturedInput,
  type InputProfile,
} from '@shmup/input-web';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'controls',
  status: 'implemented',
  specRefs: ['shmup_feat.md §4', 'shmup_feat.md §21'],
});

/** The capture part of the input adapter (`@shmup/input-web`'s `WebInput` has it). */
export interface ShellCaptureInput {
  /** The capture's state: a `core/ui` `CaptureStatus` and what was caught. */
  readonly capture: CapturedInput & { readonly status: number };
  /**
   * Starts a capture.
   *
   * @param kind - `'keys'` or `'buttons'`.
   */
  beginCapture(kind: CaptureKind): void;
  /** Ends the capture. */
  endCapture(): void;
}

/** The app's side of the rebinding (a part of `ShellInputProfiles`). */
export interface ShellRebindProfiles {
  /**
   * The profiles the player can rebind now, as the content wrote them (not customised): the key
   * profile in use, then the gamepad profile (either may be missing).
   *
   * @returns The profiles.
   */
  rebindable(): readonly InputProfile[];
  /**
   * Re-applies the player's input settings to the input adapter (the key and gamepad profiles
   * with the rebinding, SOCD and debounce of `settings` — `@shmup/input-web`
   * `customizeInputProfile`).
   *
   * @param settings - The save's `options.input`.
   */
  customize(settings: InputOptions): void;
}

/** Options of {@link createShellControls}. */
export interface ShellControlsOptions {
  /** The save the rebinding is stored in (`options.input.bindings`). */
  readonly save: SaveStore;
  /** The input adapter's capture. */
  readonly input: ShellCaptureInput;
  /** The app's profiles. */
  readonly profiles: ShellRebindProfiles;
}

/**
 * Creates the rebind screen's host side (the scene flow's `ControlsSetup`).
 *
 * @remarks
 * Devices are read from {@link ShellRebindProfiles.rebindable} on every call, so a profile the
 * player switched to in CONTROLS is the one rebound. A captured key is turned into a binding token
 * for the device's profile (`captureToken` — a button for a gamepad, a `code` on a keyboard, a key
 * code on a remote); one that does not fit gives `RebindStatus.Rejected`. A rebinding or a reset
 * that changes something replaces the save's options (written with the next `SaveStore.flush` — the
 * screen flushes when it closes) and calls {@link ShellRebindProfiles.customize}.
 *
 * @param options - The save, the adapter's capture and the app's profiles.
 * @returns The setup to hand `createGame(…, { controls })`.
 *
 * @example
 * ```ts
 * const controls = createShellControls({ save, input: webInput, profiles: appProfiles });
 * createGame(platform, config, content, { scenes: 'boot', save, controls });
 * ```
 */
export function createShellControls(options: ShellControlsOptions): ControlsSetup {
  const { save, input, profiles } = options;
  /**
   * A device's profile.
   *
   * @param device - Index into the rebindable profiles.
   * @returns The profile, or `null`.
   */
  const profileAt = (device: number): InputProfile | null => profiles.rebindable()[device] ?? null;
  /**
   * Stores new overrides in the save and applies them.
   *
   * @param bindings - The new overrides.
   */
  const store = (bindings: InputOptions['bindings']): void => {
    const current = save.options;
    save.setOptions({ ...current, input: { ...current.input, bindings } });
    profiles.customize(save.options.input);
  };
  return {
    devices(): readonly RebindDevice[] {
      const out: RebindDevice[] = [];
      for (const profile of profiles.rebindable())
        out.push({ id: profile.id, kind: profile.device });
      return out;
    },
    keysLabel(device: number, context: InputContext, action: ActionName): string {
      const profile = profileAt(device);
      if (profile === null) return '-';
      const override = save.options.input.bindings[profile.id];
      return bindingKeysLabel(actionTokens(profile, override, context, action));
    },
    beginCapture(device: number): void {
      const profile = profileAt(device);
      input.beginCapture(profile !== null && profile.device === 'gamepad' ? 'buttons' : 'keys');
    },
    pollCapture(): number {
      return input.capture.status;
    },
    endCapture(): void {
      input.endCapture();
    },
    bindCaptured(device: number, context: InputContext, action: ActionName): RebindOutcome {
      const profile = profileAt(device);
      if (profile === null || input.capture.status !== CaptureStatus.Captured) {
        return { status: RebindStatus.Rejected, other: null };
      }
      const token = captureToken(profile, input.capture);
      if (token === null) return { status: RebindStatus.Rejected, other: null };
      const bindings = save.options.input.bindings;
      const result = rebindAction(profile, bindings, context, action, token);
      if (result.overrides !== bindings) store(result.overrides);
      return { status: result.status, other: result.other };
    },
    reset(device: number, context: InputContext): void {
      const profile = profileAt(device);
      if (profile === null) return;
      const bindings = save.options.input.bindings;
      const next = resetBindings(bindings, profile.id, context);
      if (next !== bindings) store(next);
    },
  };
}
