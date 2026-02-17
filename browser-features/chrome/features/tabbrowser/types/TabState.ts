// SPDX-License-Identifier: MPL-2.0

/**
 * TabState - Data Model
 */

export type TabId = string;
export type WindowId = number;
export type ProcessId = number;
export type GroupId = string;
export type SplitViewId = string;
export type RemoteType = string;

export interface TabData {
  readonly id: TabId;
  readonly index: number;
  readonly uri: string;
  readonly title: string;
  readonly label: string;
  readonly iconUrl?: string;
  readonly description?: string;
  
  // State flags
  readonly isPinned: boolean;
  readonly isHidden: boolean;
  readonly isSelected: boolean;
  readonly isMultiSelected: boolean;
  readonly isBusy: boolean;
  readonly isMuted: boolean;
  readonly isCrashed: boolean;
  readonly isLazy: boolean;
  readonly isDiscarded: boolean;
  readonly isClosing: boolean;
  
  // Audio state (Lines 8250-8350)
  readonly soundPlaying: boolean;
  readonly soundPlayingScheduledRemoval: boolean;
  readonly activeMediaBlocked: boolean;
  
  // Context and grouping
  readonly userContextId: number;
  readonly groupId?: GroupId;
  readonly splitViewId?: SplitViewId;
  readonly permanentKey: any;
  
  // Relationships
  readonly ownerTabId?: TabId;
  readonly openerTabId?: TabId;
  readonly successorTabId?: TabId;
  readonly predecessorTabIds: TabId[]; // New: for succession tracking
  
  // Metadata
  readonly lastAccessed: number;
  readonly createdTime: number;
  readonly lastSeenActive: number;

  readonly labelIsContentTitle: boolean;
  readonly labelDirection: "ltr" | "rtl";
  readonly sharingState: {
    readonly camera: boolean;
    readonly microphone: boolean;
    readonly screen: boolean;
  };
}

// ... (Rest of existing AppState and other interfaces) ...

export interface TabGroupData {
  readonly id: GroupId;
  readonly title: string;
  readonly color: string;
  readonly isCollapsed: boolean;
  readonly tabs: TabId[];
}

export interface SplitViewData {
  readonly id: SplitViewId;
  readonly tabs: TabId[];
}

export interface BrowserEngineState {
  readonly remoteType: RemoteType;
  readonly processId: ProcessId;
  readonly isWarming: boolean;
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
}

export interface AppState {
  readonly tabs: Record<TabId, TabData>;
  readonly groups: Record<GroupId, TabGroupData>;
  readonly splitViews: Record<SplitViewId, SplitViewData>;
  readonly engineStates: Record<TabId, BrowserEngineState>;

  readonly tabOrder: TabId[];
  readonly selectedTabId: TabId | null;
  
  readonly activeSplitViewId: SplitViewId | null;
  
  readonly config: {
    readonly shouldExposeContentTitle: boolean;
    readonly shouldExposeContentTitlePbm: boolean;
    readonly showTabCardPreview: boolean;
    readonly allowTransparentBrowser: boolean;
    readonly tabGroupsEnabled: boolean;
    readonly tabNotesEnabled: boolean;
    readonly showPidAndActiveness: boolean;
    readonly unloadTabInContextMenu: boolean;
    readonly notificationEnableDelay: number;
    readonly tabMinWidth: number;
    readonly tabClipWidth: number;
  };
}
