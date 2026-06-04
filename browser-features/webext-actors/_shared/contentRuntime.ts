// SPDX-License-Identifier: MPL-2.0

// Shared content-script runtime. Bundled into every actor's content.js. It
// builds the `parent` proxy (whose calls hop content -> background -> the
// noraSettings-style experiment API in the main process) and the `ctx` helpers,
// then runs the actor's content hook.

import type { ActorMeta, ContentCtx, ContentHook } from "./defineActor.ts";

// Provided by the privileged content-script sandbox / WebExtension environment.
declare const exportFunction: (
  fn: (...args: any[]) => unknown,
  target: object,
  options: { defineAs: string },
) => void;
declare const browser: {
  runtime: { sendMessage(message: unknown): Promise<unknown> };
};

export function runContent(meta: ActorMeta, hook: ContentHook): void {
  const parent = new Proxy(
    {},
    {
      get(_target, method: string) {
        return (...args: unknown[]) =>
          browser.runtime.sendMessage({
            channel: meta.namespace,
            method,
            args,
          });
      },
    },
  ) as any;

  const ctx: ContentCtx = {
    dev: import.meta.env.MODE === "dev",
    expose(funcs) {
      for (const [name, fn] of Object.entries(funcs)) {
        exportFunction(fn, window as unknown as object, { defineAs: name });
      }
    },
  };

  hook(parent, ctx);
}
