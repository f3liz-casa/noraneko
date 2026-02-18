// SPDX-License-Identifier: MPL-2.0
/**
 * Supplemental type declarations for the noraneko tabbrowser bridge.
 *
 * Firefox's canonical `MozTabbrowserTab` is declared in
 * `noraneko-runtime/browser/components/search/types/mozTabbrowserTab.d.ts`
 * as a minimal stub (`linkedBrowser: MozBrowser`). This file augments it
 * with every property and method actually used in tabbrowser.js so that our
 * module code is fully type-safe.
 *
 * `XULBrowserElement` is NOT part of the gecko types — the real type is
 * `MozBrowser` (from `toolkit/content/widgets/browser-custom-element.mjs`).
 * We create a local alias so our code can use either name.
 *
 * @see noraneko-runtime/browser/components/search/types/mozTabbrowserTab.d.ts
 * @see noraneko-runtime/tools/@types/lib.gecko.tweaks.d.ts  (XULElementTagNameMap)
 * @see noraneko-runtime/tools/@types/lib.gecko.augmentations.d.ts  (MozBrowser)
 */


/**
 * Augmentation of the official Firefox `MozTabbrowserTab` stub.
 *
 * The canonical declaration lives in
 * `noraneko-runtime/browser/components/search/types/mozTabbrowserTab.d.ts`
 * and intentionally only declares `linkedBrowser: MozBrowser`.  Every extra
 * property below is derived from the actual `<tab>` XBL binding and
 * `tabbrowser.js` source.
 */
interface MozTabbrowserTab {
  // ── Core identity ─────────────────────────────────────────────────────────
  /** Internal UUID assigned by TabbrowserCompat. */
  _tabId?: string;
  /** DOM id attribute (may be absent). */
  id?: string;
  /** Zero-based position in the tab strip (including hidden tabs). */
  _tPos: number;
  /** `true` once the open animation has finished. */
  _fullyOpen: boolean;
  /** `true` while the tab is being removed / animated out. */
  closing: boolean;
  /** Whether the tab is pinned to the left side of the tab strip. */
  pinned: boolean;
  /** Whether the tab is hidden from the tab strip (e.g. Firefox View). */
  hidden: boolean;
  /** Whether this is the active (foreground) tab. */
  selected: boolean;
  /** Visible to the user — `!hidden && !closing`. */
  visible: boolean;

  // ── Linked content ────────────────────────────────────────────────────────
  /**
   * The `<browser>` element that renders this tab's content.
   * Typed as `MozBrowser` per the official Firefox declaration.
   */
  linkedBrowser: MozBrowser;
  /** ID of the `<tabpanel>` that contains `linkedBrowser`. */
  linkedPanel: string;
  /**
   * Session-restore permanent key — survives tab moves / swaps.
   * @see https://bugzilla.mozilla.org/show_bug.cgi?id=1716788
   */
  permanentKey: object;

  // ── Labels / titles ───────────────────────────────────────────────────────
  /** Displayed label in the tab strip (may be truncated). */
  label: string;
  /** Full, untruncated label text. */
  _fullLabel: string;
  /** `true` when the label was set from page `<title>`. */
  _labelIsContentTitle: boolean;
  /** `true` while the label is still the initial/loading title. */
  _labelIsInitialTitle: boolean;
  /** Suppress the default "New Tab" label. */
  nodefault: boolean;
  /** `true` for blank / about:newtab tabs with no content yet. */
  isEmpty: boolean;

  // ── State flags ───────────────────────────────────────────────────────────
  /** Tab is busy loading (spinner shown). */
  busy: boolean;
  /** Progress indicator is active. */
  progress: boolean;
  /** Container (contextual identity) id; `0` = default. */
  userContextId?: number;
  /** Standard DOM `isConnected` — whether the tab is in the document. */
  isConnected: boolean;

  // ── Media ─────────────────────────────────────────────────────────────────
  /** Tab is playing audible audio. */
  soundPlaying: boolean;
  /** Tab audio is muted. */
  muted: boolean;
  /** Human-readable reason for muting (e.g. `"user"`, `"extension"`). */
  muteReason: string | null;
  /** Internal `audioMuted` attribute mirror. */
  audioMuted: boolean;
  /** Timer that removes the `soundplaying` attribute after sound stops. */
  _soundPlayingAttrRemovalTimer: nsITimer | null;

  // ── Tab group membership ──────────────────────────────────────────────────
  /** The `<tab-group>` this tab belongs to, or `null`. */
  group: MozTabbrowserTabGroup | null;

  // ── Loading / navigation state ────────────────────────────────────────────
  /** Params used when the browser was last (lazily) created. */
  _browserParams?: {
    uriIsAboutBlank: boolean;
    remoteType: string;
    usingPreloadedContent: boolean;
  };
  /** Internal browser DOM node id. */
  _browserID?: number;

  // ── Screen / camera sharing ───────────────────────────────────────────────
  /** Active WebRTC / screen-sharing state, or `null` when idle. */
  _sharingState: {
    webRTC?: any;
    screen?: any;
    paused?: boolean;
  } | null;

