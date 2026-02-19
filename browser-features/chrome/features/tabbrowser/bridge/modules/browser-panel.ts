// SPDX-License-Identifier: MPL-2.0
// Ported from tabbrowser.js L816~L2153
// Section: Panels & Containers — "how are panels and containers set up?"

import type { TabbrowserCompat } from "../TabbrowserCompat.ts";

/** @augments TabbrowserCompat */
declare module "../TabbrowserCompat.ts" {
  interface TabbrowserCompat {
    // Class fields used by this module
    _uniquePanelIDCounter: number;
    // Methods provided by this module
    getBrowserContainer(browser?: any): any;
    // Methods called by this module but defined elsewhere
    appendStatusPanel(browser?: any): any;
    readNotificationBox(browser: XULBrowserElement): any;
    getTabNotificationDeck(): any;
    _updateVisibleNotificationBox(browser: XULBrowserElement): void;
    addNewBadge(tab: MozTabbrowserTab, options?: any): void;
  }
}

export const methods: Partial<TabbrowserCompat> & ThisType<TabbrowserCompat> = {
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
};
