// SPDX-License-Identifier: MPL-2.0
// Ported from tabbrowser.js L906~L974, L2897~L5086, L6178~L7019
// Section: addTab · removeTab/removeTabs · Tab Properties · Tab Movement

import type { TabbrowserCompat } from "../TabbrowserCompat.ts";
import { appState, selectedTab as selectedTabSignal, orderedTabs, send } from "../../state/store.ts";
import * as TabOps from "../../ops/tab-ops.ts";
import * as GroupOps from "../../ops/group-ops.ts";
import { DOMRegistry } from "../DOMRegistry.ts";
import { BrowserSystem } from "../BrowserSystem.ts";
import type { AppState, TabData, TabId, GroupId } from "../../types/TabState.ts";
import { resolveTabId, dispatch } from "../compat-helpers.ts";

/** @augments TabbrowserCompat */
declare module "../TabbrowserCompat.ts" {
  interface TabbrowserCompat {
    // Class fields used by this module
    _tabForBrowser: Map<any, any>;
    _removingTabs: Set<any>;
    tabAnimationsInProgress: number;
    // Methods
    addTab(uri: nsIURI | string, options?: any): any;
    addTrustedTab(uri: nsIURI | string, options?: any): any;
    addWebTab(uri: string, options?: any): any;
    loadTabs(uris: string[], options?: any): any;
    _beginRemoveTab(tab: MozTabbrowserTab, options?: any): boolean;
    _endRemoveTab(tab: MozTabbrowserTab): void;
    removeTab(tab: MozTabbrowserTab, options?: any): void;
    removeCurrentTab(options?: any): void;
    removeTabs(tabs: MozTabbrowserTab[], options?: any): void;
    removeAllTabsBut(keepTab: any, options?: any): void;
    closeTabsByURI(urisToClose: string[]): Promise<any>;
    pinTab(tab: MozTabbrowserTab): void;
    unpinTab(tab: MozTabbrowserTab): void;
    discardTab(tab: MozTabbrowserTab): void;
    showTab(tab: MozTabbrowserTab): void;
    hideTab(tab: MozTabbrowserTab): void;
    duplicateTab(tab: MozTabbrowserTab, options?: any): any;
    moveTabTo(tab: MozTabbrowserTab, options?: any): void;
    moveTabBefore(tab: MozTabbrowserTab, target: MozTabbrowserTab, metricsContext?: any): void;
    moveTabAfter(tab: MozTabbrowserTab, target: MozTabbrowserTab, metricsContext?: any): void;
    moveTabToStart(tab: MozTabbrowserTab): void;
    moveTabToEnd(tab: MozTabbrowserTab): void;
  }
}

