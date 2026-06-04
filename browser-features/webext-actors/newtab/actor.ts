// SPDX-License-Identifier: MPL-2.0

// newtab: feed privileged Activity Stream data (top sites, highlights) to the
// noraneko new tab page. Replaces the NRAboutNewTab JSActor.
//
// Firefox ships about:newtab itself as a built-in WebExtension; this mirrors
// the "deliver privileged data to the page" half. The page assets + about:
// registration stay where they are (NoranekoStartup / chrome://noraneko-newtab).

import {
  defineContent,
  defineParent,
  type ActorMeta,
} from "../_shared/defineActor.ts";

export const meta: ActorMeta = {
  id: "about-newtab@noraneko.app",
  version: "1.0.0",
  namespace: "noraNewTab",
  matches: ["about:home*", "about:welcome", "about:newtab*"],
  runAt: "document_start",
};

export const parent = defineParent({
  async getData(): Promise<{ topSites: unknown[]; highlights: unknown[] }> {
    try {
      const { NewTabUtils } = ChromeUtils.importESModule(
        "resource://gre/modules/NewTabUtils.sys.mjs",
      );
      const [topSites, highlights] = await Promise.all([
        NewTabUtils.activityStreamLinks.getTopSites({
          withFavicons: true,
          numItems: 16,
        }),
        NewTabUtils.activityStreamLinks.getHighlights({
          withFavicons: true,
          numItems: 16,
        }),
      ]);
      return { topSites: topSites ?? [], highlights: highlights ?? [] };
    } catch (e) {
      console.error("[noraneko] newtab: failed to load data:", e);
      return { topSites: [], highlights: [] };
    }
  },
});

export const content = defineContent<typeof parent>((parent) => {
  window.addEventListener("DOMContentLoaded", async () => {
    const data = await parent.getData();
    window.dispatchEvent(
      new window.CustomEvent("noranekoNewtabData", { detail: data }),
    );
  });
});
