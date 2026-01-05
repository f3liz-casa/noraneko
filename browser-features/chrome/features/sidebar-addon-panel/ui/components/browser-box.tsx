/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { isFloatingDragging } from "../../../sidebar/state/mod.ts";

export function BrowserBox() {
  return (
    <>
      <xul:box
        id="panel-sidebar-browser-box-wrapper"
        class={isFloatingDragging() ? "warp" : ""}
      />
      <xul:vbox id="panel-sidebar-browser-box" style="flex: 1;" />
    </>
  );
}