export const methods = {
  // ==========================================================================
  // addTab
  // tabbrowser.js L2897~L5086
  // ==========================================================================

  /**
   * Create and open a new tab.
   *
   * Drop-in replacement for `gBrowser.addTab()` in tabbrowser.js.
   *
   * @param uri - URL to load (string, `nsIURI`, or anything with `.spec`)
   * @param options.userContextId        - Container (identity) to use
   * @param options.pinned               - Pin the tab on the left
   * @param options.inBackground         - Don't select the new tab
   * @param options.tabIndex             - Explicit insert position
   * @param options.insertAfterCurrent   - Insert after the current tab
   * @param options.insertRelatedAfterCurrent - Insert after opener
   * @param options.openerTab            - Tab that initiated the open
   * @param options.ownerTab             - Logical owner (used for selection on close)
   * @param options.createLazyBrowser    - Defer browser creation until tab is selected
   * @param options.remoteType           - Override remote process type
   * @returns The newly created tab element (or a stub when the element is not yet in DOM)
   */
  addTab(uri: nsIURI | string, options: any = {}) {
    const uriStr = typeof uri === "string" ? uri : uri?.spec || String(uri) || "about:blank";
    const id = crypto.randomUUID();

    const tabData = TabOps.createTab(id, uriStr, {
      userContextId: options.userContextId ?? 0,
      isPinned: options.pinned ?? false,
      title: options.title,
      label: options.label,
      permanentKey: {},
      ownerTabId: options.ownerTab ? resolveTabId(options.ownerTab) ?? undefined : undefined,
      openerTabId: options.openerTabId,
    });

    const insertAt = TabOps.calculateInsertionIndex(appState.value, {
      tabIndex: options.tabIndex,
      openerTabId: options.openerTabId,
      isPinned: options.pinned,
      insertAfterCurrent: options.insertAfterCurrent,
      insertRelatedAfterCurrent: options.insertRelatedAfterCurrent,
    });

    send({ type: "ADD_TAB", tab: tabData, index: insertAt });

    // Track _lastRelatedTabMap for opener
    if (options.openerTab) {
      this._lastRelatedTabMap.set(options.openerTab, DOMRegistry.getTab(id));
    }

    // Lazy browsers (tabbrowser.js _createLazyBrowser: a <browser> whose
    // docshell appears on first property access) are not ported yet, so
    // `createLazyBrowser` tabs are created eagerly. Session restore still
    // gets a tab; it just costs a docshell up front.
    {
      this._createBrowserDOM(id, { remoteType: options.remoteType, userContextId: options.userContextId });

      // Wire up progress listener for the new tab
      const tabEl = DOMRegistry.getTab(id);
      const browser = DOMRegistry.getBrowser(id) as any;
      if (tabEl && browser) {
        this._tabForBrowser.set(browser, tabEl);
        try { this._wireProgressListener(tabEl, browser); } catch (_) { /* */ }
      }
    }

    const tabEl = DOMRegistry.getTab(id);
    dispatch(tabEl ?? document, "TabOpen", options);
    if (tabEl && !options.inBackground && !options.bulkOrderedOpen) this.selectedTab = tabEl;
    return tabEl ?? this._tabStub(id);
  },

  /** Create a new tab with an implicitly trusted (system) principal. */
  addTrustedTab(uri: nsIURI | string, options: any = {}) {
    return this.addTab(uri, { ...options, trusted: true });
  },

  /** Open a URL in a new tab (alias for `addTab`). */
  addWebTab(uri: string, options: any = {}) {
    return this.addTab(uri, options);
  },

  /**
   * Opens multiple URIs as new tabs, optionally replacing `targetTab` with the first URI.
   *
   * @param uris - Ordered list of URLs to open.
   * @param options.replace    - Load the first URI into `targetTab` instead of a new tab.
   * @param options.targetTab  - Tab to reuse when `replace` is `true`.
   * @param options.inBackground - Keep focus on the current tab.
   * @param options.newIndex   - Explicit insertion index for the first new tab.
   * @returns Array of newly created (or reused) tab elements.
   */
  loadTabs(uris: string[], options: any = {}) {
    if (!uris.length) return [];

    const {
      allowInheritPrincipal,
      allowThirdPartyFixup,
      bulkOrderedOpen = false,
      charset,
      inBackground = false,
      newIndex,
      postDatas,
      replace = false,
      targetTab,
      triggeringPrincipal,
      userContextId,
    } = options;

    const tabs: any[] = [];

    if (replace && targetTab) {
      // Replace target tab with first URI
      const browser = this.getBrowserForTab(targetTab) as any;
      if (browser) {
        try {
          browser.loadURI(Services.io.newURI(uris[0]), {
            flags: Ci.nsIWebNavigation.LOAD_FLAGS_NONE,
            triggeringPrincipal: triggeringPrincipal ?? Services.scriptSecurityManager.getSystemPrincipal(),
            allowThirdPartyFixup,
          });
        } catch (_) { /* */ }
      }
      tabs.push(targetTab);
      uris = uris.slice(1);
    }

    // Load remaining URIs as new tabs
    for (let i = 0; i < uris.length; i++) {
      const tab = this.addTab(uris[i], {
        allowInheritPrincipal,
        allowThirdPartyFixup,
        bulkOrderedOpen,
        charset,
        inBackground: bulkOrderedOpen || (i < uris.length - 1) || inBackground,
        postData: postDatas?.[i],
        tabIndex: newIndex !== undefined ? newIndex + i : undefined,
        triggeringPrincipal,
        userContextId,
      });
      tabs.push(tab);
    }

    return tabs;
  },

  // ==========================================================================
  // removeTab / removeTabs
  // tabbrowser.js L5087~L5800
  // ==========================================================================

  _beginRemoveTab(tab: MozTabbrowserTab, options: any = {}): boolean {
    const id = resolveTabId(tab);
    if (!id || appState.value.tabs[id]?.isClosing) return false;
    this._removingTabs.add(tab);
    // tab.js keeps `closing` as a plain field; listeners (and our own
    // _tabAttrModified) look at it to leave a closing tab alone.
    (tab as any).closing = true;
    send({ type: "BEGIN_CLOSE_TAB", tabId: id });
    dispatch(tab, "TabClose", options);
    return true;
  },

  _endRemoveTab(tab: MozTabbrowserTab) {
    const id = resolveTabId(tab);
    if (!id) return;
    // Move the selection off the closing tab first (tabbrowser.js does this
    // before touching the DOM), so the deck never points at a removed panel.
    this._blurTab(tab);
    this._removingTabs.delete(tab);
    const browser = DOMRegistry.getBrowser(id);
    if (browser) {
      // An async switch may still be showing this browser; let the switcher
      // put up a spinner instead of a browser from the end of the deck.
      this._switcher?.onTabRemoved?.(tab);
      const panel = this.getPanel(browser);
      browser.remove();
      this._tabForBrowser.delete(browser);
      panel?.remove();
      DOMRegistry.unregisterBrowser(id);
    }
    // The <tab> itself was never taken out of the strip before.
    tab.remove();
    this.tabContainer._invalidateCachedTabs?.();
    DOMRegistry.unregisterTab(id);
    send({ type: "END_CLOSE_TAB", tabId: id });
  },

  /**
   * Close a tab, optionally with a CSS collapse animation.
   *
   * - Fires `TabClose` immediately.
   * - If `options.animate` is true the tab element shrinks via CSS transition;
   *   DOM removal happens in `_endRemoveTab` after `transitionend` (with a
   *   1-second fallback timeout).
   *
   * @param tab     - Tab element, tab stub, or tab ID string
   * @param options.animate         - Slide the tab closed with CSS
   * @param options.skipPermitUnload - Skip `beforeunload` check
   * @returns `true` when removal was initiated, `false` when the tab was not found
   */
  removeTab(tab: MozTabbrowserTab, options: any = {}) {
    const {
      animate,
      triggeringEvent,
      skipPermitUnload,
      skipSessionStore,
      isUserTriggered,
      telemetrySource,
      closeWindowWithLastTab,
    } = options;
    if (tab === (FirefoxViewHandler as any)?.tab) return;
    const el = typeof tab === "string" ? DOMRegistry.getTab(tab) : tab;
    if (!el) return false;
    if (!this._beginRemoveTab(el, options)) return false;

    if (!this._clearMultiSelectionLocked) {
      this.clearMultiSelectedTabs?.();
    }

    if (animate && !skipPermitUnload) {
      (el as any).style?.setProperty?.("max-width", "0.1px");
      this.tabAnimationsInProgress++;
      let transitionFired = false;
      const onTransitionEnd = () => {
        if (transitionFired) return;  // Prevent double-fire
        transitionFired = true;
        (el as any).removeEventListener?.("transitionend", onTransitionEnd);
        this.tabAnimationsInProgress--;
        this._endRemoveTab(el);
      };
      (el as any).addEventListener?.("transitionend", onTransitionEnd);
      // Fallback timeout in case transitionend doesn't fire
      setTimeout(() => {
        if (this._removingTabs.has(el) && !transitionFired) {
          transitionFired = true;
          (el as any).removeEventListener?.("transitionend", onTransitionEnd);
          this.tabAnimationsInProgress--;
          this._endRemoveTab(el);
        }
      }, 1000);
    } else {
      this._endRemoveTab(el);
    }
    return true;
  },

  /** Close the currently active tab. */
  removeCurrentTab(options: any = {}) {
    this.removeTab(this.selectedTab, options);
  },

  /**
   * Close multiple tabs sequentially.
   *
   * Each tab is removed via `removeTab`, which handles animation and
   * `beforeunload` prompts individually.
   * Multi-selection clearing is locked during the loop and performed once at the end.
   */
  removeTabs(tabs: MozTabbrowserTab[], options: any = {}) {
    this._clearMultiSelectionLocked = true;
    try {
      if (!options.skipGroupCheck) {
        const tabIds = new Set(tabs.map((t: any) => resolveTabId(t)).filter(Boolean));
        const state = appState.value;
        const groupsToRemove = new Map<string, string[]>();
        for (const id of tabIds) {
          const gid = state.tabs[id!]?.groupId;
          if (gid) {
            if (!groupsToRemove.has(gid)) groupsToRemove.set(gid, []);
            groupsToRemove.get(gid)!.push(id!);
          }
        }
        const wholeGroupIds: string[] = [];
        for (const [gid] of groupsToRemove) {
          const allGroupTabs = state.tabOrder.filter(id => state.tabs[id]?.groupId === gid);
          if (allGroupTabs.every(id => tabIds.has(id))) wholeGroupIds.push(gid);
        }
        for (const gid of wholeGroupIds) {
          const group = this.getTabGroupById?.(gid);
          if (group) {
            this.removeTabGroup(group, { ...options, skipGroupCheck: true });
            tabs = tabs.filter((t: any) => {
              const id = resolveTabId(t);
              return id ? state.tabs[id]?.groupId !== gid : true;
            });
          }
        }
      }
      for (const t of tabs) this.removeTab(t, options);
    } finally {
      this._clearMultiSelectionLocked = false;
      this._avoidSingleSelectedTab();
    }
  },

  /**
   * Closes every open tab except `keepTab`.
   *
   * By default, pinned, selected, and hidden tabs are also spared; pass
   * `options.skipPinnedOrSelectedTabs = false` to override.
   *
   * @param keepTab - The tab that should remain open.
   */
  removeAllTabsBut(keepTab: any, options: any = {}) {
    const keepId = resolveTabId(keepTab);
    const skipPinnedOrSelected = options.skipPinnedOrSelectedTabs ?? true;
    const selectedId = selectedTabSignal.value?.id;

    let filterFn: (tab: any) => boolean;
    if (skipPinnedOrSelected) {
      if ((keepTab as any)?.multiselected) {
        filterFn = (tab: any) => {
          const id = resolveTabId(tab);
          return !appState.value.tabs[id!]?.isMultiSelected
            && !appState.value.tabs[id!]?.isPinned
            && !appState.value.tabs[id!]?.isHidden;
        };
      } else {
        filterFn = (tab: any) => {
          const id = resolveTabId(tab);
          return id !== keepId
            && id !== selectedId  // Also exclude selectedTab when skipPinnedOrSelected is true
            && !appState.value.tabs[id!]?.isPinned
            && !appState.value.tabs[id!]?.isHidden;
        };
      }
    } else {
      filterFn = (tab: any) => resolveTabId(tab) !== keepId;
    }

    const tabsToRemove = [...this.openTabs].filter(filterFn);
    for (const tab of tabsToRemove) {
      this.removeTab(tab, options);
    }
  },

  /**
   * Closes all open tabs whose current URL matches one of the given URIs.
   *
   * @param urisToClose - List of URL strings to match against open tabs.
   */
  async closeTabsByURI(urisToClose: string[]) {
    const toRemove = TabOps.getTabsByURI(appState.value, urisToClose);
    for (const id of toRemove) {
      const el = DOMRegistry.getTab(id);
      if (el) this.removeTab(el);
    }
  },

  // ==========================================================================
  // Tab Properties (pinTab, unpinTab, etc.)
  // tabbrowser.js L906~L973
  // ==========================================================================

  /**
   * Pin a tab to the left side of the tab strip.
   * Fires a `TabPin` event and updates the `pinned` attribute.
   */
  pinTab(tab: MozTabbrowserTab) {
    if ((tab as any).pinned) return;
    this.showTab?.(tab);
    const id = resolveTabId(tab);
    if (id) send({ type: "PIN_TAB", tabId: id });
    dispatch(tab, "TabPin", { changed: ["pinned"] });
    this._updateTabBarForPinnedTabs?.();
  },

  /**
   * Unpin a previously pinned tab.
   * Fires a `TabUnpin` event and removes the `pinned` attribute.
   */
  unpinTab(tab: MozTabbrowserTab) {
    const id = resolveTabId(tab);
    if (id) send({ type: "UNPIN_TAB", tabId: id });
    dispatch(tab, "TabUnpin", { changed: ["pinned"] });
    this._updateTabBarForPinnedTabs?.();
    if ((tab as any)?.style) (tab as any).style.marginInlineStart = "";
  },

  /**
   * Preview a tab without permanently selecting it.
   * Simplified version — just selects the tab.
   */

  /**
   * Discard a tab's browser to free memory.
   * The tab remains in the strip; reloading restores the page.
   */
  discardTab(tab: MozTabbrowserTab) {
    const id = resolveTabId(tab);
    if (id) send({ type: "DISCARD_TAB", tabId: id });
  },

  /**
   * Make a previously hidden tab visible in the tab strip.
   * Selected/sharing tabs cannot be hidden, so showing is always safe.
   */
  showTab(tab: MozTabbrowserTab) {
    const id = resolveTabId(tab);
    if (id) send({ type: "SET_VISIBILITY", tabId: id, isVisible: true });
  },

  /**
   * Hide a tab from the tab strip without closing it.
   * Tabs that are selected or actively sharing (camera/mic/screen) are ignored.
   */
  hideTab(tab: MozTabbrowserTab) {
    const id = resolveTabId(tab);
    if (id) send({ type: "SET_VISIBILITY", tabId: id, isVisible: false });
  },

  /**
   * Duplicate a tab, inserting the copy immediately after the source.
   *
   * @param tab              - Tab to duplicate
   * @param options.inBackground - Keep the duplicate deselected
   * @returns Newly created tab element or stub
   */
  duplicateTab(tab: MozTabbrowserTab, options: any = {}) {
    const id = resolveTabId(tab);
    if (!id) return null;

    const prev = appState.value;
    send({ type: "DUPLICATE_TAB", tabId: id });
    const next = appState.value;

    const addedId = next.tabOrder.find(i => !prev.tabOrder.includes(i));
    if (!addedId) return null;

    this._createBrowserDOM(addedId, {});

    // Wire up progress listener for the new tab
    const tabEl = DOMRegistry.getTab(addedId);
    const browser = DOMRegistry.getBrowser(addedId) as any;
    if (tabEl && browser) {
      this._tabForBrowser.set(browser, tabEl);
      try { this._wireProgressListener(tabEl, browser); } catch (_) { /* */ }
    }

    const el = DOMRegistry.getTab(addedId);
    dispatch(el ?? document, "TabOpen", options);
    if (el && !options.inBackground) this.selectedTab = el;
    return el ?? this._tabStub(addedId);
  },

  // ==========================================================================
  // Tab Movement (moveTabTo, etc.)
  // tabbrowser.js L6461~L7019
  // ==========================================================================

  /**
   * Move a tab to an explicit position in the tab strip.
   *
   * Pinned tabs are clamped to the pinned region; unpinned tabs are clamped
   * after the last pinned tab.
   *
   * @param tab     - Tab to move
   * @param options - Number (legacy) or `{ tabIndex }` / `{ elementIndex }`
   */
  moveTabTo(tab: MozTabbrowserTab, options: any = {}) {
    const id = resolveTabId(tab);
    if (!id) return;
    const newIndex = typeof options === "number" ? options : (options.tabIndex ?? options.elementIndex);
    if (newIndex === undefined) return;
    send({ type: "MOVE_TAB", tabId: id, newIndex });
    const el = DOMRegistry.getTab(id);
    if (el) dispatch(el, "TabMove");
  },

  /** Move a tab to appear immediately before `target` in the tab strip. */
  moveTabBefore(tab: MozTabbrowserTab, target: MozTabbrowserTab, _metricsContext?: any) {
    const id = resolveTabId(tab);
    const tid = resolveTabId(target);
    if (!id || !tid) return;
    send({ type: "MOVE_TAB_RELATIVE", tabId: id, targetId: tid, position: "before" });
    const el = DOMRegistry.getTab(id);
    if (el) dispatch(el, "TabMove");
  },

  /** Move a tab to appear immediately after `target` in the tab strip. */
  moveTabAfter(tab: MozTabbrowserTab, target: MozTabbrowserTab, _metricsContext?: any) {
    const id = resolveTabId(tab);
    const tid = resolveTabId(target);
    if (!id || !tid) return;
    send({ type: "MOVE_TAB_RELATIVE", tabId: id, targetId: tid, position: "after" });
    const el = DOMRegistry.getTab(id);
    if (el) dispatch(el, "TabMove");
  },

  /** Move a tab to the first available position (after any pinned tabs). */
  moveTabToStart(tab: MozTabbrowserTab) {
    const id = resolveTabId(tab);
    if (!id) return;
    let pinnedCount = 0;
    for (const tid of appState.value.tabOrder) if (appState.value.tabs[tid].isPinned) pinnedCount++;
    send({ type: "MOVE_TAB", tabId: id, newIndex: appState.value.tabs[id].isPinned ? 0 : pinnedCount });
    const el = DOMRegistry.getTab(id);
    if (el) dispatch(el, "TabMove");
  },
  /** Move a tab to the very last position in the strip. */
  moveTabToEnd(tab: MozTabbrowserTab) {
    const id = resolveTabId(tab);
    if (!id) return;
    let pinnedCount = 0;
    for (const tid of appState.value.tabOrder) if (appState.value.tabs[tid].isPinned) pinnedCount++;
    send({ type: "MOVE_TAB", tabId: id, newIndex: appState.value.tabs[id].isPinned ? pinnedCount - 1 : appState.value.tabOrder.length - 1 });
    const el = DOMRegistry.getTab(id);
    if (el) dispatch(el, "TabMove");
  },
} satisfies Partial<TabbrowserCompat> & ThisType<TabbrowserCompat>;
