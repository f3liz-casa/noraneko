// SPDX-License-Identifier: MPL-2.0

import { h } from "#libs/preact-xul/index.ts";
import { orderedTabs } from "../state/store.ts";
import { Tab } from "./Tab.tsx";

/**
 * TabStrip — a second view of the strip, drawn from the mirror. Not the
 * real #tabbrowser-tabs (Firefox owns that one), so it carries no id and
 * borrows no custom element: plain boxes with the strip's class names, so
 * <tabs>/<tab> never wake up and redraw what we drew.
 */
export function TabStrip() {
  return (
    <xul:hbox class="tabbrowser-tabs" role="tablist">
      <xul:hbox class="tabbrowser-arrowscrollbox" flex="1">
        {orderedTabs.value.map((tab) => (
          <Tab key={tab.id} tabId={tab.id} />
        ))}
        <xul:toolbarbutton
          class="tabs-newtab-button"
          onClick={() => (globalThis as any).gBrowser.addTrustedTab("about:newtab", { inBackground: false })}
        />
      </xul:hbox>
    </xul:hbox>
  );
}
