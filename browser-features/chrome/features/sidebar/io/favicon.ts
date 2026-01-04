// SPDX-License-Identifier: MPL-2.0
// Favicon fetching I/O

import type { Panel } from "../types/mod.ts";
import { STATIC_PANELS, type StaticPanelKey } from "../data/mod.ts";
import { getExtensionIcon } from "./extensions.ts";

const { PlacesUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/PlacesUtils.sys.mjs",
);

const DEFAULT_FAVICON = "chrome://devtools/skin/images/globe.svg";

const gFavicons = PlacesUtils.favicons as {
  getFaviconForPage: (uri: nsIURI) => Promise<{ uri: nsIURI }>;
};

/**
 * Get favicon URL for a panel (async I/O operation)
 */
export async function getFavicon(panel: Panel): Promise<string> {
  try {
    await globalThis.SessionStore.promiseInitialized;
    const url = panel.url ?? "";

    // Only attempt Places favicon lookup for regular web URLs
    if (
      panel.type !== "web" ||
      (!url.startsWith("http://") && !url.startsWith("https://"))
    ) {
      return getFallbackFavicon(panel);
    }

    const faviconURL = await fetchFromPlaces(url);
    return faviconURL ?? getFallbackFavicon(panel);
  } catch {
    return getFallbackFavicon(panel);
  }
}

/**
 * Fetch favicon from Places database
 */
async function fetchFromPlaces(url: string): Promise<string | undefined> {
  if (!url) return undefined;

  try {
    const uri = Services.io.newURI(url);
    const result = await gFavicons.getFaviconForPage(uri);
    return result.uri?.spec ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Get fallback favicon based on panel type
 */
function getFallbackFavicon(panel: Panel): string {
  switch (panel.type) {
    case "static": {
      const staticData = STATIC_PANELS[panel.url as StaticPanelKey];
      return staticData?.icon ?? DEFAULT_FAVICON;
    }
    case "extension":
      return getExtensionIcon(panel.extensionId ?? "") ?? DEFAULT_FAVICON;
    default:
      if (
        panel.url?.startsWith("http://") ||
        panel.url?.startsWith("https://")
      ) {
        return `https://www.google.com/s2/favicons?domain=${panel.url}&sz=32`;
      }
      return DEFAULT_FAVICON;
  }
}
