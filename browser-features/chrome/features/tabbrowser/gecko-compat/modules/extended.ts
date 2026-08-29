// SPDX-License-Identifier: MPL-2.0
// Ported from tabbrowser.js L4163~L5800, L6577~L7705
// Section: Extended Ops · Tab Groups · Window Ops · Selection · UI · Progress Callbacks · Stubs · Sponsor

import type { TabbrowserCompat } from "../TabbrowserCompat.ts";
import { appState, send } from "../../state/store.ts";
import * as TabOps from "../../ops/tab-ops.ts";
import * as GroupOps from "../../ops/group-ops.ts";
import { DOMRegistry } from "../DOMRegistry.ts";
import { BrowserSystem } from "../BrowserSystem.ts";
import type { TabId, GroupId, SplitViewId } from "../../types/TabState.ts";
import { resolveTabId, dispatch, createTabStub } from "../compat-helpers.ts";

declare const SharingUtils: any;

/** @augments TabbrowserCompat */
declare module "../TabbrowserCompat.ts" {
  interface TabbrowserCompat {
    duplicateSelectedTabs(): void;
    getMouseTargetRect(): any;
    updateContextMenu(popupMenu: any): void;
    _updateToggleMuteMenuItems(tabs: MozTabbrowserTab[]): void;
    onMouseEnter(event: Event): void;
    onMouseLeave(event: Event): void;
    closeContextTabs(button?: any, tab?: any): void;
    reopenInContainer(tab: MozTabbrowserTab, userContextId: number): void;
    adoptTab(tab: MozTabbrowserTab, options?: any): any;
    explicitUnloadTabs(tabs: MozTabbrowserTab[]): Promise<void>;
    removeMultiSelectedTabs(options?: { isUserTriggered?: boolean; telemetrySource?: string }): any;
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
    // Extended window ops
    replaceGroupWithWindow(group: MozTabbrowserTabGroup): void;
    handleNewTabMiddleClick(node: any, event: Event): void;
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
    _forwardToProgressListeners(method: string, args: any[]): void;
    // Stubs & sponsor
    _tabStub(id: TabId): any;
    createUserContextMenu(event: Event, options?: any): any;
    createReopenInContainerMenu(event: Event): void;
    showFullScreenViewContextMenuItems(menu: any): void;
    getTabPids(tab: MozTabbrowserTab): number[];
    shouldActivateDocShell(browser: XULBrowserElement): boolean;
    moveTabToSplitView(tab: MozTabbrowserTab, svId?: SplitViewId): void;
    _setupInitialBrowserAndTab(): void;
    updateTitlebar(): void;
  }
}

