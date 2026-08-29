// SPDX-License-Identifier: MPL-2.0
// Ported from tabbrowser.js L906~L974, L2897~L5086, L6178~L7019
// Section: addTab · removeTab/removeTabs · Tab Properties · Tab Movement

import type { TabbrowserCompat } from "../TabbrowserCompat.ts";

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
    closeTabsByURI(urisToClose: any[]): Promise<number>;
    pinTab(tab: MozTabbrowserTab, options?: any): void;
    unpinTab(tab: MozTabbrowserTab): void;
    showTab(tab: MozTabbrowserTab): void;
    hideTab(tab: MozTabbrowserTab, source?: string): void;
    duplicateTab(tab: MozTabbrowserTab, restoreTabImmediately?: boolean, options?: any): any;
    moveTabTo(element: any, options?: any): void;
    moveTabBefore(element: any, targetElement: any, metricsContext?: any): void;
    moveTabAfter(element: any, targetElement: any, metricsContext?: any): void;
    moveTabToStart(tab?: any): void;
    moveTabToEnd(tab?: any): void;
  }
}

export const methods = {
  // ==========================================================================
  // addTab
  // tabbrowser.js L2897~L5086
  // ==========================================================================

  /**
   * Open a tab. `<tab>` first (into the strip at the right place), then
   * its `<browser>`, then TabOpen, then the load. The store hears ADD_TAB
   * until the mirror takes over.
   *
   * @returns The new tab, or null when it could not be created.
   */
  // upstream: addTab@86fe2b6943 FIREFOX_143_0_1_RELEASE
  addTab(
    uriString: string,
    {
      allowInheritPrincipal,
      allowThirdPartyFixup,
      bulkOrderedOpen,
      charset,
      createLazyBrowser,
      disableTRR,
      isCaptivePortalTab,
      eventDetail,
      focusUrlBar,
      forceNotRemote,
      forceAllowDataURI,
      fromExternal,
      inBackground = true,
      elementIndex,
      tabIndex,
      lazyTabTitle,
      name,
      noInitialLabel,
      openWindowInfo,
      openerBrowser,
      originPrincipal,
      originStoragePrincipal,
      ownerTab,
      pinned,
      postData,
      preferredRemoteType,
      remoteType,
      referrerInfo,
      relatedToCurrent,
      initialBrowsingContextGroupId,
      skipAnimation,
      skipBackgroundNotify,
      tabGroup,
      triggeringPrincipal,
      userContextId,
      policyContainer,
      skipLoad = createLazyBrowser,
      globalHistoryOptions,
      triggeringRemoteType,
      schemelessInput,
      hasValidUserGestureActivation = false,
      textDirectiveUserActivation = false,
    }: any = {},
  ): any {
    const win = this.window as any;
    // all callers of addTab that pass a params object need to pass
    // a valid triggeringPrincipal.
    if (!triggeringPrincipal) {
      throw new Error("Required argument triggeringPrincipal missing within addTab");
    }

    if (!win.UserInteraction.running("browser.tabs.opening", win)) {
      win.UserInteraction.start("browser.tabs.opening", "initting", win);
    }

    // If we're opening a foreground tab, set the owner by default.
    ownerTab ??= inBackground ? null : this.selectedTab;

    // if we're adding tabs, we're past interrupt mode, ditch the owner
    if (this.selectedTab.owner) {
      this.selectedTab.owner = null;
    }

    // Find the tab that opened this one, if any. This is used for
    // determining positioning, and inherited attributes such as the
    // user context ID.
    //
    // If we have a browser opener (which is usually the browser
    // element from a remote window.open() call), use that.
    //
    // Otherwise, if the tab is related to the current tab (e.g.,
    // because it was opened by a link click), use the selected tab as
    // the owner. If referrerInfo is set, and we don't have an
    // explicit relatedToCurrent arg, we assume that the tab is
    // related to the current tab, since referrerURI is null or
    // undefined if the tab is opened from an external application or
    // bookmark (i.e. somewhere other than an existing tab).
    if (relatedToCurrent == null) {
      relatedToCurrent = !!(referrerInfo && referrerInfo.originalReferrer);
    }
    const openerTab =
      (openerBrowser && this.getTabForBrowser(openerBrowser)) ||
      (relatedToCurrent && this.selectedTab) ||
      null;

    // When overflowing, new tabs are scrolled into view smoothly, which
    // doesn't go well together with the width transition. So we skip the
    // transition in that case.
    const animate =
      !skipAnimation &&
      !pinned &&
      !this.tabContainer.verticalMode &&
      !this.tabContainer.overflowing &&
      !win.gReduceMotion;

    const uriInfo = this._determineURIToLoad(uriString, createLazyBrowser);
    const { uri: uriObj, uriIsAboutBlank, lazyBrowserURI } = uriInfo;
    // Have to overwrite this if we're lazy-loading. Should go away
    // with bug 1818777.
    ({ uriString } = uriInfo);

    let usingPreloadedContent = false;
    let b: any, t: any;

    try {
      t = this._createTab({
        uriString,
        animate,
        userContextId,
        openerTab,
        pinned,
        noInitialLabel,
        skipBackgroundNotify,
      });
      // Insert the tab into the tab container in the correct position.
      this._insertTabAtIndex(t, {
        elementIndex,
        tabIndex,
        ownerTab,
        openerTab,
        pinned,
        bulkOrderedOpen,
        tabGroup: tabGroup ?? openerTab?.group,
      });

      ({ browser: b, usingPreloadedContent } = this._createBrowserForTab(t, {
        uriString,
        uri: uriObj,
        preferredRemoteType: preferredRemoteType ?? remoteType,
        openerBrowser,
        uriIsAboutBlank,
        referrerInfo,
        forceNotRemote,
        name,
        initialBrowsingContextGroupId,
        openWindowInfo,
        skipLoad,
        triggeringRemoteType,
      }));

      if (focusUrlBar) {
        win.gURLBar.getBrowserState(b).urlbarFocused = true;
      }

      // If the caller opts in, create a lazy browser.
      if (createLazyBrowser) {
        this._createLazyBrowser(t);

        if (lazyBrowserURI) {
          // Lazy browser must be explicitly registered so tab will appear as
          // a switch-to-tab candidate in autocomplete.
          this.UrlbarProviderOpenTabs.registerOpenTab(
            lazyBrowserURI.spec,
            t.userContextId,
            tabGroup?.id,
            win.PrivateBrowsingUtils.isWindowPrivate(win),
          );
          b.registeredOpenURI = lazyBrowserURI;
        }
        // tabbrowser.js skips this for insertTab: false (session restore
        // inserting the tabs itself); this compat always inserts the tab.
        SessionStore.setTabState(t, {
          entries: [
            {
              url: lazyBrowserURI?.spec || "about:blank",
              title: lazyTabTitle,
              triggeringPrincipal_base64: E10SUtils.serializePrincipal(triggeringPrincipal),
            },
          ],
          // Make sure to store the userContextId associated to the lazy tab
          // otherwise it would be created as a default tab when recreated on a
          // session restore (See Bug 1819794).
          userContextId,
        });
      } else {
        this._insertBrowser(t, true);
        // If we were called by frontend and don't have openWindowInfo,
        // but we were opened from another browser, set the cross group
        // opener ID:
        if (openerBrowser && !openWindowInfo) {
          b.browsingContext.crossGroupOpener = openerBrowser.browsingContext;
        }
      }
    } catch (e) {
      console.error("Failed to create tab");
      console.error(e);
      t?.remove();
      if (t?.linkedBrowser) {
        this._tabFilters.delete(t);
        this._tabListeners.delete(t);
        this.getPanel(t.linkedBrowser).remove();
      }
      return null;
    }

    // Fire a TabOpen event
    this._fireTabOpen(t, eventDetail);

    this._kickOffBrowserLoad(b, {
      uri: uriObj,
      uriString,
      usingPreloadedContent,
      triggeringPrincipal,
      originPrincipal,
      originStoragePrincipal,
      uriIsAboutBlank,
      allowInheritPrincipal,
      allowThirdPartyFixup,
      fromExternal,
      // 143 callers say disableTRR, 154 (which _kickOffBrowserLoad follows) isCaptivePortalTab
      isCaptivePortalTab: isCaptivePortalTab ?? disableTRR,
      forceAllowDataURI,
      skipLoad,
      referrerInfo,
      charset,
      postData,
      policyContainer,
      globalHistoryOptions,
      triggeringRemoteType,
      schemelessInput,
      hasValidUserGestureActivation:
        hasValidUserGestureActivation || !!openWindowInfo?.hasValidUserGestureActivation,
      textDirectiveUserActivation:
        textDirectiveUserActivation || !!openWindowInfo?.textDirectiveUserActivation,
    });

    // This field is updated regardless if we actually animate
    // since it's important that we keep this count correct in all cases.
    this.tabAnimationsInProgress++;

    if (animate) {
      // Kick the animation off.
      // TODO: we should figure out a better solution here. We use RAF
      // to avoid jank of the animation due to synchronous work happening
      // on tab open.
      // With preloaded content though a single RAF happens too early. and
      // both the transition and the transitionend event don't happen.
      if (usingPreloadedContent) {
        win.requestAnimationFrame(() => {
          win.requestAnimationFrame(() => {
            t.setAttribute("fadein", "true");
          });
        });
      } else {
        win.requestAnimationFrame(() => {
          t.setAttribute("fadein", "true");
        });
      }
    }

    // Additionally send pinned tab events
    if (pinned) {
      this._notifyPinnedStatus(t);
    }

    win.gSharedTabWarning.tabAdded(t);

    if (!inBackground) {
      this.selectedTab = t;
    }
    return t;
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

    this.tabContainer._invalidateCachedVisibleTabs();

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
    this.tabContainer._invalidateCachedTabs();

    // Invalidate hovered tab state tracking for this closing tab.
    tab._mouseleave();

    if (newTab) {
      this.addTrustedTab("about:newtab", {
        skipAnimation: true,
        // In the event that insertAfterCurrent is set and the current tab is
        // inside a group that is being closed we want to avoid creating the
        // new tab inside that group.
        tabIndex: 0,
      });
    } else {
      win.TabBarVisibility.update();
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
        const bc = t.linkedBrowser.browsingContext;
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
    this.tabContainer._invalidateCachedTabs();

    // ... and fix up the _tPos properties immediately.
    for (let i = tab._tPos; i < this.tabs.length; i++) {
      (this.tabs[i] as any)._tPos = i;
    }

    if (!this._windowIsClosing) {
      // update tab close buttons state
      this.tabContainer._updateCloseButtons();

      setTimeout(
        (tabs: any) => {
          tabs._lastTabClosedByMouse = false;
        },
        0,
        this.tabContainer,
      );
    }

    // update tab positional properties and attributes
    this.selectedTab._selected = true;

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
    if (win.UserInteraction.running("browser.tabs.opening", win)) {
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
   * Close several tabs at once: whole groups go through removeTabGroup
   * (and get saved), beforeunload runs in parallel, prompts run in turn,
   * and the selected tab goes last so the selection moves only once.
   */
  // upstream: removeTabs@c87819e103 FIREFOX_143_0_1_RELEASE
  removeTabs(
    tabs: MozTabbrowserTab[],
    {
      animate = true,
      suppressWarnAboutClosingWindow = false,
      skipPermitUnload = false,
      skipSessionStore = false,
      skipGroupCheck = false,
      isUserTriggered = false,
      telemetrySource,
    }: any = {},
  ) {
    const win = this.window as any;
    // When 'closeWindowWithLastTab' pref is enabled, closing all tabs
    // can be considered equivalent to closing the window.
    if (this.tabs.length == tabs.length && Services.prefs.getBoolPref("browser.tabs.closeWindowWithLastTab")) {
      win.closeWindow(true, suppressWarnAboutClosingWindow ? null : win.warnAboutClosingWindow, "close-last-tab");
      return;
    }

    if (!skipSessionStore) {
      SessionStore.resetLastClosedTabCount(win);
    }
    this._clearMultiSelectionLocked = true;

    // Guarantee that _clearMultiSelectionLocked lock gets released.
    try {
      // If selection includes entire groups, we might want to save them
      if (!skipGroupCheck) {
        const [groups, leftoverTabs] = this._separateWholeGroups(tabs);
        groups.forEach((group: any) => {
          if (!skipSessionStore) {
            group.save();
          }
          this.removeTabGroup(group, {
            animate,
            skipSessionStore,
            skipPermitUnload,
            isUserTriggered,
            telemetrySource,
          });
        });
        tabs = leftoverTabs;
      }

      const { beforeUnloadComplete, tabsWithBeforeUnloadPrompt, lastToClose } = this._startRemoveTabs(tabs, {
        animate,
        suppressWarnAboutClosingWindow,
        skipPermitUnload,
        skipRemoves: false,
        skipSessionStore,
        isUserTriggered,
        telemetrySource,
      });

      // Wait for all the beforeunload events to have been processed by content processes.
      // The permitUnload() promise will, alas, not call its resolution
      // callbacks after the browser window the promise lives in has closed,
      // so we have to check for that case explicitly.
      let done = false;
      beforeUnloadComplete.then(() => {
        done = true;
      });
      Services.tm.spinEventLoopUntilOrQuit("tabbrowser.js:removeTabs", () => done || win.closed);
      if (!done) {
        return;
      }

      const aParams = {
        animate,
        prewarmed: true,
        skipPermitUnload,
        skipSessionStore,
        isUserTriggered,
        telemetrySource,
      };

      // Now run again sequentially the beforeunload listeners that will result in a prompt.
      for (const tab of tabsWithBeforeUnloadPrompt) {
        this.removeTab(tab, aParams);
        if (!tab.closing) {
          // If we abort the closing of the tab.
          tab._closedInMultiselection = false;
        }
      }

      // Avoid changing the selected browser several times by removing it,
      // if appropriate, lastly.
      if (lastToClose) {
        this.removeTab(lastToClose, aParams);
      }
    } catch (e) {
      console.error(e);
    }

    this._clearMultiSelectionLocked = false;
    this._avoidSingleSelectedTab();
  },

  /** Close every open tab but `aTab` (and, by default, pinned and hidden ones). */
  // upstream: removeAllTabsBut@5f46de5ec6 FIREFOX_143_0_1_RELEASE
  removeAllTabsBut(aTab: any, aParams: any = {}) {
    const { skipWarnAboutClosingTabs = false, skipPinnedOrSelectedTabs = true } = aParams;

    let filterFn: (tab: any) => boolean;

    // If enabled also filter by selected or pinned state.
    if (skipPinnedOrSelectedTabs) {
      if (aTab?.multiselected) {
        filterFn = (tab) => !tab.multiselected && !tab.pinned && !tab.hidden;
      } else {
        filterFn = (tab) => tab != aTab && !tab.pinned && !tab.hidden;
      }
    } else {
      // Exclude just aTab from being removed.
      filterFn = (tab) => tab != aTab;
    }

    const tabsToRemove = this.openTabs.filter(filterFn);

    // If enabled show the tab close warning.
    if (
      !skipWarnAboutClosingTabs &&
      !this.warnAboutClosingTabs(tabsToRemove.length, this.closingTabsEnum.OTHER)
    ) {
      return;
    }

    this.removeTabs(tabsToRemove, aParams);
  },

  /** Close every tab whose current URI equals one of `urisToClose` (nsIURIs); resolves to the count. */
  // upstream: closeTabsByURI@9fe20b8380 FIREFOX_143_0_1_RELEASE
  async closeTabsByURI(urisToClose: any[]): Promise<number> {
    const tabsToRemove: any[] = [];
    for (const tab of this.tabs) {
      const currentURI = tab.linkedBrowser!.currentURI;
      // Find any URI that matches the current tab's URI
      const matchedIndex = urisToClose.findIndex((uriToClose) => uriToClose.equals(currentURI));

      if (matchedIndex > -1) {
        tabsToRemove.push(tab);
      }
    }

    let closedCount = 0;

    if (tabsToRemove.length) {
      const { beforeUnloadComplete, lastToClose } = this._startRemoveTabs(tabsToRemove, {
        animate: false,
        suppressWarnAboutClosingWindow: true,
        skipPermitUnload: false,
        skipRemoves: false,
        skipSessionStore: false,
      });

      // Wait for the beforeUnload handlers to complete.
      await beforeUnloadComplete;

      closedCount = tabsToRemove.length - (lastToClose ? 1 : 0);

      // _startRemoveTabs doesn't close the last tab in the window
      // for this use case, we simply close it
      if (lastToClose) {
        this.removeTab(lastToClose);
        closedCount++;
      }
    }
    return closedCount;
  },

  // ==========================================================================
  // Tab Properties (pinTab, unpinTab, etc.)
  // tabbrowser.js L906~L973
  // ==========================================================================

  /** Pin `aTab`: it moves into the pinned container and gets the `pinned` attribute. */
  // upstream: pinTab@84399e5062 FIREFOX_143_0_1_RELEASE
  pinTab(aTab: MozTabbrowserTab, { telemetrySource }: any = {}) {
    telemetrySource ??= this.TabMetrics.METRIC_SOURCE.UNKNOWN;
    const tab = aTab as any;
    if (tab.pinned || tab == (this.window as any).FirefoxViewHandler.tab) {
      return;
    }

    this.showTab(tab);
    this._handleTabMove(tab, () => this.pinnedTabsContainer.appendChild(tab));

    tab.setAttribute("pinned", "true");
    this._updateTabBarForPinnedTabs();
    this._notifyPinnedStatus(tab, { telemetrySource });
  },

  // upstream: unpinTab@487c881bd5 FIREFOX_143_0_1_RELEASE
  unpinTab(aTab: MozTabbrowserTab) {
    const tab = aTab as any;
    if (!tab.pinned) {
      return;
    }

    this._handleTabMove(tab, () => {
      // we remove this attribute first, so that allTabs represents
      // the moving of a tab from the pinned tabs container
      // and back into arrowscrollbox.
      tab.removeAttribute("pinned");
      this.tabContainer.arrowScrollbox.prepend(tab);
    });

    tab.style.marginInlineStart = "";
    tab._pinnedUnscrollable = false;
    this._updateTabBarForPinnedTabs();
    this._notifyPinnedStatus(tab);
  },

  /**
   * Preview a tab without permanently selecting it.
   * Simplified version — just selects the tab.
   */

  // upstream: showTab@65a3fea873 FIREFOX_143_0_1_RELEASE
  showTab(aTab: MozTabbrowserTab) {
    const tab = aTab as any;
    if (!tab.hidden || tab == (this.window as any).FirefoxViewHandler.tab) {
      return;
    }
    tab.removeAttribute("hidden");
    this.tabContainer._invalidateCachedVisibleTabs();

    this.tabContainer._updateCloseButtons();
    if (tab.multiselected) {
      this._updateMultiselectedTabCloseButtonTooltip();
    }

    const event = this.window.document.createEvent("Events");
    event.initEvent("TabShow", true, false);
    tab.dispatchEvent(event);
    SessionStore.deleteCustomTabValue(tab, "hiddenBy");
  },

  // upstream: hideTab@e42b64e8fc FIREFOX_143_0_1_RELEASE
  hideTab(aTab: MozTabbrowserTab, aSource?: string) {
    const tab = aTab as any;
    if (
      tab.hidden ||
      tab.pinned ||
      tab.selected ||
      tab.closing ||
      // Tabs that are sharing the screen, microphone or camera cannot be hidden.
      tab._sharingState?.webRTC?.sharing
    ) {
      return;
    }
    tab.setAttribute("hidden", "true");
    this.tabContainer._invalidateCachedVisibleTabs();

    this.tabContainer._updateCloseButtons();
    if (tab.multiselected) {
      this._updateMultiselectedTabCloseButtonTooltip();
    }

    // Splice this tab out of any lines of succession before any events are
    // dispatched.
    this.replaceInSuccession(tab, tab.successor);
    this.setSuccessor(tab, null);

    const event = this.window.document.createEvent("Events");
    event.initEvent("TabHide", true, false);
    tab.dispatchEvent(event);
    if (aSource) {
      SessionStore.setCustomTabValue(tab, "hiddenBy", aSource);
    }
  },

  /** SessionStore clones the tab (history included) right after the original. */
  // upstream: duplicateTab@f037fad4e7 FIREFOX_143_0_1_RELEASE
  duplicateTab(aTab: MozTabbrowserTab, aRestoreTabImmediately?: boolean, aOptions?: any) {
    return SessionStore.duplicateTab(this.window, aTab, 0, aRestoreTabImmediately, aOptions);
  },

  // ==========================================================================
  // Tab Movement (moveTabTo, etc.)
  // tabbrowser.js L6461~L7019
  // ==========================================================================

  /**
   * Move a tab (or a group, or a group's label) to `tabIndex` / `elementIndex`.
   * Pinned stays with pinned, unpinned with unpinned.
   */
  // upstream: moveTabTo@21712a66f3 FIREFOX_143_0_1_RELEASE
  moveTabTo(
    element: any,
    {
      elementIndex,
      tabIndex,
      forceUngrouped = false,
      isUserTriggered = false,
      telemetrySource,
    }: any = {},
  ) {
    telemetrySource ??= this.TabMetrics.METRIC_SOURCE.UNKNOWN;
    if (typeof elementIndex == "number") {
      tabIndex = this._elementIndexToTabIndex(elementIndex);
    }

    // Don't allow mixing pinned and unpinned tabs.
    if (this.isTab(element) && element.pinned) {
      tabIndex = Math.min(tabIndex, this.pinnedTabCount - 1);
    } else {
      tabIndex = Math.max(tabIndex, this.pinnedTabCount);
    }

    // Return early if the tab is already in the right spot.
    if (this.isTab(element) && element._tPos == tabIndex && !(element.group && forceUngrouped)) {
      return;
    }

    // When asked to move a tab group label, we need to move the whole group
    // instead.
    if (this.isTabGroupLabel(element)) {
      element = element.group;
    }
    if (this.isTabGroup(element)) {
      forceUngrouped = true;
    }

    this._handleTabMove(
      element,
      () => {
        let neighbor: any = this.tabs[tabIndex];
        if (forceUngrouped && neighbor?.group) {
          neighbor = neighbor.group;
        }
        if (neighbor && this.isTab(element) && tabIndex > element._tPos) {
          neighbor.after(element);
        } else {
          this.tabContainer.insertBefore(element, neighbor);
        }
      },
      { isUserTriggered, telemetrySource },
    );
  },

  // upstream: moveTabBefore@a7ae698efc FIREFOX_143_0_1_RELEASE
  moveTabBefore(element: any, targetElement: any, metricsContext?: any) {
    this._moveTabNextTo(element, targetElement, true, metricsContext);
  },

  // upstream: moveTabAfter@e962e188bf FIREFOX_143_0_1_RELEASE
  moveTabAfter(element: any, targetElement: any, metricsContext?: any) {
    this._moveTabNextTo(element, targetElement, false, metricsContext);
  },

  // upstream: moveTabToStart@4d90629390 FIREFOX_143_0_1_RELEASE
  moveTabToStart(aTab?: any) {
    this.moveTabTo(aTab ?? this.selectedTab, { tabIndex: 0, forceUngrouped: true });
  },
  // upstream: moveTabToEnd@22d4572adb FIREFOX_143_0_1_RELEASE
  moveTabToEnd(aTab?: any) {
    this.moveTabTo(aTab ?? this.selectedTab, {
      tabIndex: this.tabs.length - 1,
      forceUngrouped: true,
    });
  },
} satisfies Partial<TabbrowserCompat> & ThisType<TabbrowserCompat>;
