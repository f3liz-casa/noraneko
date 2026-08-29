// SPDX-License-Identifier: MPL-2.0
// Ported from tabbrowser.js L4163~L5800, L6577~L7705
// Section: Extended Ops · Tab Groups · Window Ops · Selection · UI · Progress Callbacks · Stubs · Sponsor

import type { TabbrowserCompat } from "../TabbrowserCompat.ts";
import { appState, send } from "../../state/store.ts";
import { DOMRegistry } from "../DOMRegistry.ts";
import type { SplitViewId } from "../../types/TabState.ts";
import { resolveTabId } from "../compat-helpers.ts";

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
    ungroupTabs(tabs: MozTabbrowserTab[]): void;
    ungroupSplitViews(splitView: any): void;
    moveSplitViewToNewGroup(splitView: any, options?: any): any;
    moveTabsToGroup(tabs: MozTabbrowserTab[], group: MozTabbrowserTabGroup): void;
    moveTabsToNewGroup(tabs: MozTabbrowserTab[], options?: any): any;
    moveTabsToSplitView(tabs: MozTabbrowserTab[], splitView: any): void;
    addTabsToSavedGroup(tabs: MozTabbrowserTab[], groupId: string): void;
    // Extended window ops
    replaceGroupWithWindow(group: MozTabbrowserTabGroup): void;
    handleNewTabMiddleClick(node: any, event: Event): void;
    // Stubs & sponsor
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

  /**
   * Begin closing `tabs`: beforeunload runs in every content process in
   * parallel, tabs without a prompt close right away, the ones that would
   * prompt come back in `tabsWithBeforeUnloadPrompt`, and the selected tab
   * waits to be last. Not ported: the Glean permitUnload timer.
   */
  _startRemoveTabs(
    tabs: MozTabbrowserTab[],
    {
      animate,
      // See bug 1883051
      // eslint-disable-next-line no-unused-vars
      suppressWarnAboutClosingWindow,
      skipPermitUnload,
      skipRemoves,
      skipSessionStore,
      isUserTriggered,
      telemetrySource,
    }: any = {},
  ): { beforeUnloadComplete: Promise<any>; tabsWithBeforeUnloadPrompt: any[]; lastToClose?: any } {
    // Note: if you change any of the unload algorithm, consider also
    // changing `runBeforeUnloadForTabs` above.
    const tabsWithBeforeUnloadPrompt: any[] = [];
    const tabsWithoutBeforeUnload: any[] = [];
    const beforeUnloadPromises: Promise<any>[] = [];
    let lastToClose: any;

    for (const t of tabs) {
      const tab = t as any;
      if (!skipRemoves) {
        tab._closedInMultiselection = true;
      }
      if (!skipRemoves && tab.selected) {
        lastToClose = tab;
        const toBlurTo = this._findTabToBlurTo(lastToClose, tabs);
        if (toBlurTo) {
          this._getSwitcher().warmupTab(toBlurTo);
        }
      } else if (!skipPermitUnload && this._hasBeforeUnload(tab)) {
        // We need to block while calling permitUnload() because it
        // processes the event queue and may lead to another removeTab()
        // call before permitUnload() returns.
        tab._pendingPermitUnload = true;
        beforeUnloadPromises.push(
          // To save time, we first run the beforeunload event listeners in all
          // content processes in parallel. Tabs that would have shown a prompt
          // will be handled again later.
          tab.linkedBrowser.asyncPermitUnload("dontUnload").then(
            ({ permitUnload }: any) => {
              tab._pendingPermitUnload = false;
              if (tab.closing) {
                // The tab was closed by the user while we were in permitUnload, don't
                // attempt to close it a second time.
              } else if (permitUnload) {
                if (!skipRemoves) {
                  // OK to close without prompting, do it immediately.
                  this.removeTab(tab, {
                    animate,
                    prewarmed: true,
                    skipPermitUnload: true,
                    skipSessionStore,
                  });
                }
              } else {
                // We will need to prompt, queue it so it happens sequentially.
                tabsWithBeforeUnloadPrompt.push(tab);
              }
            },
            (err: any) => {
              console.error("error while calling asyncPermitUnload", err);
              tab._pendingPermitUnload = false;
            },
          ),
        );
      } else {
        tabsWithoutBeforeUnload.push(tab);
      }
    }

    // Now that all the beforeunload IPCs have been sent to content processes,
    // we can queue unload messages for all the tabs without beforeunload listeners.
    // Doing this first would cause content process main threads to be busy and delay
    // beforeunload responses, which would be user-visible.
    if (!skipRemoves) {
      for (const tab of tabsWithoutBeforeUnload) {
        this.removeTab(tab, {
          animate,
          prewarmed: true,
          skipPermitUnload,
          skipSessionStore,
          isUserTriggered,
          telemetrySource,
        });
      }
    }

    return {
      beforeUnloadComplete: Promise.all(beforeUnloadPromises),
      tabsWithBeforeUnloadPrompt,
      lastToClose,
    };
  },

  /** Run beforeunload for `tabs` without closing them; true when the user cancelled. */
  async runBeforeUnloadForTabs(tabs: MozTabbrowserTab[]): Promise<boolean> {
    try {
      const { beforeUnloadComplete, tabsWithBeforeUnloadPrompt } = this._startRemoveTabs(tabs, {
        animate: false,
        suppressWarnAboutClosingWindow: false,
        skipPermitUnload: false,
        skipRemoves: true,
      });

      await beforeUnloadComplete;

      // Now run again sequentially the beforeunload listeners that will result in a prompt.
      for (const tab of tabsWithBeforeUnloadPrompt) {
        tab._pendingPermitUnload = true;
        const { permitUnload } = (this.getBrowserForTab(tab) as any).permitUnload();
        tab._pendingPermitUnload = false;
        if (!permitUnload) {
          return true;
        }
      }
    } catch (e) {
      console.error(e);
    }
    return false;
  },

  /** Discard `tabs` (after beforeunload), selecting something else first if need be. Not ported: the Glean record. */
  async explicitUnloadTabs(tabs: MozTabbrowserTab[]): Promise<void> {
    const win = this.window as any;
    const unloadBlocked = await this.runBeforeUnloadForTabs(tabs);
    if (unloadBlocked) {
      return;
    }
    if (tabs.some((tab) => tab.selected)) {
      // Unloading the currently selected tab.
      // Need to select a different one before unloading.
      // Avoid selecting any tab we're unloading now or
      // any tab that is already unloaded.
      const tabsToExclude = tabs.concat(this.tabContainer.allTabs.filter((tab: any) => !tab.linkedPanel));
      const newTab = this._findTabToBlurTo(this.selectedTab, tabsToExclude);
      if (newTab) {
        this.selectedTab = newTab;
      } else {
        // all tabs are unloaded - show Firefox View if it's present, otherwise open a new tab
        if (win.FirefoxViewHandler.tab || win.FirefoxViewHandler.button) {
          win.FirefoxViewHandler.openTab("opentabs");
        } else {
          this.selectedTab = this.addTrustedTab("about:newtab", {
            skipAnimation: true,
          });
        }
      }
    }
    await Promise.all(tabs.map((tab) => this.prepareDiscardBrowser(tab)));

    for (const tab of tabs) {
      this.discardBrowser(tab, true);
    }
  },

  /**
   * Move a tab in from another window: a new tab here takes over its
   * browser (same process), the old one closes over there.
   */
  adoptTab(aTab: MozTabbrowserTab, { elementIndex, tabIndex, selectTab = false }: any = {}): any {
    // Swap the dropped tab with a new one we create and then close
    // it in the other window (making it seem to have moved between
    // windows). We also ensure that the tab we create to swap into has
    // the same remote type and process as the one we're swapping in.
    // This makes sure we don't get a short-lived process for the new tab.
    const linkedBrowser = aTab.linkedBrowser!;
    const createLazyBrowser = !aTab.linkedPanel;
    let index: number;
    let nextElement: any;
    if (typeof elementIndex == "number") {
      index = elementIndex;
      nextElement = this.tabContainer.ariaFocusableItems.at(elementIndex);
    } else {
      index = tabIndex;
      nextElement = this.tabs.at(tabIndex);
    }
    const params: any = {
      eventDetail: { adoptedTab: aTab },
      preferredRemoteType: linkedBrowser.remoteType,
      initialBrowsingContextGroupId: linkedBrowser.browsingContext?.group.id,
      skipAnimation: true,
      elementIndex,
      tabIndex,
      tabGroup: this.isTab(nextElement) && nextElement.group,
      createLazyBrowser,
    };

    // We want to explicitly set this param rather than carry it over to
    // avoid situations like an unpinned tab being dragged between pinned
    // tabs but not getting pinned as expected.
    const numPinned = this.pinnedTabCount;
    if (index < numPinned || (aTab.pinned && index == numPinned)) {
      params.pinned = true;
    }

    if (aTab.hasAttribute("usercontextid")) {
      // new tab must have the same usercontextid as the old one
      params.userContextId = aTab.getAttribute("usercontextid");
    }
    const newTab = this.addWebTab("about:blank", params);
    const newBrowser = this.getBrowserForTab(newTab)!;

    (aTab as any).container.finishAnimateTabMove();

    if (!createLazyBrowser) {
      // Stop the about:blank load.
      (newBrowser as any).stop();
    }

    if (!this.swapBrowsersAndCloseOther(newTab, aTab)) {
      // Swapping wasn't permitted. Bail out.
      this.removeTab(newTab);
      return null;
    }

    if (selectTab) {
      this.selectedTab = newTab;
    }

    return newTab;
  },

  // ==========================================================================
  // Extended Tab Group Operations
  // noraneko extension — no direct tabbrowser.js equivalent
  // ==========================================================================



  /** Remove a set of tabs from their groups. */
  ungroupTabs(tabs: MozTabbrowserTab[]): void {
    for (let i = tabs.length - 1; i >= 0; i--) {
      this.ungroupTab(tabs[i]);
    }
  },

  /** Remove every tab in a split view from its tab group. */
  ungroupSplitViews(splitView: MozSplitView): void {
    if (!splitView) return;
    const wrapper = this.isSplitViewWrapper(splitView) ? splitView : null;
    if (!wrapper) return;
    this.ungroupSplitView(wrapper);
  },

  /** Create a new tab group that wraps all tabs in the given split view. */
  moveSplitViewToNewGroup(splitView: any, options: any = {}): any {
    if (!splitView) return null;
    const svId: SplitViewId | undefined = splitView.splitViewId ?? splitView.id;
    const svData = svId ? appState.value.splitViews[svId] : null;

    const tabs: any[] = svData
      ? svData.tabs.map((id: any) => DOMRegistry.getTab(id)).filter(Boolean)
      : (Array.isArray(splitView.tabs) ? Array.from(splitView.tabs) : []);

    if (!tabs.length) return null;
    return this.addTabGroup(tabs, { ...options, isUserTriggered: true });
  },

  /** Move several tabs into an existing group. */
  moveTabsToGroup(tabs: MozTabbrowserTab[], group: MozTabbrowserTabGroup): void {
    for (const tab of tabs) {
      this.moveTabToGroup(tab, group);
    }
  },

  /** Create a brand-new group from the given tabs. */
  moveTabsToNewGroup(tabs: MozTabbrowserTab[], options: any = {}): any {
    return this.addTabGroup(tabs, { ...options, isUserTriggered: true });
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
        if (this.isSplitViewWrapper(splitView)) {
          splitView.appendChild(tab);
        }
      } catch (_) { /* */ }
      this.removeFromMultiSelectedTabs(tab);
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

  /** Reopen `tab`'s page in another container, right after it, and close the original. */
  reopenInContainer(tab: MozTabbrowserTab, userContextId: number): void {
    const browser = tab.linkedBrowser!;
    const triggeringPrincipal = browser.contentPrincipal || Services.scriptSecurityManager.getSystemPrincipal();
    const newTab = this.addTab(browser.currentURI.spec, {
      userContextId,
      pinned: tab.pinned,
      tabIndex: (tab as any)._tPos + 1,
      triggeringPrincipal,
    });

    if (tab.selected) {
      this.selectedTab = newTab;
    }

    this.removeTab(tab);
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
    const tabs = this.selectedTabs;
    let newIndex = tabs[tabs.length - 1]?._tPos + 1;

    for (const tab of tabs) {
      try {
        const newTab = SessionStore?.duplicateTab?.(window, tab);
        if (newTab) {
          this.moveTabTo(newTab, { tabIndex: newIndex++ });
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

  /** Close every multi-selected tab (after the "closing N tabs" warning). */
  removeMultiSelectedTabs({ isUserTriggered, telemetrySource }: any = {}): void {
    const selectedTabs = this.selectedTabs;
    if (!this.warnAboutClosingTabs(selectedTabs.length, this.closingTabsEnum.MULTI_SELECTED)) {
      return;
    }

    this.removeTabs(selectedTabs, { isUserTriggered, telemetrySource });
  },

  // ==========================================================================
  // Extended Window Operations
  // noraneko extension — no direct tabbrowser.js equivalent
  // ==========================================================================

  /** Returns the bounding rectangle of the tab strip. */
  getMouseTargetRect(): any {
    const container = this.tabContainer?.parentNode;
    if (!container) return null;

    try {
      const panelRect = window.windowUtils?.getBoundsWithoutFlushing(this.tabContainer);
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

  /** Ours: mark a tab with the "new" badge. */
  addNewBadge(tab: MozTabbrowserTab): void {
    tab.setAttribute("badge", "new");
  },

  /** Resolves the context tab from the popup menu's trigger node. */
  updateContextMenu(popupMenu: any): void {
    try {
      const triggerTab = popupMenu?.triggerNode?.tab || popupMenu?.triggerNode?.closest?.("tab");
      this.contextTab = triggerTab || this.selectedTab;
    } catch (e) {
      console.error("updateContextMenu failed:", e);
    }
  },

  _updateToggleMuteMenuItems(tabs: MozTabbrowserTab[]): void {
    // Menu item updates - delegated to runtime
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
    const tabs = this.contextTab?.multiselected ? this.selectedTabs : [this.contextTab];
    this.removeMultiSelectedTabs({
      isUserTriggered: true,
      telemetrySource: "tab_context_menu",
    });
  },


} satisfies Partial<TabbrowserCompat> & ThisType<TabbrowserCompat>;
