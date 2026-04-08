// SPDX-License-Identifier: MPL-2.0

import { Overrides } from "./overrides.js";

// This module cannot be hot reloaded

export function init() {
  Overrides.getInstance();
}

export function _metadata() {
  return {
    moduleName: "overrides",
    dependencies: [],
    softDependencies: [],
  };
}
