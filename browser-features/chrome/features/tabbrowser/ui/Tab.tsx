// SPDX-License-Identifier: MPL-2.0

import { h, Fragment } from "#libs/preact-xul/index.ts";
import { useEffect, useRef } from "preact/hooks";
import type { TabData } from "../types/TabState.ts";
import { setSelectedTab } from "../state/store.ts";
import { DOMRegistry } from "../bridge/DOMRegistry.ts";

interface TabProps {
  tab: TabData;
}

/**
 * Tab Component - Data-Driven UI
 */
export function Tab({ tab }: TabProps) {
  const tabRef = useRef<Element>(null);

  useEffect(() => {
    if (tabRef.current) {
      // Register with Bridge
      DOMRegistry.registerTab(tab.id, tabRef.current);
      // Attach ID to DOM for reverse lookup
      (tabRef.current as any)._tabId = tab.id;
    }
    return () => {
      DOMRegistry.unregisterTab(tab.id);
    };
  }, [tab.id]);

  const handleClick = (e: MouseEvent) => {
    setSelectedTab(tab.id);
  };

  return (
    <xul:tab
      ref={tabRef}
      class="tabbrowser-tab"
      selected={tab.isSelected ? "true" : undefined}
      pinned={tab.isPinned ? "true" : undefined}
      busy={tab.isBusy ? "true" : undefined}
      onClick={handleClick}
    >
      <xul:stack class="tab-stack" flex="1">
        <xul:hbox class="tab-background">
          <xul:hbox class="tab-context-line" />
          <xul:hbox class="tab-loading-burst" flex="1" />
        </xul:hbox>
        <xul:hbox class="tab-content" align="center">
          <xul:stack class="tab-icon-stack">
            {tab.isBusy ? (
              <xul:hbox class="tab-throbber" fadein="true" />
            ) : (
              <xul:image
                class="tab-icon-image"
                src={tab.iconUrl || "chrome://branding/content/icon32.png"}
                fadein="true"
              />
            )}
          </xul:stack>
          <xul:vbox class="tab-label-container" flex="1">
            <xul:label
              class="tab-text tab-label"
              value={tab.title}
              crop="end"
            />
          </xul:vbox>
          <xul:image
            class="tab-close-button close-icon"
            role="button"
            onClick={(e: MouseEvent) => {
              e.stopPropagation();
              // dispatch(removeTab(tab.id))
            }}
          />
        </xul:hbox>
      </xul:stack>
    </xul:tab>
  );
}
