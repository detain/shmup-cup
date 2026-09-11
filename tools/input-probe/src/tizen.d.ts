/**
 * Minimal ambient typings for the Tizen Web Device API and Samsung product APIs used by the probe.
 * Both globals are optional: they are absent in a desktop browser.
 */

/** A key from `tizen.tvinputdevice.getSupportedKeys()`. */
interface TizenInputDeviceKey {
  readonly name: string;
  readonly code: number;
}

/** `tizen.tvinputdevice`. */
interface TizenTVInputDeviceManager {
  getSupportedKeys(): TizenInputDeviceKey[];
  getKey(keyName: string): TizenInputDeviceKey | null;
  registerKey(keyName: string): void;
  unregisterKey(keyName: string): void;
  registerKeyBatch?(
    keyNames: string[],
    successCallback?: () => void,
    errorCallback?: (error: { name: string; message: string }) => void,
  ): void;
}

/** `tizen.application.getCurrentApplication()`. */
interface TizenApplication {
  exit(): void;
  hide(): void;
  readonly appInfo: { readonly id: string; readonly version: string; readonly name: string };
}

/** `tizen` global. */
interface TizenGlobal {
  readonly tvinputdevice?: TizenTVInputDeviceManager;
  readonly application?: { getCurrentApplication(): TizenApplication };
  readonly systeminfo?: { getCapability(key: string): unknown };
}

/** `webapis` global (Samsung, loaded from `$WEBAPIS/webapis/webapis.js`). */
interface SamsungWebApis {
  readonly productinfo?: {
    getModel?(): string;
    getModelCode?(): string;
    getFirmware?(): string;
    getRealModel?(): string;
  };
}

interface Window {
  tizen?: TizenGlobal;
  webapis?: SamsungWebApis;
}
