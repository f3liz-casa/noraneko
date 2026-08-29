// SPDX-License-Identifier: MPL-2.0
// Ported from tabbrowser.js L816~L2153
// Section: Panels & Containers — "how are panels and containers set up?"

import type { TabbrowserCompat } from "../TabbrowserCompat.ts";
import { TabProgressListener, URILoadingWrapper } from "../tabbrowser-scope.ts";

/** @augments TabbrowserCompat */
declare module "../TabbrowserCompat.ts" {
  interface TabbrowserCompat {
    _generateUniquePanelID(): string;
    getPanel(browser: XULBrowserElement): any;
    // Class fields used by this module
    _uniquePanelIDCounter: number;
    // Methods provided by this module
    getBrowserContainer(browser?: any): any;
    // Methods called by this module but defined elsewhere
    _appendStatusPanel(): void;
    appendStatusPanel(browser?: any): any;
    addNewBadge(tab: MozTabbrowserTab, options?: any): void;
  }
}

export const methods = {
  // upstream: _generateUniquePanelID@5a58d3aab5 FIREFOX_143_0_1_RELEASE
  _generateUniquePanelID(): string {
    if (!this._uniquePanelIDCounter) {
      this._uniquePanelIDCounter = 0;
    }
    const outerID = this.window.docShell?.outerWindowID;
    // Use monotonic counter to avoid collisions
    return `panel-${outerID}-${++this._uniquePanelIDCounter}`;
  },

  /** Park the status panel next to the selected browser. */
  _appendStatusPanel() {
    this.selectedBrowser!.insertAdjacentElement("afterend", (this.window as any).StatusPanel.panel);
  },

  /** Ours: the same for any browser, and forgiving when StatusPanel is not there yet. */
  appendStatusPanel(browser?: any) {
    const target = browser ?? this.selectedBrowser;
    const panel = (this.window as any).StatusPanel?.panel;
    if (target && panel) target.insertAdjacentElement("afterend", panel);
  },

  // upstream: _setupInitialBrowserAndTab@d31fbac6db FIREFOX_143_0_1_RELEASE
  _setupInitialBrowserAndTab() {
    // See browser.js for the meaning of window.arguments
    let userContextId = (this.window as any).arguments?.[5];
    
    let openWindowInfo;
    try {
      openWindowInfo = this.window.docShell?.treeOwner
        ?.QueryInterface?.(Ci.nsIInterfaceRequestor)
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
    browser.droppedLinkHandler = (this.window as any).handleDroppedLink;
    browser.loadURI = URILoadingWrapper.loadURI.bind(URILoadingWrapper, browser);
    browser.fixupAndLoadURIString = URILoadingWrapper.fixupAndLoadURIString.bind(
      URILoadingWrapper,
      browser
    );

    const uniqueId = this._generateUniquePanelID();
    const panel = this.getPanel(browser);
    panel.id = uniqueId;
    this.tabpanels.appendChild(panel);

    const tab = this.tabs[0] as any;
    tab.linkedPanel = uniqueId;
    tab.permanentKey = browser.permanentKey;
    tab._tPos = 0;
    tab._fullyOpen = true;
    tab.linkedBrowser = browser;

    if (userContextId) {
      tab.setAttribute("usercontextid", userContextId);
      ContextualIdentityService.setTabStyle(tab);
    }

    this._tabForBrowser.set(browser, tab);

    this._appendStatusPanel();

    // This is the initial browser, so it's usually active; the default is false
    // so we have to update it:
    browser.docShellIsActive = this.shouldActivateDocShell(browser);

    // Hook the browser up with a progress listener.
    const tabListener = new TabProgressListener(this, tab, browser, true, false);
    const filter: any = Cc["@mozilla.org/appshell/component/browser-status-filter;1"]
      .createInstance(Ci.nsIWebProgress);
    filter.addProgressListener(tabListener, Ci.nsIWebProgress.NOTIFY_ALL!);
    this._tabListeners.set(tab, tabListener);
    this._tabFilters.set(tab, filter);
    browser.webProgress.addProgressListener(filter, Ci.nsIWebProgress.NOTIFY_ALL!);
  },

  /**
   * Returns the `<tabpanel>` element that contains `browser`.
   */
  // upstream: getPanel@10d14ee553 FIREFOX_143_0_1_RELEASE
  getPanel(browser: XULBrowserElement): any {
    return this.getBrowserContainer(browser)?.parentNode;
  },

  /**
   * Returns the `.browserContainer` `<vbox>` that wraps `browser`'s stack.
   */
  // upstream: getBrowserContainer@e3461fb2e1 FIREFOX_143_0_1_RELEASE
  getBrowserContainer(browser: XULBrowserElement): any {
    return browser?.parentNode?.parentNode;
  },
} satisfies Partial<TabbrowserCompat> & ThisType<TabbrowserCompat>;
