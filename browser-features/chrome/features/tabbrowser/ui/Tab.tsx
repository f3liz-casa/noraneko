// SPDX-License-Identifier: MPL-2.0

import { h } from "#libs/preact-xul/index.ts";
import { computed } from "@preact/signals";
import { appState, tabById } from "../state/store.ts";
import type { TabId } from "../types/TabState.ts";

interface TabProps {
  tabId: TabId;
}

/**
 * A tab as the mirror reports it. Reads the snapshot; acts through
 * gBrowser, which is where the tab actually lives. Drawn as a box, not a
 * <tab>: MozTab builds its own inside once connected, and would overwrite
 * the label drawn here.
 */
export function Tab({ tabId }: TabProps) {
  const tab = computed(() => appState.value.tabs[tabId]);
  const isSelected = computed(() => tab.value?.isSelected);
  const isPinned = computed(() => tab.value?.isPinned);
  const isBusy = computed(() => tab.value?.isBusy);
  const iconUrl = computed(() => tab.value?.iconUrl || "chrome://branding/content/icon32.png");
  const label = computed(() => tab.value?.label || tab.value?.title || "");
  const gBrowser = () => (globalThis as any).gBrowser;

  return (
    <xul:hbox
      class="tabbrowser-tab"
      role="tab"
      selected={isSelected.value ? "true" : undefined}
      pinned={isPinned.value ? "true" : undefined}
      busy={isBusy.value ? "true" : undefined}
      onClick={() => { const el = tabById(tabId); if (el) gBrowser().selectedTab = el; }}
    >
      <xul:stack class="tab-stack" flex="1">
        <xul:hbox class="tab-background">
          <xul:hbox class="tab-context-line" />
          <xul:hbox class="tab-loading-burst" flex="1" />
        </xul:hbox>
        <xul:hbox class="tab-content" align="center">
          <xul:stack class="tab-icon-stack">
            {isBusy.value ? (
              <xul:hbox class="tab-throbber" fadein="true" />
            ) : (
              <xul:image class="tab-icon-image" src={iconUrl.value} fadein="true" />
            )}
          </xul:stack>
          <xul:vbox class="tab-label-container" flex="1">
            <xul:label class="tab-text tab-label" value={label.value} crop="end" />
          </xul:vbox>
          <xul:image
            class="tab-close-button close-icon"
            role="button"
            onClick={(e: MouseEvent) => {
              e.stopPropagation();
              const el = tabById(tabId);
              if (el) gBrowser().removeTab(el);
            }}
          />
        </xul:hbox>
      </xul:stack>
    </xul:hbox>
  );
}
