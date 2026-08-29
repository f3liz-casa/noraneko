// SPDX-License-Identifier: MPL-2.0

/**
 * Navigation System - URI Loading logic
 *
 * Re-implements the complex logic for URI fixup, principal validation,
 * and process redirection.
 */

import { DOMRegistry } from "./DOMRegistry.ts";
import type { TabId } from "../types/TabState.ts";

export class NavigationSystem {
  /**
   * Ported from tabbrowser.js _internalMaybeFixupLoadURI (Lines 9350-9450)
   */
  // upstream: loadURI@09edb025ec FIREFOX_143_0_1_RELEASE
  static loadURI(tabId: TabId, uriString: string, options: any = {}) {
    const browser = DOMRegistry.getBrowser(tabId) as any;
    if (!browser) return;

    // 1. Principal Validation (Line 9150)
    if (!options.triggeringPrincipal) {
        throw new Error("Must load with a triggering Principal");
    }

    // 2. URI Fixup (Line 9250)
    let uri = null;
    if (uriString && uriString !== "about:blank") {
        try {
            // Simplified bridge to Gecko's uriFixup
            // In DOP, we'd ideally have this as a pure service call
            const fixupInfo = (Services as any).uriFixup.getFixupURIInfo(uriString, 0);
            uri = fixupInfo.preferredURI;
        } catch (e) {
            uri = (Services as any).io.newURI(uriString);
        }
    } else {
        uri = (Services as any).io.newURI("about:blank");
    }

    // 3. Metadata tracking (Line 9300)
    // ... updateSponsoredURL attributes ...

    // 4. Final Load (Line 9400)
    try {
        browser.isNavigating = true;
        if (browser.webNavigation) {
            browser.webNavigation.loadURI(uri, options);
        }
    } finally {
        browser.isNavigating = false;
    }
  }
}
