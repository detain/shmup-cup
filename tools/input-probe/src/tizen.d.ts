/**
 * Minimal ambient typings for the Tizen Web Device API and Samsung product APIs used by the probe.
 * Both globals are optional: they are absent in a desktop browser.
 *
 * Only the members the probe touches are declared; extend this file (not `any` casts) when the probe needs
 * more. Privileges required at runtime are declared in `public/config.xml`.
 */

/** A key from `tizen.tvinputdevice.getSupportedKeys()`. */
interface TizenInputDeviceKey {
  /** Tizen key name, e.g. `"ChannelUp"`. */
  readonly name: string;
  /** DOM `keyCode` the key produces once registered. */
  readonly code: number;
}

/** `tizen.tvinputdevice` (privilege `http://tizen.org/privilege/tv.inputdevice`). */
interface TizenTVInputDeviceManager {
  /** Lists every key the device can deliver to apps (arrows, OK and Back need no registration). */
  getSupportedKeys(): TizenInputDeviceKey[];
  /** Looks up one supported key by name (null when unknown). */
  getKey(keyName: string): TizenInputDeviceKey | null;
  /** Starts delivering the key's `keydown` / `keyup` to the app; throws a WebAPIException on failure. */
  registerKey(keyName: string): void;
  /** Stops delivering the key to the app. */
  unregisterKey(keyName: string): void;
  /** Registers several keys at once (optional API, not used by the probe: it hides per-key failures). */
  registerKeyBatch?(
    keyNames: string[],
    successCallback?: () => void,
    errorCallback?: (error: { name: string; message: string }) => void,
  ): void;
}

/** `tizen.application.getCurrentApplication()`. */
interface TizenApplication {
  /** Terminates the app. */
  exit(): void;
  /** Sends the app to the background. */
  hide(): void;
  /** Installed app metadata (from config.xml). */
  readonly appInfo: { readonly id: string; readonly version: string; readonly name: string };
}

/** `tizen` global. */
interface TizenGlobal {
  /** TV remote key registration. */
  readonly tvinputdevice?: TizenTVInputDeviceManager;
  /** Application lifecycle. */
  readonly application?: { getCurrentApplication(): TizenApplication };
  /** Device capabilities, e.g. `getCapability('http://tizen.org/feature/platform.version')`. */
  readonly systeminfo?: { getCapability(key: string): unknown };
}

/**
 * `webapis` global (Samsung, loaded from `$WEBAPIS/webapis/webapis.js`; privilege
 * `http://developer.samsung.com/privilege/productinfo` for `productinfo`).
 */
interface SamsungWebApis {
  /** Product information; every getter is optional because firmware versions differ. */
  readonly productinfo?: {
    /** Marketing model name. */
    getModel?(): string;
    /** Model code. */
    getModelCode?(): string;
    /** Firmware version string. */
    getFirmware?(): string;
    /** Real (hardware) model name. */
    getRealModel?(): string;
  };
}

/** Globals injected by the Tizen / Samsung web runtime. */
interface Window {
  /** Tizen Web Device API (undefined in a desktop browser). */
  tizen?: TizenGlobal;
  /** Samsung product APIs (undefined in a desktop browser or before `webapis.js` has loaded). */
  webapis?: SamsungWebApis;
}
