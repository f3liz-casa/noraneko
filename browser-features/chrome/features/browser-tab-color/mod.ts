// SPDX-License-Identifier: MPL-2.0

/**
 * Browser Tab Color Module
 * Automatically theme the browser's tab bar based on the website's manifest theme_color.
 */

import { registerModule } from "@lib/core";
import { signal, effect } from "@preact/signals";
import { generateTabColorStyles } from "./ops.ts";

const PREF_ENABLE = "noraneko.tabcolor.enable";
const STYLE_ID = "floorp-toolbar-bgcolor";
const { ManifestObtainer } = ChromeUtils.importESModule(
  "resource://gre/modules/ManifestObtainer.sys.mjs",
);

// ============================================================================
// State
// ============================================================================

export const tabColorEnabled = signal(
  Services.prefs.getBoolPref(PREF_ENABLE, true),
);
export const toggleTabColor = () =>
  (tabColorEnabled.value = !tabColorEnabled.value);
export const setTabColorEnabled = (v: boolean) => (tabColorEnabled.value = v);

// ============================================================================
// Logic
// ============================================================================

async function updateTabColor() {
  const styleEl = document.getElementById(STYLE_ID);

  if (!tabColorEnabled.value) {
    styleEl?.remove();
    return;
  }

  try {
    const manifest = await ManifestObtainer.browserObtainManifest(
      window.gBrowser.selectedBrowser,
    );
    if (manifest?.theme_color) {
      if (styleEl) styleEl.remove();
      const el = document.createElement("style");
      el.id = STYLE_ID;
      el.textContent = generateTabColorStyles(manifest.theme_color);
      document.head?.appendChild(el);
    } else {
      styleEl?.remove();
    }
  } catch (e) {
    console.error("[tab-color] fetch error", e);
  }
}

export default registerModule(
  {
    name: "browser-tab-color",
    state: () => ({
      disposers: [] as (() => void)[],
    }),
    init(ctx) {
      // 1. Pref Sync
      const obs = {
        observe: () =>
          (tabColorEnabled.value = Services.prefs.getBoolPref(
            PREF_ENABLE,
            true,
          )),
      };
      Services.prefs.addObserver(PREF_ENABLE, obs);
      const disposeSig = effect(() =>
        Services.prefs.setBoolPref(PREF_ENABLE, tabColorEnabled.value),
      );

      // 2. Global API
      window.gFloorp ||= {};
      window.gFloorp.tabColor = {
        setEnable: setTabColorEnabled,
        toggle: toggleTabColor,
      };

      // 3. Events
      const onUpdate = () => updateTabColor();
      const progressListener = {
        onLocationChange: (_w, _r, _l, _f) => onUpdate(),
      } satisfies Pick<nsIWebProgressListener, "onLocationChange">;

      window.gBrowser.addTabsProgressListener(progressListener);
      window.gBrowser.tabContainer.addEventListener("TabSelect", onUpdate);

      // 4. Reactive Update
      const disposeUpdate = effect(() => {
        onUpdate();
      });

      // Store disposers
      ctx.state.disposers.push(() => {
        Services.prefs.removeObserver(PREF_ENABLE, obs);
        disposeSig();
        window.gBrowser.removeTabsProgressListener(progressListener);
        window.gBrowser.tabContainer.removeEventListener("TabSelect", onUpdate);
        disposeUpdate();
        document.getElementById(STYLE_ID)?.remove();

        // Cleanup global API
        if (window.gFloorp?.tabColor) {
          delete window.gFloorp.tabColor;
        }
      });
    },

    cleanup(ctx) {
      ctx.state.disposers.forEach((d) => d());
      ctx.state.disposers = [];
    },
  },
  import.meta,
);
