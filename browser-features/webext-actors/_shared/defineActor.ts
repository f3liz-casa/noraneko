// SPDX-License-Identifier: MPL-2.0

// Authoring surface for a WebExtension-based "actor". Each actor lives in one
// file that exports three things by name:
//
//   export const meta    = { id, namespace, matches, ... };
//   export const parent  = defineParent({ method(...) { ... } });  // main process
//   export const content = defineContent((parent, ctx) => { ... }); // content script
//
// Named exports (rather than one nested object) are deliberate: the build
// bundles `parent` and `content` into separate outputs, and named exports let
// the bundler tree-shake each side so the content bundle never drags in the
// parent's privileged code and vice versa.
//
// IMPORTANT: the module top level must be pure. Reference Firefox globals
// (Services, ChromeUtils, window, exportFunction, browser) only *inside* method
// or hook bodies — the build imports this file under Deno to read `meta`, and
// top-level use of those globals would throw there.

export interface ActorMeta {
  /** Extension id, e.g. "settings-bridge@noraneko.app". */
  id: string;
  /** Extension version. */
  version: string;
  /** Experiment-API namespace, e.g. "noraSettings". Also the message channel. */
  namespace: string;
  /** content_scripts match patterns. */
  matches: string[];
  /** content_scripts run_at. Defaults to "document_end". */
  runAt?: "document_start" | "document_end" | "document_idle";
}

type ParentMethods = Record<string, (...args: any[]) => unknown>;

export interface ContentCtx {
  /** True in dev builds (import.meta.env.MODE === "dev"). */
  dev: boolean;
  /** Expose functions on the page window (via exportFunction). */
  expose(funcs: Record<string, (...args: any[]) => unknown>): void;
}

/** Proxy to the parent methods; each call is forwarded to the main process. */
type ParentProxy<T extends ParentMethods> = {
  [K in keyof T]: (...args: Parameters<T[K]>) => Promise<Awaited<ReturnType<T[K]>>>;
};

export type ContentHook<T extends ParentMethods = ParentMethods> = (
  parent: ParentProxy<T>,
  ctx: ContentCtx,
) => void;

// Identity helpers that pin types for authoring:
//
//   export const parent  = defineParent({ method(...) { ... } });
//   export const content = defineContent<typeof parent>((parent, ctx) => { ... });
//
// They are listed in the build's treeshake.manualPureFunctions, so an unused
// call (e.g. defineContent in the parent bundle) is dropped along with anything
// it references (birpc). Without that, the bundler would keep the call for its
// possible side effects and the unused side would not tree-shake.

/** Pins the parent-method types so the content hook's proxy is typed. */
export const defineParent = <T extends ParentMethods>(methods: T): T => methods;

/** Pins the content hook against the parent's method types. */
export const defineContent = <T extends ParentMethods>(
  hook: ContentHook<T>,
): ContentHook<T> => hook;