export const methods = {
  // ==========================================================================
  // Extended Tab Operations & Lifecycle
  // noraneko extension — no direct tabbrowser.js equivalent
  // ==========================================================================

  // upstream: _startRemoveTabs@9b7f77219f FIREFOX_143_0_1_RELEASE
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
  // upstream: runBeforeUnloadForTabs@89960729f2 FIREFOX_143_0_1_RELEASE
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
  // upstream: explicitUnloadTabs@b01bedd182 FIREFOX_143_0_1_RELEASE
  async explicitUnloadTabs(tabs: MozTabbrowserTab[]): Promise<void> {
    const unloadBlocked = await (this as any).runBeforeUnloadForTabs(tabs);
    if (unloadBlocked) return;

    let unloadSelectedTab = false;
    if (tabs.some((t: any) => resolveTabId(t) === appState.value.selectedTabId)) {
      unloadSelectedTab = true;
      const tabsToExclude = tabs.concat(this.tabs.filter(t => !t.linkedPanel));
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
  // upstream: adoptTab@3d9fb5b0fe FIREFOX_143_0_1_RELEASE
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
        triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
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
   * @param tabsAndSplitViews - Tabs or split-view wrapper elements to group
   * @returns The new `TabGroupData` state object, or `null` on failure
   */
  // upstream: addTabGroup@1697b981cf FIREFOX_143_0_1_RELEASE
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

    send({ type: "CREATE_GROUP", id: groupId, title: options.label || "", color });
    send({ type: "ADD_TABS_TO_GROUP", groupId, tabIds });

    const groupData = appState.value.groups[groupId];
    if (!groupData) return null;

    dispatch((this as any).window.document, "TabGroupCreated", { groupId });
    return groupData;
  },

  /**
   * Remove all tabs in a group and delete the group.
   */
  // upstream: removeTabGroup@2c01e93671 FIREFOX_143_0_1_RELEASE
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

    const tabs = groupData.tabs.map((id: any) => this._tabStub(id));
    const cancel = await (this as any).runBeforeUnloadForTabs(tabs);
    if (cancel) return;

    (this as any).removeTabs(tabs, { ...options, skipGroupCheck: true });
  },

  /** Remove a set of tabs from their groups. */
  ungroupTabs(tabs: MozTabbrowserTab[]): void {
    for (let i = tabs.length - 1; i >= 0; i--) {
      (this as any).ungroupTab(tabs[i]);
    }
  },

  /** Remove every tab in a split view from its tab group. */
  ungroupSplitViews(splitView: MozSplitView): void {
    if (!splitView) return;
    const wrapper = (this as any).isSplitViewWrapper(splitView) ? splitView : null;
    if (!wrapper) return;
    (this as any).ungroupSplitView(wrapper);
  },

  /** Create a new tab group that wraps all tabs in the given split view. */
  moveSplitViewToNewGroup(splitView: any, options: any = {}): any {
    if (!splitView) return null;
    const svId: SplitViewId | undefined = splitView.splitViewId ?? splitView.id;
    const svData = svId ? appState.value.splitViews[svId] : null;

    const tabs: any[] = svData
      ? svData.tabs.map((id: any) => DOMRegistry.getTab(id) ?? this._tabStub(id))
      : (Array.isArray(splitView.tabs) ? Array.from(splitView.tabs) : []);

    if (!tabs.length) return null;
    return (this as any).addTabGroup(tabs, { ...options, isUserTriggered: true });
  },

  /** Move multiple tabs into an existing tab group. */
  moveTabsToGroup(tabs: MozTabbrowserTab[], group: MozTabbrowserTabGroup): void {
    const groupId = group?.id;
    if (!groupId) return;

    const tabIds = tabs.map(t => resolveTabId(t)).filter((id): id is TabId => id !== null);
    if (!tabIds.length) return;

    send({ type: "ADD_TABS_TO_GROUP", groupId, tabIds });
    for (const id of tabIds) {
      const el = DOMRegistry.getTab(id);
      if (el) dispatch(el, "TabGrouped");
    }
  },

  /** Create a brand-new group from the given tabs. */
  moveTabsToNewGroup(tabs: MozTabbrowserTab[], options: any = {}): any {
    return (this as any).addTabGroup(tabs, { ...options, isUserTriggered: true });
  },

  /** Move tabs into an existing split view. */
  moveTabsToSplitView(tabs: MozTabbrowserTab[], splitView: any): void {
    if (!splitView || !tabs?.length) return;
    const svId: SplitViewId | undefined = splitView.splitViewId ?? splitView.id;
    if (!svId || !appState.value.splitViews[svId]) return;
    for (const tab of tabs) {
      if ((tab as any).pinned) continue;
      const tabId = resolveTabId(tab);
      if (!tabId) continue;
      send({ type: "ADD_TAB_TO_SPLIT_VIEW", splitViewId: svId, tabId });
      try {
        if ((this as any).isSplitViewWrapper(splitView)) {
          splitView.appendChild(tab);
        }
      } catch (_) { /* */ }
      (this as any).removeFromMultiSelectedTabs(tab);
    }
  },

  /** Persists `tabs` into a previously saved tab group via SessionStore. */
  addTabsToSavedGroup(tabs: MozTabbrowserTab[], groupId: string): void {
    try {
      SessionStore?.addTabsToSavedGroup?.(groupId, tabs);
    } catch (e) {
      console.error("addTabsToSavedGroup failed:", e);
    }
  },

  /** Reopens `tab` in a different container (user-context). */
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

  /** Populates the "Reopen in Container" context menu for `tab`. */
  createReopenInContainerMenu(event: Event): void {
    try {
      (this.window as any).createUserContextMenu?.(event, {
        isContextMenu: true,
        excludeUserContextId: (this.window as any).TabContextMenu?.contextTab?.userContextId,
      });
    } catch (e) {
      console.error("createReopenInContainerMenu failed:", e);
    }
  },

  /** Duplicates all currently selected tabs. */
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

  /** Closes all currently multi-selected tabs. */
  // upstream: removeMultiSelectedTabs@68d855f8fc FIREFOX_143_0_1_RELEASE
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

  /** Returns the bounding rectangle of the tab strip. */
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

  /** Adds a "new" badge attribute to the tab element. */
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

  /** Resolves the context tab from the popup menu's trigger node. */
  updateContextMenu(popupMenu: any): void {
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

  // upstream: _updateMultiselectedTabCloseButtonTooltip@44389946f3 FIREFOX_143_0_1_RELEASE
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

  onLocationChange(...a: any[]): void { (this as any)._forwardToProgressListeners("onLocationChange", a); },
  onStateChange(...a: any[]): void { (this as any)._forwardToProgressListeners("onStateChange", a); },
  onProgressChange(...a: any[]): void { (this as any)._forwardToProgressListeners("onProgressChange", a); },
  onProgressChange64(...a: any[]): void { (this as any).onProgressChange(...a); },
  onStatusChange(...a: any[]): void { (this as any)._forwardToProgressListeners("onStatusChange", a); },
  onSecurityChange(...a: any[]): void { (this as any)._forwardToProgressListeners("onSecurityChange", a); },
  onContentBlockingEvent(...a: any[]): void { (this as any)._forwardToProgressListeners("onContentBlockingEvent", a); },

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

  onMouseEnter(event: Event): void {
    // Mouse tracking - delegated to runtime
  },

  onMouseLeave(event: Event): void {
    // Mouse tracking - delegated to runtime
  },

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
    return createTabStub(id);
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
} satisfies Partial<TabbrowserCompat> & ThisType<TabbrowserCompat>;
