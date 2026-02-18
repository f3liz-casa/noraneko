// SPDX-License-Identifier: MPL-2.0
// Ported from tabbrowser.js L816~L2153
// Section: Panels · Browser Discard · Find Bar · Notifications

import type { TabbrowserCompat } from "../TabbrowserCompat.ts";
import { appState, selectedTab as selectedTabSignal } from "../../state/store.ts";
import * as TabOps from "../../ops/tab-ops.ts";
import { DOMRegistry } from "../DOMRegistry.ts";
import type { TabId } from "../../types/TabState.ts";
import { resolveTabId, dispatch } from "../compat-helpers.ts";

declare const document: any;
declare const requestAnimationFrame: (cb: () => void) => void;

/** @augments TabbrowserCompat */
declare module "../TabbrowserCompat.ts" {
  interface TabbrowserCompat {
    // Class fields used by this module
    _windowIsClosing: boolean;
    _nextNotificationBoxId: number;
    _notificationEnableDelay: number;
    _uniquePanelIDCounter: number;
    // Methods
    getBrowserContainer(browser?: any): any;
    getBrowserForOuterWindowID(id: number): any;
    getTabFromAudioEvent(event: Event): any;
    getTabPids(tab: MozTabbrowserTab): number[];
    _mayDiscardBrowser(tab: MozTabbrowserTab, skipBeforeUnloadCheck?: boolean): boolean;
    _hasBeforeUnload(tab: MozTabbrowserTab): boolean;
    getCachedFindBar(tab?: any): any;
    isFindBarInitialized(tab?: any): boolean;
    _createFindBar(tab: MozTabbrowserTab, focused?: boolean): Promise<any>;
    getFindBar(tab?: any): Promise<any>;
    _setFindbarData(findBar: any, tab: MozTabbrowserTab): void;
    getNotificationBox(browser?: any): any;
    getTabDialogBox(browser?: any): any;
    readNotificationBox(browser: XULBrowserElement): any;
    getTabNotificationDeck(): any;
    _updateVisibleNotificationBox(browser: XULBrowserElement): void;
    appendStatusPanel(browser?: any): any;
    addNewBadge(tab: MozTabbrowserTab, options?: any): void;
  }
}

