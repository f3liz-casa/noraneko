// SPDX-License-Identifier: MPL-2.0

import { h } from "#libs/preact-xul/index.ts";
import { useEffect, useRef } from "preact/hooks";
import { computed } from "@preact/signals";
import { appState, send } from "../state/store.ts";
import { DOMRegistry } from "../bridge/DOMRegistry.ts";
import type { TabId } from "../types/TabState.ts";

interface TabProps {
  tabId: TabId;
}

/**
 * Tab Component - Signal-Driven UI for maximum performance.
 * Binds to specific pieces of state to minimize re-renders.
 */
export function Tab({ tabId }: TabProps) {
  const tabRef = useRef<Element>(null);

  // Bindings
  const tab = computed(() => appState.value.tabs[tabId]);
  const isSelected = computed(() => tab.value?.isSelected);
  const isPinned = computed(() => tab.value?.isPinned);
  const isBusy = computed(() => tab.value?.isBusy);
  const iconUrl = computed(() => tab.value?.iconUrl || "chrome://branding/content/icon32.png");
  const label = computed(() => tab.value?.label || tab.value?.title || "");

  useEffect(() => {
    if (tabRef.current) {
      DOMRegistry.registerTab(tabId, tabRef.current);
      (tabRef.current as any)._tabId = tabId;
    }
    return () => DOMRegistry.unregisterTab(tabId);
  }, [tabId]);

  return (
    <xul:tab
      ref={tabRef}
      class="tabbrowser-tab"
      selected={isSelected.value ? "true" : undefined}
      pinned={isPinned.value ? "true" : undefined}
      busy={isBusy.value ? "true" : undefined}
      onClick={() => send({ type: "SELECT_TAB", tabId })}
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
              send({ type: "REMOVE_TAB", tabId });
            }}
          />
        </xul:hbox>
      </xul:stack>
    </xul:tab>
  );
}
