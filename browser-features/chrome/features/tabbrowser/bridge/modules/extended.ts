// SPDX-License-Identifier: MPL-2.0
// Ported from tabbrowser.js L4163~L5800, L6577~L7705
// Section: Extended Ops · Tab Groups · Window Ops · Selection · UI · Progress Callbacks · Stubs · Sponsor

import type { TabbrowserCompat } from "../TabbrowserCompat.ts";
import { appState } from "../../state/store.ts";
import * as TabOps from "../../ops/tab-ops.ts";
import * as GroupOps from "../../ops/group-ops.ts";
import { DOMRegistry } from "../DOMRegistry.ts";
import { BrowserSystem } from "../BrowserSystem.ts";
import type { TabId, GroupId, SplitViewId } from "../../types/TabState.ts";
import { resolveTabId, dispatch } from "../compat-helpers.ts";

declare const SharingUtils: any;
declare const orderedTabs: { value: any[] };
declare const updateState: (fn: (d: any) => void) => void;

/** @augments TabbrowserCompat */
declare module "../TabbrowserCompat.ts" {
  interface TabbrowserCompat {
    // Extended Tab Operations
    _startRemoveTabs(tabs: MozTabbrowserTab[], options?: any): any;
    runBeforeUnloadForTabs(tabs: MozTabbrowserTab[]): Promise<boolean>;
    // Extended Tab Group Operations
    addTabGroup(tabsAndSplitViews: any[], options?: any): any;
    removeTabGroup(group: MozTabbrowserTabGroup, options?: any): Promise<void>;
    ungroupTabs(tabs: MozTabbrowserTab[]): void;
    ungroupSplitViews(splitView: any): void;
    moveSplitViewToNewGroup(splitView: any, options?: any): any;
    moveTabsToGroup(tabs: MozTabbrowserTab[], group: MozTabbrowserTabGroup): void;
    moveTabsToNewGroup(tabs: MozTabbrowserTab[], options?: any): any;
    moveTabsToSplitView(tabs: MozTabbrowserTab[], splitView: any): void;
    addTabsToSavedGroup(tabs: MozTabbrowserTab[], groupId: string): void;
    // Extended selection
    selectAllTabs(): void;
    multiselected: boolean;
    selectedTabs: any[];
    visibleTabsCount: number;
    // Extended window ops
    replaceGroupWithWindow(group: MozTabbrowserTabGroup): void;
    handleNewTabMiddleClick(event: Event): void;
    // Progress callbacks
    onStateChange(browser: XULBrowserElement, webProgress: any, request: any, stateFlags: number, status: number): void;
    onLocationChange(browser: XULBrowserElement, webProgress: any, request: any, location: any, flags: number): void;
    onProgressChange(browser: XULBrowserElement, webProgress: any, request: any, curProgress: number, maxProgress: number): void;
    onProgressChange64(browser: XULBrowserElement, webProgress: any, request: any, curProgress: number, maxProgress: number): void;
    onStatusChange(browser: XULBrowserElement, webProgress: any, request: any, status: number, message: string): void;
    onSecurityChange(browser: XULBrowserElement, webProgress: any, request: any, state: number): void;
    onContentBlockingEvent(browser: XULBrowserElement, webProgress: any, request: any, event: number): void;
    onRefreshAttempted(browser: XULBrowserElement, webProgress: any, refreshURI: any, millis: number, sameURI: boolean): void;
    refreshBlocked(browser: XULBrowserElement, webProgress: any, request: any, policy: number): void;
    _shouldShowProgress(request: any): boolean;
    _callProgressListeners(browser: XULBrowserElement, method: string, args: any[], context?: any): void;
    _forwardToProgressListeners(method: string, args: any[]): void;
    // Stubs & sponsor
    _tabStub(id: TabId): any;
    createUserContextMenu(event: Event, options?: any): any;
    createReopenInContainerMenu(tab: MozTabbrowserTab): any;
    showFullScreenViewContextMenuItems(menu: any): void;
    getTabPids(tab: MozTabbrowserTab): number[];
    shouldActivateDocShell(browser: XULBrowserElement): boolean;
    addNewBadge: any;
    moveTabToSplitView(tab: MozTabbrowserTab, svId?: SplitViewId): void;
    _wireProgressListener: any;
    _setupInitialBrowserAndTab: any;
    updateTitlebar: any;
  }
}

