// SPDX-License-Identifier: MPL-2.0
// Ported from tabbrowser.js L4163~L5800, L6577~L7705
// Section: Extended Ops · Tab Groups · Window Ops · Selection · UI · Progress Callbacks · Stubs · Sponsor

import type { TabbrowserCompat } from "../TabbrowserCompat.ts";

declare const SharingUtils: any;

/** @augments TabbrowserCompat */
declare module "../TabbrowserCompat.ts" {
  interface TabbrowserCompat {
    adoptTab(tab: MozTabbrowserTab, options?: any): any;
    explicitUnloadTabs(tabs: MozTabbrowserTab[]): Promise<void>;
    removeMultiSelectedTabs(options?: { isUserTriggered?: boolean; telemetrySource?: string }): any;
    // Extended Tab Operations
    _startRemoveTabs(tabs: MozTabbrowserTab[], options?: any): any;
    runBeforeUnloadForTabs(tabs: MozTabbrowserTab[]): Promise<boolean>;
    // Extended window ops
    replaceGroupWithWindow(group: MozTabbrowserTabGroup): void;
    handleNewTabMiddleClick(node: any, event: Event): void;
    // Stubs & sponsor
    getTabPids(tab: MozTabbrowserTab): number[];
    shouldActivateDocShell(browser: XULBrowserElement): boolean;
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
  // upstream: _startRemoveTabs@9b7f77219f FIREFOX_143_0_1_RELEASE
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
  // upstream: runBeforeUnloadForTabs@89960729f2 FIREFOX_143_0_1_RELEASE
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
  // upstream: explicitUnloadTabs@b01bedd182 FIREFOX_143_0_1_RELEASE
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
  // upstream: adoptTab@3d9fb5b0fe FIREFOX_143_0_1_RELEASE
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
  // Extended Tab Selection & Multi-Select
  // noraneko extension — no direct tabbrowser.js equivalent
  // ==========================================================================

  /** Close every multi-selected tab (after the "closing N tabs" warning). */
  // upstream: removeMultiSelectedTabs@68d855f8fc FIREFOX_143_0_1_RELEASE
  removeMultiSelectedTabs({ isUserTriggered, telemetrySource }: any = {}): void {
    const selectedTabs = this.selectedTabs;
    if (!this.warnAboutClosingTabs(selectedTabs.length, this.closingTabsEnum.MULTI_SELECTED)) {
      return;
    }

    this.removeTabs(selectedTabs, { isUserTriggered, telemetrySource });
  },

} satisfies Partial<TabbrowserCompat> & ThisType<TabbrowserCompat>;
