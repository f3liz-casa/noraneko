// SPDX-License-Identifier: MPL-2.0

import { h, Fragment } from "#libs/preact-xul/index.ts";
import { orderedTabs, appState } from "../state/store.ts";
import { Tab } from "./Tab.tsx";

/**
 * TabStrip Component
 *
 * The main container for the tab list.
 * Uses reactive signals to automatically re-render when tab order or selection changes.
 */
export function TabStrip() {
  const tabs = orderedTabs.value;
  const config = appState.value.config;

  return (
    <xul:tabs
      id="tabbrowser-tabs"
      class="tabbrowser-tabs"
      role="tablist"
      orient="horizontal"
    >
      <xul:hbox
        id="tabbrowser-arrowscrollbox"
        class="tabbrowser-arrowscrollbox"
        flex="1"
      >
        {tabs.map((tab) => (
          <Tab key={tab.id} tab={tab} />
        ))}

        <xul:toolbarbutton
          id="tabs-newtab-button"
          class="tabs-newtab-button"
          onClick={() => {
            // Future: dispatch(addTab(...))
          }}
        />
      </xul:hbox>
    </xul:tabs>
  );
}