export const methods: Partial<TabbrowserCompat> & ThisType<TabbrowserCompat> = {
  // ==========================================================================
  // Panels & Containers (getNotificationBox, etc.)
  // tabbrowser.js L1000~L1053
  // ==========================================================================

  _generateUniquePanelID(): string {
    if (!this._uniquePanelIDCounter) {
      this._uniquePanelIDCounter = 0;
    }
    const outerID = this.window.docShell?.outerWindowID;
    // Use monotonic counter to avoid collisions
    return `panel-${outerID}-${++this._uniquePanelIDCounter}`;
  },

  _setupInitialBrowserAndTab() {
    // See browser.js for the meaning of window.arguments
    let userContextId = (this.window as any).arguments?.[5];
    
    let openWindowInfo;
    try {
      openWindowInfo = this.window.docShell?.treeOwner
        ?.QueryInterface(Ci.nsIInterfaceRequestor)
        ?.getInterface(Ci.nsIAppWindow)?.initialOpenWindowInfo;
    } catch (_) { /* */ }

    if (!openWindowInfo && (this.window as any).arguments?.[11]) {
      openWindowInfo = (this.window as any).arguments[11];
    }

    let extraOptions;
    if ((this.window as any).arguments?.[1] instanceof Ci.nsIPropertyBag2) {
      extraOptions = (this.window as any).arguments[1];
    }

    let triggeringRemoteType;
    if (extraOptions?.hasKey?.("triggeringRemoteType")) {
      try {
        triggeringRemoteType = extraOptions.getPropertyAsACString("triggeringRemoteType");
      } catch (_) { /* */ }
    }

    const tabArgument = gBrowserInit?.getTabToAdopt?.();

    let remoteType;
    let initialBrowsingContextGroupId;

    if (tabArgument?.hasAttribute?.("usercontextid")) {
      userContextId = parseInt(tabArgument.getAttribute("usercontextid"), 10);
    }

    if (tabArgument?.linkedBrowser) {
      remoteType = tabArgument.linkedBrowser.remoteType;
      initialBrowsingContextGroupId = tabArgument.linkedBrowser.browsingContext?.group?.id;
    } else if (openWindowInfo) {
      userContextId = openWindowInfo.originAttributes?.userContextId;
      if (openWindowInfo.isRemote) {
        remoteType = triggeringRemoteType ?? E10SUtils.DEFAULT_REMOTE_TYPE;
      } else {
        remoteType = E10SUtils.NOT_REMOTE;
      }
    } else {
      let uriToLoad = gBrowserInit?.uriToLoadPromise;
      if (uriToLoad && Array.isArray(uriToLoad)) {
        uriToLoad = uriToLoad[0];
      }

      if (uriToLoad && typeof uriToLoad === "string") {
        const oa = E10SUtils.predictOriginAttributes({
          window: this.window,
          userContextId,
        });
        remoteType = E10SUtils.getRemoteTypeForURI(
          uriToLoad,
          gMultiProcessBrowser,
          gFissionBrowser,
          triggeringRemoteType ?? E10SUtils.DEFAULT_REMOTE_TYPE,
          null,
          oa
        );
      } else {
        if (Cu.isInAutomation) {
          ChromeUtils.releaseAssert(
            !triggeringRemoteType,
            "Unexpected triggeringRemoteType with no uriToLoad"
          );
        }
        remoteType = E10SUtils.PRIVILEGEDABOUT_REMOTE_TYPE;
      }
    }

    const createOptions = {
      uriIsAboutBlank: false,
      userContextId,
      initialBrowsingContextGroupId,
      remoteType,
      openWindowInfo,
    };

    const browser = this.createBrowser(createOptions);
    browser.setAttribute("primary", "true");
    if (gBrowserAllowScriptsToCloseInitialTabs) {
      browser.setAttribute("allowscriptstoclose", "true");
    }
    browser.droppedLinkHandler = handleDroppedLink;
    browser.loadURI = URILoadingWrapper.loadURI.bind(URILoadingWrapper, browser);
    browser.fixupAndLoadURIString = URILoadingWrapper.fixupAndLoadURIString.bind(
      URILoadingWrapper,
      browser
    );

    const uniqueId = this._generateUniquePanelID();
    const panel = this.getPanel(browser);
    panel.id = uniqueId;
    try {
      const tabpanels = this.window.document.getElementById("tabbrowser-tabpanels");
      tabpanels?.appendChild?.(panel);
    } catch (_) { /* */ }

    const tab = this.tabs[0];
    if (tab) {
      (tab as any).linkedPanel = uniqueId;
      (tab as any)._tPos = 0;
      (tab as any)._fullyOpen = true;
      (tab as any).linkedBrowser = browser;
      (tab as any).permanentKey = browser.permanentKey;

      if (userContextId) {
        tab.setAttribute("usercontextid", userContextId);
        ContextualIdentityService?.setTabStyle?.(tab);
      }

      this._tabForBrowser.set(browser, tab);
      this.appendStatusPanel();

      browser.docShellIsActive = this.shouldActivateDocShell(browser);

      // Hook up progress listener
      try { this._wireProgressListener(tab, browser); } catch (_) { /* */ }
    }
  },

  _setFindbarData() {
    // Ensure content processes know the find bar keyboard shortcut
    try {
      const { sharedData } = Services.ppmm;
      if (!sharedData.has("Findbar:Shortcut")) {
        const keyEl = this.window.document.getElementById("key_find");
        if (keyEl) {
          let mods = keyEl.getAttribute("modifiers") || "";
          mods = mods.replace(
            /accel/i,
            AppConstants.platform === "macosx" ? "meta" : "control"
          );
          sharedData.set("Findbar:Shortcut", {
            key: keyEl.getAttribute("key"),
            shiftKey: mods.includes("shift"),
            ctrlKey: mods.includes("control"),
            altKey: mods.includes("alt"),
            metaKey: mods.includes("meta"),
          });
        }
      }
    } catch (_) { /* */ }
  },

  _createTab({
    uriString,
    userContextId,
    openerTab,
    pinned,
    noInitialLabel,
    skipBackgroundNotify,
    animate,
  }: any): any {
    const t = this._xulEl("tab", { is: "tabbrowser-tab" }) as any;
    
    // Tag as being created so extension code can ignore pre-TabOpen events
    (t as any).initializingTab = true;
    (t as any).openerTab = openerTab;

    // Inherit user context from opener if not specified
    if (userContextId == null && openerTab) {
      userContextId = openerTab.getAttribute?.("usercontextid") || 0;
    }

    if (!noInitialLabel) {
      if (isBlankPageURL(uriString)) {
        t.setAttribute("label", this.tabContainer?.emptyTabTitle || "New Tab");
      } else {
        this.setInitialTabTitle(t, uriString, {
          beforeTabOpen: true,
          isURL: true,
        });
      }
    }

    if (userContextId) {
      t.setAttribute("usercontextid", userContextId);
      ContextualIdentityService?.setTabStyle?.(t);
    }

    if (skipBackgroundNotify) {
      t.setAttribute("skipbackgroundnotify", "true");
    }

    if (pinned) {
      t.setAttribute("pinned", "true");
    }

    t.classList.add("tabbrowser-tab");

    this.tabContainer?._unlockTabSizing?.();

    if (!animate) {
      (this.window as any).UserInteraction?.update?.("browser.tabs.opening", "not-animated", this.window);
      t.setAttribute("fadein", "true");
      // Call _handleNewTab asynchronously
      setTimeout(() => {
        this.tabContainer?._handleNewTab?.(t);
      }, 0);
    } else {
      (this.window as any).UserInteraction?.update?.("browser.tabs.opening", "animated", this.window);
    }

    return t;
  },

  _createBrowserForTab(
    tab: MozTabbrowserTab,
    {
      uriString,
      uri,
      name,
      preferredRemoteType,
      openerBrowser,
      uriIsAboutBlank,
      referrerInfo,
      forceNotRemote,
      initialBrowsingContextGroupId,
      openWindowInfo,
      skipLoad,
      triggeringRemoteType,
    }: any
  ): any {
    // Resolve preferred remote type
    if (!preferredRemoteType && triggeringRemoteType) {
      preferredRemoteType = triggeringRemoteType;
    }

    if (!preferredRemoteType && openerBrowser) {
      preferredRemoteType = openerBrowser.remoteType;
    }

    const { userContextId } = tab;
    const oa = E10SUtils.predictOriginAttributes({ window: this.window, userContextId });

    // For about:blank with referrer, use referrer's remote type
    if (
      uriIsAboutBlank &&
      !preferredRemoteType &&
      referrerInfo?.originalReferrer
    ) {
      preferredRemoteType = E10SUtils.getRemoteTypeForURI(
        referrerInfo.originalReferrer.spec,
        gMultiProcessBrowser,
        gFissionBrowser,
        E10SUtils.DEFAULT_REMOTE_TYPE,
        null,
        oa
      );
    }

    const remoteType = forceNotRemote
      ? E10SUtils.NOT_REMOTE
      : E10SUtils.getRemoteTypeForURI(
          uriString,
          gMultiProcessBrowser,
          gFissionBrowser,
          preferredRemoteType,
          null,
          oa
        );

    let b;
    let usingPreloadedContent = false;

    // Check for preloaded browser (newtab in default context)
    const BROWSER_NEW_TAB_URL = "about:newtab";
    if (uriString === BROWSER_NEW_TAB_URL && !userContextId) {
      b = (this.window as any).NewTabPagePreloading?.getPreloadedBrowser?.(this.window);
      if (b) {
        usingPreloadedContent = true;
      }
    }

    if (!b) {
      b = this.createBrowser({
        remoteType,
        uriIsAboutBlank,
        userContextId,
        initialBrowsingContextGroupId,
        openWindowInfo,
        name,
        skipLoad,
      });
    }

    (tab as any).linkedBrowser = b;
    this._tabForBrowser.set(b, tab);
    (tab as any).permanentKey = b.permanentKey;
    (tab as any)._browserParams = {
      uriIsAboutBlank,
      remoteType,
      usingPreloadedContent,
    };

    // Set default favicon for known pages
    this.setDefaultIcon(tab, uri);

    return { browser: b, usingPreloadedContent };
  },

  _kickOffBrowserLoad(
    browser: XULBrowserElement,
    {
      uri,
      uriString,
      usingPreloadedContent,
      triggeringPrincipal,
      originPrincipal,
      originStoragePrincipal,
      uriIsAboutBlank,
      allowInheritPrincipal,
      allowThirdPartyFixup,
      fromExternal,
      forceAllowDataURI,
      isCaptivePortalTab,
      skipLoad,
      referrerInfo,
      charset,
      postData,
      policyContainer,
      globalHistoryOptions,
      triggeringRemoteType,
      schemelessInput,
      hasValidUserGestureActivation,
      textDirectiveUserActivation,
    }: any
  ) {
    // Create about:blank viewer with correct principals if needed
    if (
      !usingPreloadedContent &&
      originPrincipal &&
      originStoragePrincipal &&
      uriString
    ) {
      const { URI_INHERITS_SECURITY_CONTEXT } = Ci.nsIProtocolHandler;
      try {
        if (!uri || ((this.window as any).doGetProtocolFlags?.(uri) & URI_INHERITS_SECURITY_CONTEXT)) {
          browser.createAboutBlankDocumentViewer?.(
            originPrincipal,
            originStoragePrincipal
          );
        }
      } catch (_) { /* */ }
    }

    // Load the URL if not using preloaded content
    if (
      !usingPreloadedContent &&
      (!uriIsAboutBlank || !allowInheritPrincipal) &&
      !skipLoad
    ) {
      // Set user typed value for non-initial pages
      const gInitialPages = ["about:blank", "about:newtab", "about:home", "about:welcome"];
      if (uriString && !gInitialPages.includes(uriString)) {
        browser.userTypedValue = uriString;
      }

      const LOAD_FLAGS_NONE = 0;
      const LOAD_FLAGS_FROM_EXTERNAL = Ci.nsIWebNavigation.LOAD_FLAGS_FROM_EXTERNAL;
      const LOAD_FLAGS_FIRST_LOAD = Ci.nsIWebNavigation.LOAD_FLAGS_FIRST_LOAD;
      const LOAD_FLAGS_DISALLOW_INHERIT_PRINCIPAL = Ci.nsIWebNavigation.LOAD_FLAGS_DISALLOW_INHERIT_PRINCIPAL;
      const LOAD_FLAGS_ALLOW_THIRD_PARTY_FIXUP = Ci.nsIWebNavigation.LOAD_FLAGS_ALLOW_THIRD_PARTY_FIXUP;
      const LOAD_FLAGS_FIXUP_SCHEME_TYPOS = Ci.nsIWebNavigation.LOAD_FLAGS_FIXUP_SCHEME_TYPOS;
      const LOAD_FLAGS_DISABLE_TRR = Ci.nsIWebNavigation.LOAD_FLAGS_DISABLE_TRR;
      const LOAD_FLAGS_FORCE_ALLOW_DATA_URI = Ci.nsIWebNavigation.LOAD_FLAGS_FORCE_ALLOW_DATA_URI;

      let loadFlags = LOAD_FLAGS_NONE;
      if (allowThirdPartyFixup) {
        loadFlags |= LOAD_FLAGS_ALLOW_THIRD_PARTY_FIXUP | LOAD_FLAGS_FIXUP_SCHEME_TYPOS;
      }
      if (fromExternal) {
        loadFlags |= LOAD_FLAGS_FROM_EXTERNAL;
      } else if (!triggeringPrincipal?.isSystemPrincipal) {
        loadFlags |= LOAD_FLAGS_FIRST_LOAD;
      }
      if (!allowInheritPrincipal) {
        loadFlags |= LOAD_FLAGS_DISALLOW_INHERIT_PRINCIPAL;
      }
      if (isCaptivePortalTab) {
        loadFlags |= LOAD_FLAGS_DISABLE_TRR;
      }
      if (forceAllowDataURI) {
        loadFlags |= LOAD_FLAGS_FORCE_ALLOW_DATA_URI;
      }

      try {
        browser.fixupAndLoadURIString?.(uriString, {
          loadFlags,
          triggeringPrincipal,
          referrerInfo,
          charset,
          postData,
          policyContainer,
          globalHistoryOptions,
          triggeringRemoteType,
          schemelessInput,
          hasValidUserGestureActivation,
          textDirectiveUserActivation,
          isCaptivePortalTab,
        });
      } catch (ex) {
        console.error("Failed to load URI:", ex);
      }
    }
  },

  _fireTabOpen(tab: MozTabbrowserTab, eventDetail: any = {}) {
    const evt = new CustomEvent("TabOpen", {
      bubbles: true,
      detail: eventDetail,
    });
    (tab as any).dispatchEvent?.(evt);
  },

  // ==========================================================================
  // Browser Management & Discard (discardBrowser, etc.)
  // tabbrowser.js L2714~L2896
  // ==========================================================================

  _mayDiscardBrowser(aTab: MozTabbrowserTab, aForceDiscard?: boolean): boolean {
    const browser = aTab?.linkedBrowser;
    if (!browser) return false;

    const action = aForceDiscard ? "unload" : "dontUnload";

    if (
      !aTab ||
      aTab.selected ||
      aTab.closing ||
      this._windowIsClosing ||
      !browser.isConnected ||
      !browser.isRemoteBrowser ||
      !browser.permitUnload?.(action)?.permitUnload
    ) {
      return false;
    }

    // Don't discard if dialogs are open (unless forcing)
    if (
      !aForceDiscard &&
      this.getTabDialogBox(browser)?._tabDialogManager?._dialogs?.length
    ) {
      return false;
    }

    return true;
  },

  /**
   * Flushes the tab's session state to disk in preparation for discarding its browser.
   *
   * Must be awaited before calling `discardBrowser` to avoid losing session history.
   */
  async prepareDiscardBrowser(aTab: MozTabbrowserTab): Promise<void> {
    const browser = aTab?.linkedBrowser;
    if (!browser) return;

    // Don't prepare if already closing or not remote
    if (aTab.closing || this._windowIsClosing || !browser.isRemoteBrowser) {
      return;
    }

    // Flush tab state to session store
    try {
      await this.TabStateFlusher?.flush?.(browser);
    } catch (e) {
      console.warn("Failed to flush tab state before discard", e);
    }
  },

  /**
   * Discards a tab's browser to free memory, replacing it with a lazy placeholder.
   *
   * The tab visually remains in the strip; the browser is recreated on next selection.
   * Returns `false` if the browser cannot be discarded (e.g., the tab is selected or
   * has open dialogs).
   *
   * @param aForceDiscard - Skip the beforeunload check and force-close any open dialogs.
   */
  discardBrowser(aTab: MozTabbrowserTab, aForceDiscard?: boolean): boolean {
    const browser = aTab?.linkedBrowser;
    if (!browser) return false;

    if (!this._mayDiscardBrowser(aTab, aForceDiscard)) {
      return false;
    }

    // Reset sharing state
    if (aTab._sharingState) {
      this.resetBrowserSharing?.(browser);
    }
    try {
      webrtcUI?.forgetStreamsFromBrowserContext?.(browser.browsingContext);
    } catch (_) { /* */ }

    // Abort any open dialogs
    try {
      const tabDialogBox = this.getTabDialogBox(browser);
      tabDialogBox?.abortAllDialogs?.();
    } catch (_) { /* */ }

    // Save browser parameters for restoration
    aTab._browserParams = {
      uriIsAboutBlank: browser.currentURI?.spec === "about:blank",
      remoteType: browser.remoteType,
      usingPreloadedContent: false,
    };

    // Reset browser to lazy state in SessionStore
    try {
      SessionStore?.resetBrowserToLazyState?.(aTab);
    } catch (_) { /* */ }

    if (aForceDiscard) {
      aTab.toggleAttribute?.("discarded", true);
    }

    // Remove progress listeners
    const filter = this._tabFilters.get(aTab);
    const listener = this._tabListeners.get(aTab);
    if (filter && listener) {
      try {
        browser.webProgress?.removeProgressListener?.(filter);
        filter.removeProgressListener?.(listener);
        listener.destroy?.();
      } catch (_) { /* */ }
    }
    this._tabListeners.delete(aTab);
    this._tabFilters.delete(aTab);

    // Remove findbar if present
    if (aTab._findBar) {
      try {
        aTab._findBar.close?.(true);
        aTab._findBar.remove?.();
        delete aTab._findBar;
      } catch (_) { /* */ }
    }

    // Clean up potentially stale attributes
    const attributesToRemove = [
      "activemedia-blocked",
      "busy",
      "pendingicon",
      "progress",
      "soundplaying",
    ];
    const removedAttributes: string[] = [];
    for (const attr of attributesToRemove) {
      if (aTab.hasAttribute?.(attr)) {
        removedAttributes.push(attr);
        aTab.removeAttribute(attr);
      }
    }
    if (removedAttributes.length) {
      this._tabAttrModified?.(aTab, removedAttributes);
    }

    browser.destroy?.();
    this.getPanel(browser)?.remove?.();
    aTab.removeAttribute?.("linkedpanel");
    this._createLazyBrowser?.(aTab);
    aTab.dispatchEvent?.(new CustomEvent("TabBrowserDiscarded", { bubbles: true }));

    return true;
  },

  /**
   * Creates and returns a new `<browser>` element wrapped in its container stack.
   *
   * Does not insert the element into the document — callers are responsible for placement.
   */
  createBrowser({
    isPreloadBrowser,
    name,
    openWindowInfo,
    remoteType,
    initialBrowsingContextGroupId,
    uriIsAboutBlank,
    userContextId,
    skipLoad,
  }: any = {}): any {
    const b = this._xulEl("browser") as any;

    // Use JSM global to create permanentKey
    b.permanentKey = new (Cu.getGlobalForObject(Services).Object)();

    const defaultBrowserAttributes = {
      contextmenu: "contentAreaContextMenu",
      message: "true",
      messagemanagergroup: "browsers",
      tooltip: "aHTMLTooltip",
      type: "content",
      manualactiveness: "true",
    };

    for (const attribute in defaultBrowserAttributes) {
      b.setAttribute(attribute, defaultBrowserAttributes[attribute]);
    }

    if (gMultiProcessBrowser || remoteType) {
      b.setAttribute("maychangeremoteness", "true");
    }

    if (userContextId) {
      b.setAttribute("usercontextid", userContextId);
    }

    if (remoteType) {
      b.setAttribute("remoteType", remoteType);
      b.setAttribute("remote", "true");
    }

    if (!isPreloadBrowser) {
      b.setAttribute("autocompletepopup", "PopupAutoComplete");
    }

    if (isPreloadBrowser) {
      b.setAttribute("preloadedState", "preloaded");
    }

    if (initialBrowsingContextGroupId) {
      b.setAttribute(
        "initialBrowsingContextGroupId",
        initialBrowsingContextGroupId
      );
    }

    if (openWindowInfo) {
      b.openWindowInfo = openWindowInfo;
    }

    if (name) {
      b.setAttribute("name", name);
    }

    if ((this as any)._allowTransparentBrowser) {
      b.setAttribute("transparent", "true");
    }

    const stack = this._xulEl("stack") as any;
    stack.className = "browserStack";
    stack.appendChild(b);

    const browserContainer = this._xulEl("vbox") as any;
    browserContainer.className = "browserContainer";
    browserContainer.appendChild(stack);

    const browserSidebarContainer = this._xulEl("hbox") as any;
    browserSidebarContainer.className = "browserSidebarContainer";
    browserSidebarContainer.appendChild(browserContainer);

    // Prevent superfluous initial load if not about:blank
    if (!uriIsAboutBlank || skipLoad) {
      b.setAttribute("nodefaultsrc", "true");
    }

    return b;
  },

  /**
   * Returns the `<tabpanel>` element that contains `browser`.
   */
  getPanel(browser: XULBrowserElement): any {
    return this.getBrowserContainer(browser)?.parentNode;
  },

  /**
   * Returns the `.browserContainer` `<vbox>` that wraps `browser`'s stack.
   */
  getBrowserContainer(browser: XULBrowserElement): any {
    return browser?.parentNode?.parentNode;
  },

  // ==========================================================================
  // Find Bar (getCachedFindBar, etc.)
  // tabbrowser.js L816~L905
  // ==========================================================================

  /**
   * Returns the find bar for `tab`, creating it lazily if it has not been initialised yet.
   *
   * Multiple concurrent calls are coalesced into a single creation promise.
   */
  async getFindBar(tab: MozTabbrowserTab = this.selectedTab): Promise<any> {
    const cached = this.getCachedFindBar(tab);
    if (cached) return cached;

    // Lazy creation — avoid re-entrancy via cached promise
    if (!(tab as any)._pendingFindBar) {
      (tab as any)._pendingFindBar = this._createFindBar(tab);
    }
    return (tab as any)._pendingFindBar;
  },

  async _createFindBar(tab: MozTabbrowserTab): Promise<any> {
    try {
      const findBar = this._xulEl("findbar") as any;
      const browser = this.getBrowserForTab(tab);
      if (!browser) return null;

      (browser as any).parentNode?.insertAdjacentElement?.("afterend", findBar);

      await new Promise(r => requestAnimationFrame(r));
      delete (tab as any)._pendingFindBar;

      if ((this.window as any).closed || (tab as any).closing) return null;

      findBar.browser = browser;
      if (findBar._findField) findBar._findField.value = this._lastFindValue;

      (tab as any)._findBar = findBar;

      const event = document.createEvent("Events");
      event.initEvent("TabFindInitialized", true, false);
      (tab as any).dispatchEvent?.(event);

      return findBar;
    } catch (_) {
      delete (tab as any)._pendingFindBar;
      return null;
    }
  },

  /**
   * Return the `<findbar>` element already attached to `tab`'s panel, or
   * `null` if it has not been created yet (non-blocking).
   */
  getCachedFindBar(tab: MozTabbrowserTab): any {
    const panel = tab?.linkedBrowser ? this.getPanel(tab.linkedBrowser) : null;
    return panel?.querySelector?.("findbar") ?? null;
  },

  /**
   * Returns `true` if the find bar for `tab` has already been created.
   */
  isFindBarInitialized(tab: MozTabbrowserTab): boolean {
    return !!this.getCachedFindBar(tab);
  },

  // ==========================================================================
  // Notification & Dialog Boxes
  // tabbrowser.js L1000~L1053
  // ==========================================================================

  /**
   * Return (lazily creating if necessary) the `NotificationBox` for `browser`.
   * Defaults to `selectedBrowser` when not provided.
   */
  getNotificationBox(browser?: XULBrowserElement): any {
    browser = browser || this.selectedBrowser;
    if (!browser) return null;
    if (!(browser as any)._notificationBox) {
      try {
        (browser as any)._notificationBox = new MozElements.NotificationBox((element: any) => {
          element.setAttribute("notificationside", "top");
          element.setAttribute("name", `tab-notification-box-${this._nextNotificationBoxId++}`);
          this.getTabNotificationDeck()?.append?.(element);
          if (browser === this.selectedBrowser) {
            this._updateVisibleNotificationBox(browser);
          }
        }, this._notificationEnableDelay);
      } catch (_) {
        // MozElements.NotificationBox may not be available; fall back
        const container = this.getBrowserContainer(browser);
        if (container) {
          const existing = container.querySelector?.("notificationbox");
          if (existing) { (browser as any)._notificationBox = existing; return existing; }
        }
        return null;
      }
    }
    return (browser as any)._notificationBox;
  },

  /**
   * Return the `<tabdialogbox>` element for `browser`'s container.
   * Used for per-tab modal dialogs (permissions, authentication, etc.).
   * Defaults to `selectedBrowser` when not provided.
   */
  getTabDialogBox(browser?: XULBrowserElement): any {
    browser = browser || this.selectedBrowser;
    if (!browser) return null;
    const container = this.getBrowserContainer(browser);
    return container?.querySelector?.("tabdialogbox") ?? null;
  },
};
