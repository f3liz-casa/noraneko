// SPDX-License-Identifier: MPL-2.0
// Ported from tabbrowser.js L816~L2153
// Section: Browser Creation — "how is a new browser DOM element created?"

import type { TabbrowserCompat } from "../TabbrowserCompat.ts";

/** @augments TabbrowserCompat */
declare module "../TabbrowserCompat.ts" {
  interface TabbrowserCompat {
    // Methods provided by this module
    _setFindbarData(findBar: any, tab: MozTabbrowserTab): void;
    // Methods called by this module but defined elsewhere
    getBrowserForOuterWindowID(id: number): any;
    getTabFromAudioEvent(event: Event): any;
    getTabPids(tab: MozTabbrowserTab): number[];
  }
}

export const methods: Partial<TabbrowserCompat> & ThisType<TabbrowserCompat> = {
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
};
