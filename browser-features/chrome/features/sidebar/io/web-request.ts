// SPDX-License-Identifier: MPL-2.0
// Web request observer I/O

const { BrowserWindowTracker } = ChromeUtils.importESModule(
  "resource:///modules/BrowserWindowTracker.sys.mjs",
);

// Mobile User-Agent string
const MOBILE_UA =
  "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36 Edg/114.0.1823.79";

interface MobileUAWindow extends Window {
  floorpBmsUserAgent?: boolean;
}

/**
 * Observer for http-on-modify-request
 * Modifies User-Agent header for sidebar panels that request mobile mode
 */
const httpRequestObserver = {
  QueryInterface: ChromeUtils.generateQI(["nsIObserver"]),

  observe: (channel: nsIChannel, topic: string) => {
    const topLevelWindow = getBrowserById(
      (channel as { browserId?: string }).browserId ?? "",
    );

    if (
      topic !== "http-on-modify-request" ||
      !(channel instanceof Ci.nsIHttpChannel) ||
      !(topLevelWindow as MobileUAWindow)?.floorpBmsUserAgent
    ) {
      return;
    }

    try {
      (channel as nsIHttpChannel).setRequestHeader(
        "User-Agent",
        MOBILE_UA,
        false,
      );
    } catch (error) {
      console.error("Failed to set User-Agent:", error);
    }
  },
};

function getBrowserById(browserId: string): Window | null {
  for (const win of BrowserWindowTracker.orderedWindows) {
    for (const tab of (
      win as {
        gBrowser: {
          visibleTabs: {
            linkedPanel?: string;
            linkedBrowser?: { browserId: string; ownerGlobal: Window };
          }[];
        };
      }
    ).gBrowser.visibleTabs) {
      if (tab.linkedPanel) {
        if (tab.linkedBrowser?.browserId === browserId) {
          return tab.linkedBrowser.ownerGlobal;
        }
      }
    }
  }
  return null;
}

/**
 * Register the web request observer (side effect)
 */
export function registerWebRequestObserver(): void {
  Services.obs.addObserver(
    httpRequestObserver,
    "http-on-modify-request",
    false,
  );
}

/**
 * Unregister the web request observer
 */
export function unregisterWebRequestObserver(): void {
  try {
    Services.obs.removeObserver(httpRequestObserver, "http-on-modify-request");
  } catch {
    // Observer might not be registered
  }
}
