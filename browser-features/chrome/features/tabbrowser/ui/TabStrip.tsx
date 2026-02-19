// SPDX-License-Identifier: MPL-2.0

import { h } from "#libs/preact-xul/index.ts";
import { orderedTabs, send } from "../state/store.ts";
import { Tab } from "./Tab.tsx";

/**
 * TabStrip Component
 * The main container for the tab list.
 */
export function TabStrip() {
  return (
    <xul:tabs id="tabbrowser-tabs" class="tabbrowser-tabs" role="tablist" orient="horizontal">
      <xul:hbox id="tabbrowser-arrowscrollbox" class="tabbrowser-arrowscrollbox" flex="1">
        {orderedTabs.value.map((tab) => (
          <Tab key={tab.id} tabId={tab.id} />
        ))}
        <xul:toolbarbutton
          id="tabs-newtab-button"
          class="tabs-newtab-button"
          onClick={() => send({ type: "ADD_TAB", tab: { uri: "about:newtab" } as any })}
        />
      </xul:hbox>
    </xul:tabs>
  );
}