export const methods: Partial<TabbrowserCompat> & ThisType<TabbrowserCompat> = {
  // ==========================================================================
  // Extended Tab Operations & Lifecycle
  // noraneko extension — no direct tabbrowser.js equivalent
  // ==========================================================================

  _startRemoveTabs(tabs: MozTabbrowserTab[], options: {
    animate?: boolean;
    suppressWarnAboutClosingWindow?: boolean;
    skipPermitUnload?: boolean;
    skipRemoves?: boolean;
    skipSessionStore?: boolean;
    isUserTriggered?: boolean;
    telemetrySource?: string;
  } = {}): { beforeUnloadComplete: Promise<void>; tabsWithBeforeUnloadPrompt: any[]; lastToClose?: any } {
    const tabsWithBeforeUnloadPrompt: any[] = [];
    const beforeUnloadPromises: Promise<void>[] = [];
    let lastToClose: any = undefined;

    for (const tab of tabs) {
      const tabId = resolveTabId(tab);
      if (!tabId) continue;

      if (!options.skipRemoves && appState.value.selectedTabId === tabId) {
        lastToClose = tab;
      }

      const browser = DOMRegistry.getBrowser(tabId);
      if (!options.skipPermitUnload && browser?.isRemoteBrowser && (this as any)._hasBeforeUnload(tab)) {
        beforeUnloadPromises.push(
          browser.asyncPermitUnload?.("dontUnload").then(
            ({ permitUnload }: any) => {
              if (!permitUnload) {
                tabsWithBeforeUnloadPrompt.push(tab);
              } else if (!options.skipRemoves) {
                (this as any).removeTab(tab, { ...options, skipPermitUnload: true });
              }
            }
          ).catch((err: any) => console.error("asyncPermitUnload error:", err)) || Promise.resolve()
        );
      } else if (!options.skipRemoves) {
        (this as any).removeTab(tab, { ...options, skipPermitUnload: true });
      }
    }

    return {
      beforeUnloadComplete: Promise.all(beforeUnloadPromises).then(() => {}),
      tabsWithBeforeUnloadPrompt,
      lastToClose,
    };
  },

  /**
   * Runs `beforeunload` handlers for `tabs` without actually closing them.
   *
   * @returns `true` if any handler blocked the unload, `false` if it is safe
   *          to proceed with removal.
   */
  async runBeforeUnloadForTabs(tabs: MozTabbrowserTab[]): Promise<boolean> {
    try {
      const { beforeUnloadComplete, tabsWithBeforeUnloadPrompt } = (this as any)._startRemoveTabs(tabs, {
        animate: false,
        skipPermitUnload: false,
        skipRemoves: true,
      });

      await beforeUnloadComplete;

      // Run beforeunload handlers sequentially for tabs that require prompts
      for (const tab of tabsWithBeforeUnloadPrompt) {
        const browser = (this as any).getBrowserForTab(tab);
        if (browser) {
          const { permitUnload } = browser.permitUnload();
          if (!permitUnload) return true;
        }
      }
    } catch (e) {
      console.error("runBeforeUnloadForTabs error:", e);
    }
    return false;
  },

  /**
   * Discards the browsers for `tabs` after running their `beforeunload` handlers.
   *
   * Selects a new tab first when the active tab is among those being unloaded.
   */
  async explicitUnloadTabs(tabs: MozTabbrowserTab[]): Promise<void> {
    const unloadBlocked = await (this as any).runBeforeUnloadForTabs(tabs);
    if (unloadBlocked) return;

    let unloadSelectedTab = false;
    if (tabs.some((t: any) => resolveTabId(t) === appState.value.selectedTabId)) {
      unloadSelectedTab = true;
      const tabsToExclude = tabs.concat(orderedTabs.value.filter(t => !(t as any).linkedPanel));
      const newTab = (this as any)._findTabToBlurTo?.((this as any).selectedTab, tabsToExclude);
      if (newTab) {
        (this as any).selectedTab = newTab;
      }
    }

    await Promise.all(tabs.map((tab: any) => (this as any).prepareDiscardBrowser?.(tab) || Promise.resolve()));
    for (const tab of tabs) {
      (this as any).discardBrowser?.(tab, true);
    }
  },

  /**
   * Adopts `tab` from another window into this `gBrowser` instance.
   *
   * @param options.tabIndex  - Position at which to insert the adopted tab.
   * @param options.selectTab - If `true`, immediately selects the new tab.
   * @returns The newly created tab in this window, or `null` on failure.
   */
  adoptTab(tab: MozTabbrowserTab, options: {
    elementIndex?: number;
    tabIndex?: number;
    selectTab?: boolean;
  } = {}): any {
    const sourceWindow = tab?.ownerGlobal;
    if (sourceWindow === window || !tab) return null;

    try {
      const browser = tab.linkedBrowser;
      if (!browser) return null;

      // Create new tab to adopt the browser
      const newTab = (this as any).addTab("about:blank", {
        skipAnimation: true,
        tabIndex: options.tabIndex,
        adoptedTab: tab,
      });

      if (options.selectTab) {
        (this as any).selectedTab = newTab;
      }

      return newTab;
    } catch (e) {
      console.error("adoptTab failed:", e);
      return null;
    }
  },

  // ==========================================================================
  // Extended Tab Group Operations
  // noraneko extension — no direct tabbrowser.js equivalent
  // ==========================================================================

  /**
   * Create a new tab group from a set of tabs and/or split-view wrappers.
   *
   * This is the canonical way to create groups in the browser UI — it
   * creates the group state, assigns tabs, and fires `TabGroupCreated`.
   *
   * @param tabsAndSplitViews - Tabs or split-view wrapper elements to group
   * @param options.id        - Explicit group ID (generated if omitted)
   * @param options.color     - Color token (default `"blue"`)
   * @param options.label     - User-visible group label
   * @returns The new `TabGroupData` state object, or `null` on failure
   * @throws When called with an empty array
   */
  addTabGroup(tabsAndSplitViews: any[], options: {
    id?: string | null;
    color?: string | null;
    label?: string;
    insertBefore?: any;
    isAdoptingGroup?: boolean;
    isUserTriggered?: boolean;
    telemetryUserCreateSource?: string;
  } = {}): any {
    if (!tabsAndSplitViews?.length) {
      throw new Error("Cannot create tab group with zero tabs or split views");
    }

    const tabIds = tabsAndSplitViews
      .map((t: any) => resolveTabId(t))
      .filter((id): id is TabId => id !== null);

    if (!tabIds.length) return null;

    const groupId = options.id || GroupOps.generateLegacyId();
    const color = options.color || "blue";

    appState.value = GroupOps.createGroup(appState.value, groupId, options.label || "", color);
    appState.value = GroupOps.addTabsToGroup(appState.value, groupId, tabIds);

    const groupData = appState.value.groups[groupId];
    if (!groupData) return null;

    dispatch((this as any).window.document, "TabGroupCreated", { groupId });
    return groupData;
  },

  /**
   * Remove all tabs in a group and delete the group.
   *
   * Runs `beforeunload` handlers first; if any handler cancels, the removal
   * is aborted.
   *
   * @param group - Group object or `{ id }` with the group ID
   */
  async removeTabGroup(group: MozTabbrowserTabGroup, options: {
    animate?: boolean;
    skipPermitUnload?: boolean;
    skipGroupCheck?: boolean;
    isUserTriggered?: boolean;
    telemetrySource?: string;
  } = {}): Promise<void> {
    const groupId = group?.id;
    if (!groupId) return;

    const groupData = appState.value.groups[groupId];
    if (!groupData) return;

    const tabs = groupData.tabs.map((id: any) => (this as any)._tabStub(id));
    const cancel = await (this as any).runBeforeUnloadForTabs(tabs);
    if (cancel) return;

    (this as any).removeTabs(tabs, { ...options, skipGroupCheck: true });
  },

  /** Remove a set of tabs from their groups (in reverse order for safe DOM mutation). */
  ungroupTabs(tabs: MozTabbrowserTab[]): void {
    for (let i = tabs.length - 1; i >= 0; i--) {
      (this as any).ungroupTab(tabs[i]);
    }
  },

  /**
   * Remove every tab in a split view from its tab group.
   * Each tab is individually ungrouped via `ungroupSplitView`.
   *
   * @param splitView - The split-view-wrapper element or a split view data object
   */
  ungroupSplitViews(splitView: MozSplitView): void {
    if (!splitView) return;
    // Normalise to the wrapper element when given a state object
    const wrapper = (this as any).isSplitViewWrapper(splitView) ? splitView : null;
    if (!wrapper) return;
    (this as any).ungroupSplitView(wrapper);
  },

  /**
   * Create a new tab group that wraps all tabs in the given split view.
   *
   * @param splitView - The split-view-wrapper element to group
   * @param options   - Forwarded to `addTabGroup` (color, label, isUserTriggered, …)
   * @returns The new tab group data, or `null` if creation failed
   */
  moveSplitViewToNewGroup(splitView: any, options: any = {}): any {
    if (!splitView) return null;
    const svId: SplitViewId | undefined = splitView.splitViewId ?? splitView.id;
    const svData = svId ? appState.value.splitViews[svId] : null;

    // Collect tabs from the split view wrapper or state
    const tabs: any[] = svData
      ? svData.tabs.map((id: any) => DOMRegistry.getTab(id) ?? (this as any)._tabStub(id))
      : (Array.isArray(splitView.tabs) ? Array.from(splitView.tabs) : []);

    if (!tabs.length) return null;
    return (this as any).addTabGroup(tabs, { ...options, isUserTriggered: true });
  },

  /**
   * Move multiple tabs into an existing tab group.
   * Fires `TabGrouped` on each affected tab element.
   *
   * @param tabs  - Tabs to move
   * @param group - Target group object (must have an `.id`)
   */
  moveTabsToGroup(tabs: MozTabbrowserTab[], group: MozTabbrowserTabGroup): void {
    const groupId = group?.id;
    if (!groupId) return;

    const tabIds = tabs.map(t => resolveTabId(t)).filter((id): id is TabId => id !== null);
    if (!tabIds.length) return;

    appState.value = GroupOps.addTabsToGroup(appState.value, groupId, tabIds);
    for (const id of tabIds) {
      const el = DOMRegistry.getTab(id);
      if (el) dispatch(el, "TabGrouped");
    }
  },

  /**
   * Create a brand-new group from the given tabs (user-triggered convenience
   * wrapper around `addTabGroup`).
   */
  moveTabsToNewGroup(tabs: MozTabbrowserTab[], options: any = {}): any {
    return (this as any).addTabGroup(tabs, { ...options, isUserTriggered: true });
  },

  /**
   * Move tabs into an existing split view.
   *
   * Each pinned tab is skipped (split view does not support pinned tabs).
   * State is updated via `GroupOps.addTabToSplitView` and the corresponding
   * DOM element is moved into the wrapper if available.
   *
   * @param tabs      - Tabs to add to the split view
   * @param splitView - The split-view-wrapper element or SplitViewData
   */
  moveTabsToSplitView(tabs: MozTabbrowserTab[], splitView: any): void {
    if (!splitView || !tabs?.length) return;
    const svId: SplitViewId | undefined = splitView.splitViewId ?? splitView.id;
    if (!svId || !appState.value.splitViews[svId]) return;
    for (const tab of tabs) {
      if ((tab as any).pinned) continue;
      const tabId = resolveTabId(tab);
      if (!tabId) continue;
      appState.value = GroupOps.addTabToSplitView(appState.value, svId, tabId);
      // Move DOM element into the wrapper when available
      try {
        if ((this as any).isSplitViewWrapper(splitView)) {
          splitView.appendChild(tab);
        }
      } catch (_) { /* */ }
      (this as any).removeFromMultiSelectedTabs(tab);
    }
  },

  /**
   * Persists `tabs` into a previously saved tab group via SessionStore.
   *
   * @param groupId - ID of the saved group to add the tabs to.
   */
  addTabsToSavedGroup(tabs: MozTabbrowserTab[], groupId: string): void {
    try {
      SessionStore?.addTabsToSavedGroup?.(groupId, tabs);
    } catch (e) {
      console.error("addTabsToSavedGroup failed:", e);
    }
  },

  /**
   * Reopens `tab` in a different container (user-context).
   *
   * Closes the original tab and opens the same URL in a new tab assigned to
   * `userContextId`.
   */
  reopenInContainer(tab: MozTabbrowserTab, userContextId: number): void {
    const tabId = resolveTabId(tab);
    if (!tabId) return;

    const tabData = appState.value.tabs[tabId];
    const browser = DOMRegistry.getBrowser(tabId);
    if (!tabData || !browser) return;

    try {
      const triggeringPrincipal = browser.contentPrincipal || Services.scriptSecurityManager.getSystemPrincipal();
      const newTab = (this as any).addTab(tabData.uri || "about:blank", {
        userContextId,
        pinned: tabData.isPinned,
        tabIndex: appState.value.tabOrder.indexOf(tabId) + 1,
        triggeringPrincipal,
      });

      if (appState.value.selectedTabId === tabId) {
        (this as any).selectedTab = newTab;
      }

      (this as any).removeTab(tab);
    } catch (e) {
      console.error("reopenInContainer failed:", e);
    }
  },

  /**
   * Populates the "Reopen in Container" context menu for `tab`.
   *
   * Excludes the container the tab is already using.
   */
  createReopenInContainerMenu(tab: any): void {
    try {
      createUserContextMenu?.(event, {
        isContextMenu: true,
        excludeUserContextId: tab?.getAttribute?.("usercontextid"),
      });
    } catch (e) {
      console.error("createReopenInContainerMenu failed:", e);
    }
  },

  /**
   * Duplicates all currently selected tabs, placing each copy after the originals.
   */
  duplicateSelectedTabs(): void {
    const tabs = (this as any).selectedTabs;
    let newIndex = tabs[tabs.length - 1]?._tPos + 1;

    for (const tab of tabs) {
      try {
        const newTab = SessionStore?.duplicateTab?.(window, tab);
        if (newTab) {
          (this as any).moveTabTo(newTab, { tabIndex: newIndex++ });
        }
      } catch (e) {
        console.error("duplicateSelectedTabs failed for tab:", e);
      }
    }
  },

  // ==========================================================================
  // Extended Tab Selection & Multi-Select
  // noraneko extension — no direct tabbrowser.js equivalent
  // ==========================================================================

  /**
   * Closes all currently multi-selected tabs after an optional close-warning dialog.
   */
  removeMultiSelectedTabs(options: { isUserTriggered?: boolean; telemetrySource?: string } = {}): void {
    const selectedTabs = (this as any).selectedTabs;
    if (!(this as any).warnAboutClosingTabs?.((selectedTabs as any[]).length, (this as any).closingTabsEnum?.MULTI_SELECTED)) {
      return;
    }
    (this as any).removeTabs(selectedTabs, options);
  },

  // ==========================================================================
  // Extended Window Operations
  // noraneko extension — no direct tabbrowser.js equivalent
  // ==========================================================================

  /**
   * Returns the bounding rectangle of the tab strip adjusted for RTL layouts.
   *
   * @returns A `{ top, bottom, left, right }` rect, or `null` when layout
   *          information is unavailable.
   */
  getMouseTargetRect(): any {
    const container = (this as any).tabContainer?.parentNode;
    if (!container) return null;

    try {
      const panelRect = window.windowUtils?.getBoundsWithoutFlushing((this as any).tabContainer);
      const containerRect = window.windowUtils?.getBoundsWithoutFlushing(container);
      if (!panelRect || !containerRect) return null;

      return {
        top: panelRect.top,
        bottom: panelRect.bottom,
        left: RTL_UI ? containerRect.right - panelRect.width : containerRect.left,
        right: RTL_UI ? containerRect.right : containerRect.left + panelRect.width,
      };
    } catch {
      return null;
    }
  },

  // ==========================================================================
  // Extended UI & Tooltips
  // noraneko extension — no direct tabbrowser.js equivalent
  // ==========================================================================

  /**
   * Adds a "new" badge attribute to the tab element for visual indication.
   */
  addNewBadge(tab: MozTabbrowserTab): void {
    const tabEl = DOMRegistry.getTab(resolveTabId(tab) || "");
    if (tabEl) {
      try {
        tabEl.setAttribute("badge", "new");
      } catch (e) {
        console.error("addNewBadge failed:", e);
      }
    }
  },

  /**
   * Resolves the context tab from the popup menu's trigger node.
   *
   * Sets `this.contextTab` to the nearest enclosing tab element, or falls
   * back to the selected tab.
   */
  updateContextMenu(popupMenu: any): void {
    // Context menu handling - delegated to runtime
    try {
      const triggerTab = popupMenu?.triggerNode?.tab || popupMenu?.triggerNode?.closest?.("tab");
      (this as any).contextTab = triggerTab || (this as any).selectedTab;
    } catch (e) {
      console.error("updateContextMenu failed:", e);
    }
  },

  _updateToggleMuteMenuItems(tabs: MozTabbrowserTab[]): void {
    // Menu item updates - delegated to runtime
  },

  _updateMultiselectedTabCloseButtonTooltip(): void {
    const tabCount = (this as any).selectedTabs.length;
    for (const tab of (this as any).selectedTabs) {
      try {
        const closeButton = tab?.querySelector?.(".tab-close-button");
        if (closeButton) {
          document.l10n?.setArgs?.(closeButton, { tabCount });
        }
      } catch (e) {
        // Ignore
      }
    }
  },

  // ==========================================================================
  // Progress Listener Callbacks
  // tabbrowser.js L8505~L8810
  // ==========================================================================

  _forwardToProgressListeners(method: string, args: any[]): void {
    for (const l of (this as any).mProgressListeners) {
      try { (l as any)[method]?.(...args); }
      catch (e) { console.error(`Progress listener ${method} error:`, e); }
    }
  },

  /** Forwards a location-change progress event to all registered progress listeners. */
  onLocationChange(...a: any[]): void { (this as any)._forwardToProgressListeners("onLocationChange", a); },
  /** Forwards a state-change progress event to all registered progress listeners. */
  onStateChange(...a: any[]): void { (this as any)._forwardToProgressListeners("onStateChange", a); },
  /** Forwards a progress-change event to all registered progress listeners. */
  onProgressChange(...a: any[]): void { (this as any)._forwardToProgressListeners("onProgressChange", a); },
  /** Forwards a 64-bit progress-change event; delegates to `onProgressChange`. */
  onProgressChange64(...a: any[]): void { (this as any).onProgressChange(...a); },
  /** Forwards a status-change event to all registered progress listeners. */
  onStatusChange(...a: any[]): void { (this as any)._forwardToProgressListeners("onStatusChange", a); },
  /** Forwards a security-state change event to all registered progress listeners. */
  onSecurityChange(...a: any[]): void { (this as any)._forwardToProgressListeners("onSecurityChange", a); },
  /** Forwards a content-blocking event to all registered progress listeners. */
  onContentBlockingEvent(...a: any[]): void { (this as any)._forwardToProgressListeners("onContentBlockingEvent", a); },

  /**
   * Notifies progress listeners of a meta-refresh or `Refresh` header attempt.
   *
   * @returns `false` if any listener vetoes the refresh, `true` to allow it.
   */
  onRefreshAttempted(...a: any[]): boolean {
    for (const l of (this as any).mProgressListeners) {
      try { if ((l as any).onRefreshAttempted?.(...a) === false) return false; }
      catch (e) { console.error("Progress listener onRefreshAttempted error:", e); }
    }
    return true;
  },

  // ==========================================================================
  // Extended Utility Methods
  // noraneko extension — no direct tabbrowser.js equivalent
  // ==========================================================================

  /**
   * Handles pointer-enter events on the tab strip (delegated to the runtime).
   */
  onMouseEnter(event: Event): void {
    // Mouse tracking - delegated to runtime
  },

  /**
   * Handles pointer-leave events on the tab strip (delegated to the runtime).
   */
  onMouseLeave(event: Event): void {
    // Mouse tracking - delegated to runtime
  },

  /**
   * Closes the context tab, or all multi-selected tabs if the context tab is
   * part of a multi-selection.
   */
  closeContextTabs(button?: any, tab?: any): void {
    const tabs = (this as any).contextTab?.multiselected ? (this as any).selectedTabs : [(this as any).contextTab];
    (this as any).removeMultiSelectedTabs({
      isUserTriggered: true,
      telemetrySource: "tab_context_menu",
    });
  },

  // ==========================================================================
  // Stubs for full compat surface
  // stub implementations
  // ==========================================================================

  _tabStub(id: TabId): any {
    const self = this as any;
    // Lazy tab element lookup to avoid stale references
    const getTabEl = () => DOMRegistry.getTab(id);
    
    return {
      _tabId: id,
      get linkedBrowser() { return DOMRegistry.getBrowser(id); },
      get permanentKey() { return appState.value.tabs[id]?.permanentKey ?? DOMRegistry.getBrowser(id)?.permanentKey ?? {}; },
      set permanentKey(v: any) { 
        const b = DOMRegistry.getBrowser(id);
        if (b) b.permanentKey = v;
        updateState(d => { if (d.tabs[id]) d.tabs[id].permanentKey = v; });
      },
      getAttribute: (n: string) => getTabEl()?.getAttribute?.(n) ?? null,
      setAttribute: (n: string, v: any) => getTabEl()?.setAttribute?.(n, v),
      removeAttribute: (n: string) => getTabEl()?.removeAttribute?.(n),
      hasAttribute: (n: string) => getTabEl()?.hasAttribute?.(n) ?? false,
      toggleAttribute: (n: string, force?: boolean) => getTabEl()?.toggleAttribute?.(n, force),
      dispatchEvent: (e: Event) => getTabEl()?.dispatchEvent?.(e) ?? false,
      get closing() { return appState.value.tabs[id]?.isClosing ?? false; },
      get pinned() { return appState.value.tabs[id]?.isPinned ?? false; },
      get hidden() { return appState.value.tabs[id]?.isHidden ?? false; },
      get selected() { return appState.value.tabs[id]?.isSelected ?? false; },
      get multiselected() { return appState.value.tabs[id]?.isMultiSelected ?? false; },
      get label() { return appState.value.tabs[id]?.label ?? ""; },
      get linkedPanel() { 
        // Return null if browser not yet inserted, otherwise the actual panel ID
        const b = DOMRegistry.getBrowser(id);
        const panel = b?.parentNode?.parentNode;
        return panel?.id || null;
      },
      get userContextId() { return appState.value.tabs[id]?.userContextId ?? 0; },
      get _tPos() { return appState.value.tabOrder.indexOf(id); },
      // Mutable fields: store directly on tab element to persist across stub re-creation
      get _fullyOpen() { const el = getTabEl(); return el?._fullyOpen ?? true; },
      set _fullyOpen(v: boolean) { const el = getTabEl(); if (el) el._fullyOpen = v; },
      get owner() { const el = getTabEl(); return el?.owner ?? null; },
      set owner(v: any) { const el = getTabEl(); if (el) el.owner = v; },
      get _labelIsContentTitle() { const el = getTabEl(); return el?._labelIsContentTitle ?? false; },
      set _labelIsContentTitle(v: boolean) { const el = getTabEl(); if (el) el._labelIsContentTitle = v; },
      get _labelIsInitialTitle() { const el = getTabEl(); return el?._labelIsInitialTitle ?? false; },
      set _labelIsInitialTitle(v: boolean) { const el = getTabEl(); if (el) el._labelIsInitialTitle = v; },
      get _labelIsURL() { const el = getTabEl(); return el?._labelIsURL ?? false; },
      set _labelIsURL(v: boolean) { const el = getTabEl(); if (el) el._labelIsURL = v; },
      get _fullLabel() { const el = getTabEl(); return el?._fullLabel ?? ""; },
      set _fullLabel(v: string) { const el = getTabEl(); if (el) el._fullLabel = v; },
      get _findBar() { const el = getTabEl(); return el?._findBar ?? self.getCachedFindBar?.(this); },
      set _findBar(v: any) { const el = getTabEl(); if (el) el._findBar = v; },
      get _findBarFocused() { const el = getTabEl(); return el?._findBarFocused ?? false; },
      set _findBarFocused(v: boolean) { const el = getTabEl(); if (el) el._findBarFocused = v; },
      get _sharingState() { const el = getTabEl(); return el?._sharingState ?? null; },
      set _sharingState(v: any) { const el = getTabEl(); if (el) el._sharingState = v; },
      get muteReason() { const el = getTabEl(); return el?.muteReason ?? null; },
      set muteReason(v: any) { const el = getTabEl(); if (el) el.muteReason = v; },
      get _originalRegisteredOpenURI() { const el = getTabEl(); return el?._originalRegisteredOpenURI ?? null; },
      set _originalRegisteredOpenURI(v: any) { const el = getTabEl(); if (el) el._originalRegisteredOpenURI = v; },
      get initializingTab() { const el = getTabEl(); return el?.initializingTab ?? false; },
      set initializingTab(v: boolean) { const el = getTabEl(); if (el) el.initializingTab = v; },
      get isConnected() { const el = getTabEl(); return el?.isConnected ?? false; },
      get group() { const gid = appState.value.tabs[id]?.groupId; return gid ? appState.value.groups[gid] ?? null : null; },
      get attention() { const el = getTabEl(); return el?.hasAttribute?.("attention") ?? false; },
      set attention(v: boolean) { const el = getTabEl(); if (v) el?.setAttribute?.("attention", "true"); else el?.removeAttribute?.("attention"); },
      get isEmpty() { const t = appState.value.tabs[id]; return !t?.label && (!t?.url || t.url === "about:blank"); },
    };
  },

  // ==========================================================================
  // Sponsor Protection & Trigger Metadata
  // tabbrowser.js L8395~L8504
  // ==========================================================================

  _updateTriggerMetadataForLoad(
    browser: XULBrowserElement,
    uriString: string,
    { loadFlags = 0, globalHistoryOptions = {} as any } = {}
  ): void {
    try {
      if (globalHistoryOptions?.triggeringSponsoredURL) {
        if (globalHistoryOptions.triggeringSource === "newtab") {
          (this as any).SponsorProtection?.addProtectedBrowser?.(browser);
        }

        try {
          // Fix up the sponsored URL to match what the browser will store
          const triggeringSponsoredURL = (Services as any).uriFixup.getFixupURIInfo(
            globalHistoryOptions.triggeringSponsoredURL,
            (this as any)._loadFlagsToFixupFlags(loadFlags)
          ).fixedURI.spec;
          browser.setAttribute("triggeringSponsoredURL", triggeringSponsoredURL);
          const time = globalHistoryOptions.triggeringSponsoredURLVisitTimeMS || Date.now();
          browser.setAttribute("triggeringSponsoredURLVisitTimeMS", String(time));
          browser.setAttribute("triggeringSource", globalHistoryOptions.triggeringSource);
        } catch (e) {
          // Swallow fixup errors
        }
      } else {
        (this as any).SponsorProtection?.removeProtectedBrowser?.(browser);
      }

      if (globalHistoryOptions?.triggeringSearchEngine) {
        browser.setAttribute("triggeringSearchEngine", globalHistoryOptions.triggeringSearchEngine);
        browser.setAttribute("triggeringSearchEngineURL", uriString);
      } else {
        browser.removeAttribute("triggeringSearchEngine");
        browser.removeAttribute("triggeringSearchEngineURL");
      }
    } catch (error) {
      console.error("Error updating trigger metadata:", error);
    }
  },
};
