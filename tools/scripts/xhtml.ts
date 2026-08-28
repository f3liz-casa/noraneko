// SPDX-License-Identifier: MPL-2.0

import { DOMParser } from "linkedom";
import * as fs from "node:fs/promises";
import * as fss from "node:fs";
import * as path from "node:path";
// @ts-types="npm:@types/jszip"
import JSZip from "npm:jszip";

// Paths relative to binPath in the flat (unpackaged) layout
const BROWSER_XHTML_REL =
  "browser/chrome/browser/content/browser/browser.xhtml";
const PREFERENCES_XHTML_REL =
  "browser/chrome/browser/content/browser/preferences/preferences.xhtml";

// browser/omni.ja contains browser chrome files.
// Its internal paths are the above paths with the leading "browser/" stripped.
// Matches mozpack's OmniJarFormatter: entries are ZIP_STORED (zip -0DXqr).
const BROWSER_OMNI_JA = "browser/omni.ja";

function flatToOmniPath(relPath: string): string {
  const prefix = "browser/";
  if (!relPath.startsWith(prefix)) {
    throw new Error(`Path "${relPath}" does not start with "${prefix}"`);
  }
  return relPath.slice(prefix.length);
}

function modifyBrowserXHTML(content: string): string {
  const document = new DOMParser().parseFromString(content, "text/xml");

  // Older builds injected a <script data-geckomixin> here; the entry point is
  // now the browser-window-domcontentloaded category (see NoranekoWindow.sys.mts).
  for (const elem of document.querySelectorAll("[data-geckomixin]")) {
    elem.remove();
  }

  return document.toString();
}

function modifyPreferencesXHTML(content: string): string {
  const document = new DOMParser().parseFromString(content, "text/xml");
  const meta = document.querySelector("meta") as HTMLMetaElement;
  if (meta) {
    meta.setAttribute(
      "content",
      `default-src chrome: http://localhost:* ws://localhost:*; img-src chrome: moz-icon: https: blob: data:; style-src chrome: data: 'unsafe-inline'; object-src 'none'`,
    );
  }
  return document.toString();
}

/**
 * Apply XHTML modifications via the omni.ja route.
 * Reads browser/omni.ja once, applies all requested patches, then writes back.
 * omni.ja uses ZIP_STORED entries (no compression), matching mozpack's
 * OmniJarFormatter default ("zip -0DXqr").
 */
async function patchOmniJa(
  binPath: string,
  patches: Array<{ omniPath: string; transform: (content: string) => string }>,
): Promise<void> {
  const omniJaPath = path.join(binPath, BROWSER_OMNI_JA);
  const jarData = await fs.readFile(omniJaPath);
  const zip = await JSZip.loadAsync(jarData);

  for (const { omniPath, transform } of patches) {
    const entry = zip.file(omniPath);
    if (!entry) {
      throw new Error(`"${omniPath}" not found inside ${omniJaPath}`);
    }
    const content = await entry.async("string");
    // Use STORE (no compression) to match the original omni.ja format
    zip.file(omniPath, transform(content), { compression: "STORE" });
  }

  const updated = await zip.generateAsync({
    type: "uint8array",
    // STORE as default; individual overrides above take precedence
    compression: "STORE",
  });
  await fs.writeFile(omniJaPath, updated);
}

async function injectXHTML(binPath: string) {
  const flatPath = path.join(binPath, BROWSER_XHTML_REL);
  if (fss.existsSync(flatPath)) {
    const content = (await fs.readFile(flatPath)).toString();
    await fs.writeFile(flatPath, modifyBrowserXHTML(content));
  } else {
    await patchOmniJa(binPath, [
      {
        omniPath: flatToOmniPath(BROWSER_XHTML_REL),
        transform: modifyBrowserXHTML,
      },
    ]);
  }
}

async function injectXHTMLDev(binPath: string) {
  const flatPath = path.join(binPath, PREFERENCES_XHTML_REL);
  if (fss.existsSync(flatPath)) {
    const content = (await fs.readFile(flatPath)).toString();
    await fs.writeFile(flatPath, modifyPreferencesXHTML(content));
  } else {
    await patchOmniJa(binPath, [
      {
        omniPath: flatToOmniPath(PREFERENCES_XHTML_REL),
        transform: modifyPreferencesXHTML,
      },
    ]);
  }
}

if (import.meta.main) {
  const binPath = Deno.args[0];
  const isDev = Deno.args.includes("--dev");

  if (!binPath) {
    console.error("Error: binPath argument is required.");
    Deno.exit(1);
  }

  await injectXHTML(binPath);
  if (isDev) {
    await injectXHTMLDev(binPath);
  }
}
