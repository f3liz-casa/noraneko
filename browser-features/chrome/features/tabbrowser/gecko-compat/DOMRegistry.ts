// SPDX-License-Identifier: MPL-2.0

/**
 * DOM Registry - Bridging State to DOM
 *
 * Maintains a mapping between immutable State IDs and mutable DOM Elements.
 * This is essential for the Legacy Bridge to return actual XUL elements
 * to consumers expecting the old API.
 */

import type { TabId } from "../types/TabState.ts";

export class DOMRegistry {
  private static tabMap = new Map<TabId, Element>();
  private static browserMap = new Map<TabId, Element>();

  static registerTab(id: TabId, element: Element) {
    this.tabMap.set(id, element);
  }

  static unregisterTab(id: TabId) {
    this.tabMap.delete(id);
  }

  static getTab(id: TabId): Element | undefined {
    return this.tabMap.get(id);
  }

  static registerBrowser(id: TabId, element: Element) {
    this.browserMap.set(id, element);
  }

  static unregisterBrowser(id: TabId) {
    this.browserMap.delete(id);
  }

  static getBrowser(id: TabId): Element | undefined {
    return this.browserMap.get(id);
  }
}
