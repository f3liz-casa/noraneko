// SPDX-License-Identifier: MPL-2.0

// Chrome bundle entry, built as a classic script (chrome://noraneko/content/core.js).
// NoranekoWindow.sys.mjs loads it into each browser window with loadSubScript
// from the `browser-window-domcontentloaded` category and calls start().

import { initScripts } from "#bridge-loader-features/loader/mod.ts";

type Eager = Record<string, unknown>;
const lazy = (map: Eager) =>
  Object.fromEntries(Object.entries(map).map(([k, m]) => [k, () => Promise.resolve(m)]));

export const features = lazy(import.meta.glob("./features/*/mod.ts", { eager: true }));
export const featuresLegacy = lazy(import.meta.glob("./features/*/index.ts", { eager: true }));
export const staticFeatures = lazy(import.meta.glob("./static/*/index.ts", { eager: true }));

export function start(): Promise<void> {
  return initScripts({
    common: [featuresLegacy, features],
    static: [staticFeatures],
  });
}

(window as unknown as { noraneko: { start: typeof start } }).noraneko = { start };
