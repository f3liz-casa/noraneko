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
  // upstream: addTab@86fe2b6943 FIREFOX_143_0_1_RELEASE
  addTab(uri: nsIURI | string, options: any = {}) {
    const uriStr = typeof uri === "string" ? uri : uri?.spec || String(uri) || "about:blank";
    // tabbrowser.js: every caller passes a principal (addTrustedTab and
    // addWebTab supply one). The load below cannot start without it.
    if (!options.triggeringPrincipal) {
      throw new Error("Required argument triggeringPrincipal missing within addTab");
    }
    const id = crypto.randomUUID();
    const win = this.window as any;
    const createLazyBrowser = !!options.createLazyBrowser;
    // A lazy tab's URL belongs to SessionStore; its browser starts on
    // about:blank and nothing is loaded until it is first used.
    const skipLoad = options.skipLoad ?? createLazyBrowser;
    const { uri: uriObj, uriIsAboutBlank, lazyBrowserURI, uriString } =
      this._determineURIToLoad(uriStr, createLazyBrowser);

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

    // <tab> and <browser>; the browser is inserted into the deck right away
    // unless the tab is lazy.
    this._createBrowserDOM(id, {
      uriString,
      uri: uriObj,
      uriIsAboutBlank,
      skipLoad,
      createLazyBrowser,
      userContextId: options.userContextId,
      preferredRemoteType: options.preferredRemoteType ?? options.remoteType,
      openerBrowser: options.openerBrowser,
      referrerInfo: options.referrerInfo,
      forceNotRemote: options.forceNotRemote,
      name: options.name,
      initialBrowsingContextGroupId: options.initialBrowsingContextGroupId,
      openWindowInfo: options.openWindowInfo,
      triggeringRemoteType: options.triggeringRemoteType,
      noInitialLabel: options.noInitialLabel,
      skipBackgroundNotify: options.skipBackgroundNotify,
    });

    const tabEl = DOMRegistry.getTab(id) as any;
    const browser = DOMRegistry.getBrowser(id) as any;

    if (tabEl && browser) {
      if (options.focusUrlBar) {
        win.gURLBar.getBrowserState(browser).urlbarFocused = true;
      }

      // If the caller opts in, create a lazy browser.
      if (createLazyBrowser) {
        this._createLazyBrowser(tabEl);

        if (lazyBrowserURI) {
          // Lazy browser must be explicitly registered so tab will appear as
          // a switch-to-tab candidate in autocomplete.
          this.UrlbarProviderOpenTabs.registerOpenTab(
            lazyBrowserURI.spec,
            tabEl.userContextId,
            options.tabGroup?.id,
            win.PrivateBrowsingUtils.isWindowPrivate(win),
          );
          browser.registeredOpenURI = lazyBrowserURI;
        }
        // tabbrowser.js skips this for insertTab: false (session restore
        // inserting the tabs itself); the compat always inserts the tab.
        SessionStore.setTabState(tabEl, {
          entries: [
            {
              url: lazyBrowserURI?.spec || "about:blank",
              title: options.lazyTabTitle,
              triggeringPrincipal_base64: E10SUtils.serializePrincipal(options.triggeringPrincipal),
            },
          ],
          // Make sure to store the userContextId associated to the lazy tab
          // otherwise it would be created as a default tab when recreated on a
          // session restore (See Bug 1819794).
          userContextId: options.userContextId,
        });
      } else if (options.openerBrowser && !options.openWindowInfo) {
        // If we were called by frontend and don't have openWindowInfo,
        // but we were opened from another browser, set the cross group
        // opener ID:
        browser.browsingContext.crossGroupOpener = options.openerBrowser.browsingContext;
      }
    }

    dispatch(tabEl ?? document, "TabOpen", options);

    // tabbrowser.js addTab: the load starts once TabOpen has fired.
    if (browser) {
      this._kickOffBrowserLoad(browser, {
        uri: uriObj,
        uriString: uriStr,
        usingPreloadedContent: !!(tabEl as any)?._browserParams?.usingPreloadedContent,
        triggeringPrincipal: options.triggeringPrincipal,
        originPrincipal: options.originPrincipal,
        originStoragePrincipal: options.originStoragePrincipal,
        uriIsAboutBlank,
        allowInheritPrincipal: options.allowInheritPrincipal,
        allowThirdPartyFixup: options.allowThirdPartyFixup,
        fromExternal: options.fromExternal,
        // 143 callers say disableTRR, 154 (which _kickOffBrowserLoad follows) isCaptivePortalTab
        isCaptivePortalTab: options.isCaptivePortalTab ?? options.disableTRR,
        forceAllowDataURI: options.forceAllowDataURI,
        skipLoad,
        referrerInfo: options.referrerInfo,
        charset: options.charset,
        postData: options.postData,
        policyContainer: options.policyContainer,
        globalHistoryOptions: options.globalHistoryOptions,
        triggeringRemoteType: options.triggeringRemoteType,
        schemelessInput: options.schemelessInput,
        hasValidUserGestureActivation:
          !!options.hasValidUserGestureActivation ||
          !!options.openWindowInfo?.hasValidUserGestureActivation,
        textDirectiveUserActivation:
          !!options.textDirectiveUserActivation ||
          !!options.openWindowInfo?.textDirectiveUserActivation,
      });
    }

    // This field is updated regardless if we actually animate
    // since it's important that we keep this count correct in all cases;
    // tabs.js _handleNewTab counts it back down.
    this.tabAnimationsInProgress++;

    // Additionally send pinned tab events
    if (options.pinned && tabEl) {
      this._notifyPinnedStatus(tabEl);
    }

    if (tabEl) win.gSharedTabWarning?.tabAdded(tabEl);

    // tabbrowser.js: inBackground defaults to true.
    if (tabEl && options.inBackground === false) {
      this.selectedTab = tabEl;
    }
    return tabEl ?? this._tabStub(id);
  },

  /** Create a new tab with an implicitly trusted (system) principal. */
  // upstream: addTrustedTab@ef19ebff7e FIREFOX_143_0_1_RELEASE
  addTrustedTab(uri: nsIURI | string, options: any = {}) {
    return this.addTab(uri, {
      ...options,
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
    });
  },

  /**
   * Open a URL in a new tab with a content (null) principal unless the
   * caller brings its own. tabbrowser.js addWebTab.
   */
  // upstream: addWebTab@b50961aae1 FIREFOX_143_0_1_RELEASE
  addWebTab(uri: string, options: any = {}) {
    if (!options.triggeringPrincipal) {
      options = {
        ...options,
        triggeringPrincipal: Services.scriptSecurityManager.createNullPrincipal({
          userContextId: options.userContextId,
        }),
      };
    }
    if (options.triggeringPrincipal.isSystemPrincipal) {
      throw new Error("System principal should never be passed into addWebTab()");
    }
    return this.addTab(uri, options);
  },

  /**
   * Opens `uris` as tabs; with `replace`, the first one loads into
   * `targetTab` (the selected tab when not given) instead of a new tab.
   *
   * @returns nothing — the tabs are reachable through `firstTabAdded` in
   *   tabbrowser.js only via selection; callers that need them use addTab.
   */
  // upstream: loadTabs@fe9f7fb2bc FIREFOX_143_0_1_RELEASE
  loadTabs(
    uris: string[],
    {
      allowInheritPrincipal,
      allowThirdPartyFixup,
      inBackground,
      newIndex,
      elementIndex,
      postDatas,
      replace,
      tabGroup,
      targetTab,
      triggeringPrincipal,
      policyContainer,
      userContextId,
      fromExternal,
    }: any = {},
  ) {
    if (!uris.length) {
      return;
    }

    // The tab selected after this new tab is closed (i.e. the new tab's
    // "owner") is the next adjacent tab (i.e. not the previously viewed tab)
    // when several urls are opened here (i.e. closing the first should select
    // the next of many URLs opened) or if the pref to have UI links opened in
    // the background is set (i.e. the link is not being opened modally)
    //
    // i.e.
    //    Number of URLs    Load UI Links in BG       Focus Last Viewed?
    //    == 1              false                     YES
    //    == 1              true                      NO
    //    > 1               false/true                NO
    const multiple = uris.length > 1;
    const owner = multiple || inBackground ? null : this.selectedTab;
    let firstTabAdded = null;
    let targetTabIndex = -1;

    if (typeof elementIndex == "number") {
      newIndex = this._elementIndexToTabIndex(elementIndex);
    }
    if (typeof newIndex != "number") {
      newIndex = -1;
    }

    // When bulk opening tabs, such as from a bookmark folder, we want to insertAfterCurrent
    // if necessary, but we also will set the bulkOrderedOpen flag so that the bookmarks
    // open in the same order they are in the folder.
    if (
      multiple &&
      newIndex < 0 &&
      Services.prefs.getBoolPref("browser.tabs.insertAfterCurrent")
    ) {
      newIndex = this.selectedTab._tPos + 1;
    }

    if (replace) {
      if (this.isTabGroupLabel(targetTab)) {
        throw new Error("Replacing a tab group label with a tab is not supported");
      }
      let browser: any;
      if (targetTab) {
        browser = this.getBrowserForTab(targetTab);
        targetTabIndex = targetTab._tPos;
      } else {
        browser = this.selectedBrowser;
        targetTabIndex = this.tabContainer.selectedIndex;
      }
      const WNAV = Ci.nsIWebNavigation as Required<typeof Ci.nsIWebNavigation>;
      let loadFlags = WNAV.LOAD_FLAGS_NONE;
      if (allowThirdPartyFixup) {
        loadFlags |= WNAV.LOAD_FLAGS_ALLOW_THIRD_PARTY_FIXUP | WNAV.LOAD_FLAGS_FIXUP_SCHEME_TYPOS;
      }
      if (!allowInheritPrincipal) {
        loadFlags |= WNAV.LOAD_FLAGS_DISALLOW_INHERIT_PRINCIPAL;
      }
      if (fromExternal) {
        loadFlags |= WNAV.LOAD_FLAGS_FROM_EXTERNAL;
      }
      try {
        browser.fixupAndLoadURIString(uris[0], {
          loadFlags,
          postData: postDatas && postDatas[0],
          triggeringPrincipal,
          policyContainer,
        });
      } catch (_e) {
        // Ignore failure in case a URI is wrong, so we can continue
        // opening the next ones.
      }
    } else {
      const params: any = {
        allowInheritPrincipal,
        ownerTab: owner,
        skipAnimation: multiple,
        allowThirdPartyFixup,
        postData: postDatas && postDatas[0],
        userContextId,
        triggeringPrincipal,
        bulkOrderedOpen: multiple,
        policyContainer,
        fromExternal,
        tabGroup,
      };
      if (newIndex > -1) {
        params.tabIndex = newIndex;
      }
      firstTabAdded = this.addTab(uris[0], params);
      if (newIndex > -1) {
        targetTabIndex = firstTabAdded._tPos;
      }
    }

    let tabNum = targetTabIndex;
    for (let i = 1; i < uris.length; ++i) {
      const params: any = {
        allowInheritPrincipal,
        skipAnimation: true,
        allowThirdPartyFixup,
        postData: postDatas && postDatas[i],
        userContextId,
        triggeringPrincipal,
        bulkOrderedOpen: true,
        policyContainer,
        fromExternal,
        tabGroup,
      };
      if (targetTabIndex > -1) {
        params.tabIndex = ++tabNum;
      }
      this.addTab(uris[i], params);
    }

    if (firstTabAdded && !inBackground) {
      this.selectedTab = firstTabAdded;
    }
  },

  // ==========================================================================
  // removeTab / removeTabs
  // tabbrowser.js L5087~L5800
  // ==========================================================================

  /**
   * Everything that has to happen before a tab may go: permitUnload, the
   * last-tab decision, TabClose, the progress listener. Returns false when
   * the close was refused. Not ported: the Glean permitUnload timer.
   */
  // upstream: _beginRemoveTab@5f9c8e90e6 FIREFOX_143_0_1_RELEASE
  _beginRemoveTab(
    aTab: MozTabbrowserTab,
    {
      adoptedByTab,
      closeWindowWithLastTab,
      closeWindowFastpath,
      skipPermitUnload,
      prewarmed,
      skipSessionStore = false,
      isUserTriggered,
      telemetrySource,
    }: any = {},
  ): boolean {
    const win = this.window as any;
    const tab = aTab as any;
    if (tab.closing || this._windowIsClosing) {
      return false;
    }

    const browser = this.getBrowserForTab(tab) as any;
    if (
      !skipPermitUnload &&
      !adoptedByTab &&
      tab.linkedPanel &&
      !tab._pendingPermitUnload &&
      (!browser.isRemoteBrowser || this._hasBeforeUnload(tab))
    ) {
      if (!prewarmed) {
        const blurTab = this._findTabToBlurTo(tab);
        if (blurTab) {
          this.warmupTab(blurTab);
        }
      }

      // We need to block while calling permitUnload() because it
      // processes the event queue and may lead to another removeTab()
      // call before permitUnload() returns.
      tab._pendingPermitUnload = true;
      const { permitUnload } = browser.permitUnload();
      tab._pendingPermitUnload = false;

      // If we were closed during onbeforeunload, we return false now
      // so we don't (try to) close the same tab again. Of course, we
      // also stop if the unload was cancelled by the user:
      if (tab.closing || !permitUnload) {
        return false;
      }
    }

    this.tabContainer._invalidateCachedVisibleTabs?.();

    // this._switcher would normally cover removing a tab from this
    // cache, but we may not have one at this time.
    const tabCacheIndex = this._tabLayerCache.indexOf(tab);
    if (tabCacheIndex != -1) {
      this._tabLayerCache.splice(tabCacheIndex, 1);
    }

    // Delay hiding the the active tab if we're screen sharing.
    // See Bug 1642747.
    const screenShareInActiveTab = tab == this.selectedTab && tab._sharingState?.webRTC?.screen;

    if (!screenShareInActiveTab) {
      this._blurTab(tab);
    }

    let closeWindow = false;
    let newTab = false;
    if (this._isLastTabInWindow(tab)) {
      closeWindow =
        closeWindowWithLastTab != null
          ? closeWindowWithLastTab
          : !win.toolbar.visible || Services.prefs.getBoolPref("browser.tabs.closeWindowWithLastTab");

      if (closeWindow) {
        // We've already called beforeunload on all the relevant tabs if we get here,
        // so avoid calling it again:
        win.skipNextCanClose = true;
      }

      // Closing the tab and replacing it with a blank one is notably slower
      // than closing the window right away. If the caller opts in, take
      // the fast path.
      if (closeWindow && closeWindowFastpath && !this._removingTabs.size) {
        // This call actually closes the window, unless the user
        // cancels the operation.  We are finished here in both cases.
        this._windowIsClosing = win.closeWindow(true, win.warnAboutClosingWindow, "close-last-tab");
        return false;
      }

      newTab = true;
    }
    tab._endRemoveArgs = [closeWindow, newTab];

    // swapBrowsersAndCloseOther will take care of closing the window without animation.
    if (closeWindow && adoptedByTab) {
      // Remove the tab's filter and progress listener to avoid leaking.
      if (tab.linkedPanel) {
        const filter = this._tabFilters.get(tab);
        browser.webProgress.removeProgressListener(filter);
        const listener = this._tabListeners.get(tab);
        filter.removeProgressListener(listener);
        listener.destroy();
        this._tabListeners.delete(tab);
        this._tabFilters.delete(tab);
      }
      return true;
    }

    if (!tab._fullyOpen) {
      // If the opening tab animation hasn't finished before we start closing the
      // tab, decrement the animation count since _handleNewTab will not get called.
      this.tabAnimationsInProgress--;
    }

    this.tabAnimationsInProgress++;

    // Mute audio immediately to improve perceived speed of tab closure.
    if (!adoptedByTab && tab.hasAttribute("soundplaying")) {
      // Don't persist the muted state as this wasn't a user action.
      // This lets undo-close-tab return it to an unmuted state.
      tab.linkedBrowser.mute(true);
    }

    tab.closing = true;
    this._removingTabs.add(tab);
    this.tabContainer._invalidateCachedTabs?.();
    const id = resolveTabId(tab);
    if (id) send({ type: "BEGIN_CLOSE_TAB", tabId: id });

    // Invalidate hovered tab state tracking for this closing tab.
    tab._mouseleave?.();

    if (newTab) {
      this.addTrustedTab("about:newtab", {
        skipAnimation: true,
        // In the event that insertAfterCurrent is set and the current tab is
        // inside a group that is being closed we want to avoid creating the
        // new tab inside that group.
        tabIndex: 0,
      });
    } else {
      win.TabBarVisibility?.update();
    }

    // Splice this tab out of any lines of succession before any events are
    // dispatched.
    this.replaceInSuccession(tab, tab.successor);
    this.setSuccessor(tab, null);

    // We're committed to closing the tab now.
    // Dispatch a notification.
    // We dispatch it before any teardown so that event listeners can
    // inspect the tab that's about to close.
    const evt = new CustomEvent("TabClose", {
      bubbles: true,
      detail: {
        adoptedBy: adoptedByTab,
        skipSessionStore,
        isUserTriggered,
        telemetrySource,
      },
    });
    tab.dispatchEvent(evt);

    if (this.tabs.length == 2) {
      // We're closing one of our two open tabs, inform the other tab that its
      // sibling is going away.
      for (const t of this.tabs) {
        const bc = t.linkedBrowser?.browsingContext;
        if (bc) {
          bc.hasSiblings = false;
        }
      }
    }

    const notificationBox = this.readNotificationBox(browser);
    notificationBox?._stack?.remove();

    if (tab.linkedPanel) {
      if (!adoptedByTab && !win.gMultiProcessBrowser) {
        // Prevent this tab from showing further dialogs, since we're closing it
        browser.contentWindow.windowUtils.disableDialogs();
      }

      // Remove the tab's filter and progress listener.
      const filter = this._tabFilters.get(tab);

      browser.webProgress.removeProgressListener(filter);

      const listener = this._tabListeners.get(tab);
      filter.removeProgressListener(listener);
      listener.destroy();
    }

    if (browser.registeredOpenURI && !adoptedByTab) {
      const userContextId = browser.getAttribute("usercontextid") || 0;
      this.UrlbarProviderOpenTabs.unregisterOpenTab(
        browser.registeredOpenURI.spec,
        userContextId,
        tab.group?.id,
        win.PrivateBrowsingUtils.isWindowPrivate(win),
      );
      delete browser.registeredOpenURI;
    }

    // We are no longer the primary content area.
    browser.removeAttribute("primary");

    return true;
  },

  /**
   * Take the tab, its browser and its panel out, then tell the store.
   * Not ported: the Glean close-time stopwatches.
   */
  // upstream: _endRemoveTab@f5f76942e9 FIREFOX_143_0_1_RELEASE
  _endRemoveTab(aTab: MozTabbrowserTab) {
    const win = this.window as any;
    const tab = aTab as any;
    if (!tab || !tab._endRemoveArgs) {
      return;
    }

    let [aCloseWindow, aNewTab] = tab._endRemoveArgs;
    tab._endRemoveArgs = null;

    if (this._windowIsClosing) {
      aCloseWindow = false;
      aNewTab = false;
    }

    this.tabAnimationsInProgress--;

    this._lastRelatedTabMap = new WeakMap();

    // update the UI early for responsiveness
    tab.collapsed = true;
    this._blurTab(tab);

    this._removingTabs.delete(tab);

    if (aCloseWindow) {
      this._windowIsClosing = true;
      for (const t of this._removingTabs) {
        this._endRemoveTab(t);
      }
    } else if (!this._windowIsClosing) {
      if (aNewTab) {
        win.gURLBar.select();
      }
    }

    // We're going to remove the tab and the browser now.
    this._tabFilters.delete(tab);
    this._tabListeners.delete(tab);

    const browser = this.getBrowserForTab(tab) as any;

    if (tab.linkedPanel) {
      // Because of the fact that we are setting JS properties on
      // the browser elements, and we have code in place
      // to preserve the JS objects for any elements that have
      // JS properties set on them, the browser element won't be
      // destroyed until the document goes away.  So we force a
      // cleanup ourselves.
      // This has to happen before we remove the child since functions
      // like `getBrowserContainer` expect the browser to be parented.
      browser.destroy();
    }

    // Remove the tab ...
    tab.remove();
    this.tabContainer._invalidateCachedTabs?.();
    const id = resolveTabId(tab);
    if (id) {
      DOMRegistry.unregisterTab(id);
      send({ type: "END_CLOSE_TAB", tabId: id });
    }

    // ... and fix up the _tPos properties immediately.
    for (let i = tab._tPos; i < this.tabs.length; i++) {
      (this.tabs[i] as any)._tPos = i;
    }

    if (!this._windowIsClosing) {
      // update tab close buttons state
      this.tabContainer._updateCloseButtons?.();

      setTimeout(
        (tabs: any) => {
          tabs._lastTabClosedByMouse = false;
        },
        0,
        this.tabContainer,
      );
    }

    // update tab positional properties and attributes
    if (this.selectedTab) this.selectedTab._selected = true;

    // Removing the panel requires fixing up selectedPanel immediately
    // (see below), which would be hindered by the potentially expensive
    // browser removal. So we remove the browser and the panel in two
    // steps.

    const panel = this.getPanel(browser);

    // In the multi-process case, it's possible an asynchronous tab switch
    // is still underway. If so, then it's possible that the last visible
    // browser is the one we're in the process of removing. There's the
    // risk of displaying preloaded browsers that are at the end of the
    // deck if we remove the browser before the switch is complete, so
    // we alert the switcher in order to show a spinner instead.
    if (this._switcher) {
      this._switcher.onTabRemoved(tab);
    }

    // This will unload the document. An unload handler could remove
    // dependant tabs, so it's important that the tabbrowser is now in
    // a consistent state (tab removed, tab positions updated, etc.).
    browser.remove();

    // Release the browser in case something is erroneously holding a
    // reference to the tab after its removal.
    this._tabForBrowser.delete(tab.linkedBrowser);
    tab.linkedBrowser = null;
    if (id) DOMRegistry.unregisterBrowser(id);

    panel.remove();

    if (aCloseWindow) {
      this._windowIsClosing = win.closeWindow(true, win.warnAboutClosingWindow, "close-last-tab");
    }
  },

  /**
   * Close a tab. With `animate`, the tab fades out first; the actual removal
   * happens in _endRemoveTab (from _onTransitionEnd, or the 3s fallback).
   * Not ported: the Glean close-time stopwatches.
   */
  // upstream: removeTab@6ebddeaff4 FIREFOX_143_0_1_RELEASE
  removeTab(
    aTab: MozTabbrowserTab,
    {
      animate,
      triggeringEvent,
      skipPermitUnload,
      closeWindowWithLastTab,
      prewarmed,
      skipSessionStore,
      isUserTriggered,
      telemetrySource,
    }: any = {},
  ) {
    const win = this.window as any;
    const tab = aTab as any;
    if (win.UserInteraction?.running("browser.tabs.opening", win)) {
      win.UserInteraction.finish("browser.tabs.opening", win);
    }

    // Handle requests for synchronously removing an already
    // asynchronously closing tab.
    if (!animate && tab.closing) {
      this._endRemoveTab(tab);
      return;
    }

    const isVisibleTab = tab.visible;
    // We have to sample the tab width now, since _beginRemoveTab might
    // end up modifying the DOM in such a way that aTab gets a new
    // frame created for it (for example, by updating the visually selected
    // state).
    const tabWidth = win.windowUtils.getBoundsWithoutFlushing(tab).width;
    const isLastTab = this._isLastTabInWindow(tab);
    if (
      !this._beginRemoveTab(tab, {
        closeWindowFastpath: true,
        skipPermitUnload,
        closeWindowWithLastTab,
        prewarmed,
        skipSessionStore,
        isUserTriggered,
        telemetrySource,
      })
    ) {
      return;
    }

    const lockTabSizing =
      !this.tabContainer.verticalMode &&
      !tab.pinned &&
      isVisibleTab &&
      tab._fullyOpen &&
      triggeringEvent?.inputSource == win.MouseEvent.MOZ_SOURCE_MOUSE &&
      triggeringEvent?.target.closest(".tabbrowser-tab");
    if (lockTabSizing) {
      this.tabContainer._lockTabSizing(tab, tabWidth);
    } else {
      this.tabContainer._unlockTabSizing();
    }

    if (
      !animate /* the caller didn't opt in */ ||
      win.gReduceMotion ||
      isLastTab ||
      tab.pinned ||
      !isVisibleTab ||
      this.tabContainer.verticalMode ||
      this._removingTabs.size > 3 /* don't want lots of concurrent animations */ ||
      !tab.hasAttribute("fadein") /* fade-in transition hasn't been triggered yet */ ||
      tabWidth == 0 /* fade-in transition hasn't moved yet */
    ) {
      this._endRemoveTab(tab);
      return;
    }

    tab.style.maxWidth = ""; // ensure that fade-out transition happens
    tab.removeAttribute("fadein");
    tab.removeAttribute("bursting");

    setTimeout(
      (t: any, tabbrowser: any) => {
        if (t.container && win.getComputedStyle(t).maxWidth == "0.1px") {
          console.assert(
            false,
            "Giving up waiting for the tab closing animation to finish (bug 608589)",
          );
          tabbrowser._endRemoveTab(t);
        }
      },
      3000,
      tab,
      this,
    );
  },

  /** Close the currently active tab. */
  // upstream: removeCurrentTab@71120d00bf FIREFOX_143_0_1_RELEASE
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
  // upstream: removeTabs@c87819e103 FIREFOX_143_0_1_RELEASE
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
  // upstream: removeAllTabsBut@5f46de5ec6 FIREFOX_143_0_1_RELEASE
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
  // upstream: closeTabsByURI@9fe20b8380 FIREFOX_143_0_1_RELEASE
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
  // upstream: pinTab@84399e5062 FIREFOX_143_0_1_RELEASE
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
  // upstream: unpinTab@487c881bd5 FIREFOX_143_0_1_RELEASE
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
  // upstream: showTab@65a3fea873 FIREFOX_143_0_1_RELEASE
  showTab(tab: MozTabbrowserTab) {
    const id = resolveTabId(tab);
    if (id) send({ type: "SET_VISIBILITY", tabId: id, isVisible: true });
  },

  /**
   * Hide a tab from the tab strip without closing it.
   * Tabs that are selected or actively sharing (camera/mic/screen) are ignored.
   */
  // upstream: hideTab@e42b64e8fc FIREFOX_143_0_1_RELEASE
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
  // upstream: duplicateTab@f037fad4e7 FIREFOX_143_0_1_RELEASE
  duplicateTab(tab: MozTabbrowserTab, options: any = {}) {
    const id = resolveTabId(tab);
    if (!id) return null;

    const prev = appState.value;
    send({ type: "DUPLICATE_TAB", tabId: id });
    const next = appState.value;

    const addedId = next.tabOrder.find(i => !prev.tabOrder.includes(i));
    if (!addedId) return null;

    this._createBrowserDOM(addedId, {});

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
  // upstream: moveTabTo@21712a66f3 FIREFOX_143_0_1_RELEASE
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
  // upstream: moveTabBefore@a7ae698efc FIREFOX_143_0_1_RELEASE
  moveTabBefore(tab: MozTabbrowserTab, target: MozTabbrowserTab, _metricsContext?: any) {
    const id = resolveTabId(tab);
    const tid = resolveTabId(target);
    if (!id || !tid) return;
    send({ type: "MOVE_TAB_RELATIVE", tabId: id, targetId: tid, position: "before" });
    const el = DOMRegistry.getTab(id);
    if (el) dispatch(el, "TabMove");
  },

  /** Move a tab to appear immediately after `target` in the tab strip. */
  // upstream: moveTabAfter@e962e188bf FIREFOX_143_0_1_RELEASE
  moveTabAfter(tab: MozTabbrowserTab, target: MozTabbrowserTab, _metricsContext?: any) {
    const id = resolveTabId(tab);
    const tid = resolveTabId(target);
    if (!id || !tid) return;
    send({ type: "MOVE_TAB_RELATIVE", tabId: id, targetId: tid, position: "after" });
    const el = DOMRegistry.getTab(id);
    if (el) dispatch(el, "TabMove");
  },

  /** Move a tab to the first available position (after any pinned tabs). */
  // upstream: moveTabToStart@4d90629390 FIREFOX_143_0_1_RELEASE
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
  // upstream: moveTabToEnd@22d4572adb FIREFOX_143_0_1_RELEASE
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
