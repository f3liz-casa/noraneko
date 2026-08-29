// SPDX-License-Identifier: MPL-2.0

import { h } from "#libs/preact-xul/index.ts";
import { orderedTabs } from "../state/store.ts";
import { Tab } from "./Tab.tsx";

/**
 * TabStrip — a second view of the strip, drawn from the mirror. Not the
 * real #tabbrowser-tabs (Firefox owns that one), so it carries no id.
 */
export function TabStrip() {
  return (
    <xul:tabs class="tabbrowser-tabs" role="tablist" orient="horizontal">
      <xul:hbox class="tabbrowser-arrowscrollbox" flex="1">
        {orderedTabs.value.map((tab) => (
          <Tab key={tab.id} tabId={tab.id} />
        ))}
        <xul:toolbarbutton
          class="tabs-newtab-button"
          onClick={() => (globalThis as any).gBrowser.addTrustedTab("about:newtab", { inBackground: false })}
        />
      </xul:hbox>
    </xul:tabs>
  );
}
