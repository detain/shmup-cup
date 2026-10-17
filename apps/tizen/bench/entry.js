/**
 * The TV render bench's page entry (plan R0-02). The bench builds use `apps/tizen/bench/` as their
 * Vite root (so the page lands as `dist-bench/index.html`); this one line pulls in the bench's
 * real entry from the app's sources, where it is type-checked, linted against Chrome 69 and
 * scanned by the Chromium 68 floor test like every other shipped file.
 */
import '../src/bench/main.ts';
