// SPDX-License-Identifier: MPL-2.0
// Library root module

// Standard library
export * as std from "./std/mod.ts";

// Core framework
export * as core from "./core/mod.ts";

// UI utilities
export * as ui from "./ui/mod.ts";

// Convenience re-exports for most common use cases
export { registerModule, type ModuleContext } from "./core/mod.ts";
export { pipe, tryDo, decode, v } from "./std/mod.ts";
