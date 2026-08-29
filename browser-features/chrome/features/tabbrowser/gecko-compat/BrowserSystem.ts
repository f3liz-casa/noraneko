// SPDX-License-Identifier: MPL-2.0

/**
 * Browser System - Engine Management
 *
 * Handles the imperative side effects of creating and managing 
 * the Gecko <browser> elements.
 */

import { DOMRegistry } from "./DOMRegistry.ts";
import type { TabId } from "../types/TabState.ts";

export class BrowserSystem {
  /**
   * Re-implementation of Tabbrowser.createBrowser (Lines 2250-2350)
   */
  // upstream: createBrowser@80031f59d1 FIREFOX_143_0_1_RELEASE
  static createBrowser(tabId: TabId, options: any = {}): Element {
    const doc = document;
    const browser = doc.createXULElement("browser");
    
    // Identity
    (browser as any)._tabId = tabId;
    (browser as any).permanentKey = {}; // In real Firefox this is an object from JSM global

    // Standard Attributes
    const attrs: Record<string, string> = {
      contextmenu: "contentAreaContextMenu",
      message: "true",
      messagemanagergroup: "browsers",
      tooltip: "aHTMLTooltip",
      type: "content",
      manualactiveness: "true",
      autocompletepopup: "PopupAutoComplete"
    };

    for (const [k, v] of Object.entries(attrs)) {
      browser.setAttribute(k, v);
    }

    if (options.remoteType) {
      browser.setAttribute("remote", "true");
      browser.setAttribute("remoteType", options.remoteType);
    }

    if (options.userContextId) {
      browser.setAttribute("usercontextid", options.userContextId.toString());
    }

    // Nesting (Lines 2330-2350)
    const stack = doc.createXULElement("stack");
    stack.className = "browserStack";
    stack.setAttribute("flex", "1");
    stack.appendChild(browser);

    const container = doc.createXULElement("vbox");
    container.className = "browserContainer";
    container.setAttribute("flex", "1");
    container.appendChild(stack);

    const sidebarContainer = doc.createXULElement("hbox");
    sidebarContainer.className = "browserSidebarContainer";
    sidebarContainer.setAttribute("flex", "1");
    sidebarContainer.appendChild(container);

    // Register with Bridge
    DOMRegistry.registerBrowser(tabId, browser);

    return sidebarContainer; // Return the outer-most container for insertion into panels
  }
}