  // ── Miscellaneous ─────────────────────────────────────────────────────────
  /** `true` while `addTab` is still setting up the tab. */
  initializingTab: boolean;
  /** Show an attention indicator (e.g. notification badge). */
  attention: boolean;
  /** Cached FindBar instance for this tab. */
  _findBar: any;
  /** Promise that resolves to the FindBar when it is first created. */
  _pendingFindBar?: Promise<any>;
  /** The URI that was registered as an open URI, used to dedup open tabs. */
  _originalRegisteredOpenURI?: nsIURI | null;

  // ── Multi-selection ───────────────────────────────────────────────────────
  /** Whether this tab is part of the current multi-selection. */
  multiselected: boolean;

  // ── Standard Element methods (re-declared for interface completeness) ──────
  toggleAttribute(name: string, force?: boolean): boolean;
  hasAttribute(name: string): boolean;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  dispatchEvent(event: Event): boolean;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ): void;
  ownerGlobal: Window;
  ownerDocument: Document;
  before(...nodes: (Node | string)[]): void;
  after(...nodes: (Node | string)[]): void;
  remove(): void;
  style: CSSStyleDeclaration;
}

/**
 * A `<tab-group>` custom element that visually clusters related tabs.
 *
 * Defined in `tabbrowser-tabgroup.js`; not yet in upstream gecko types.
 */
interface MozTabbrowserTabGroup extends XULElement {
  /** Unique group identifier (UUID string). */
  id: string;
  /** Accent colour token (e.g. `"blue"`, `"red"`). */
  color: string;
  /** User-visible group name shown in the tab strip. */
  label: string;
  /** Whether the group's tabs are collapsed (hidden) in the strip. */
  collapsed: boolean;
  /** Live list of tabs belonging to this group. */
  tabs: MozTabbrowserTab[];
  ownerGlobal: Window;

  before(...nodes: (Node | string)[]): void;
  after(...nodes: (Node | string)[]): void;
  remove(): void;
  toggleAttribute(name: string, force?: boolean): boolean;
  hasAttribute(name: string): boolean;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  dispatchEvent(event: Event): boolean;
}

/**
 * A noraneko split-view wrapper element.
 *
 * Wraps two or more tabs that are displayed side-by-side in the content area.
 */
interface MozSplitView extends XULElement {
  /** Unique split-view identifier (UUID string). */
  id: string;
  /** The tabs currently displayed inside this split view. */
  tabs: MozTabbrowserTab[];
}

// ── Global Firefox chrome-window variables not in @types/gecko ──────────────

declare const AppConstants: {
  platform: string;
  MOZ_APP_NAME: string;
  isPlatformAndVersionAtLeast(platform: string, version: string): boolean;
  [key: string]: any;
};
declare const gMultiProcessBrowser: boolean;
declare const gFissionBrowser: boolean;
declare const gNavToolbox: Element | null;
declare const gSharedTabWarning: any;
declare const gURLBar: any;
declare const SessionStore: {
  resetBrowserToLazyState(tab: MozTabbrowserTab): void;
  getTabState(tab: MozTabbrowserTab): string;
  setTabState(tab: MozTabbrowserTab, state: string): void;
  promiseInitialized: Promise<void>;
  [key: string]: any;
};
declare const E10SUtils: any;
declare const FirefoxViewHandler: { tab: MozTabbrowserTab | null; [key: string]: any };
declare const PrivateBrowsingUtils: {
  isWindowPrivate(win: Window): boolean;
  permanentPrivateBrowsing: boolean;
  [key: string]: any;
};
declare const BrowserWindowTracker: {
  orderedWindows: Window[];
  getTopWindow(options?: any): ChromeWindow | null;
  [key: string]: any;
};
declare const StatusPanel: any;
declare const MozElements: {
  NotificationBox: new (callback: (el: Element) => void) => any;
  [key: string]: any;
};
declare const ShortcutUtils: any;
declare const SitePermissions: {
  copyTemporaryPermissions(from: MozBrowser, to: MozBrowser): void;
  [key: string]: any;
};
declare const webrtcUI: {
  forgetStreamsFromBrowserContext(ctx: any): void;
  [key: string]: any;
};
declare const SelectableProfileService: any;
declare const TabProgressListener: new (
  tab: MozTabbrowserTab,
  browser: MozBrowser,
  initial: boolean,
  preloaded: boolean,
  stateFlags?: number,
) => any;
declare function updateUserContextUIIndicator(): void;
declare const gPermissionPanel: any;
declare const ContextualIdentityService: any;
declare const PlacesUtils: {
  favicons: any;
  [key: string]: any;
};
declare const FAVICON_DEFAULTS: Record<string, string>;
declare const WebExtensionPolicy: any;
declare function isBlankPageURL(url: string): boolean;
declare const gFindBarInitialized: boolean;
declare const gFindBar: any;
declare const RTL_UI: boolean;
declare const handleDroppedLink: any;
declare const URILoadingWrapper: any;
declare const gBrowserInit: any;
declare const gBrowserAllowScriptsToCloseInitialTabs: boolean;
declare const createUserContextMenu: any;
declare const Glean: any;
declare const gReduceMotion: boolean;
declare const gTabsPanel: any;
declare const AddonManager: any;
