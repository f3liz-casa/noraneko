// SPDX-License-Identifier: MPL-2.0

import { createEventSystem } from "../lib/core/mod.ts";
import type { EventDispatcher as SidebarEvents } from "./sidebar/types/Events.ts";
import type { ToolbarEvents } from "./toolbar/mod.ts";

export const events = {
  sidebar: createEventSystem<SidebarEvents>(),
  toolbar: createEventSystem<ToolbarEvents>(),
};
