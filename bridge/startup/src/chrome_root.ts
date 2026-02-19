// SPDX-License-Identifier: MPL-2.0

if (import.meta.env.MODE === "test") {
  //@ts-expect-error TS cannot find the module from http
  await (await import("http://localhost:5181/loader/mod.ts")).default();
  //@ts-expect-error TS cannot find the module from http
  await (await import("http://localhost:5181/loader/test/index.ts")).default();
} else {
  // tsdown-built loader-features is the primary entrypoint; Vite provides feature modules via NMA.
  //@ts-expect-error TS cannot resolve resource:// modules
  const { initScripts } = await import("resource://noraneko-loader/mod.js");
  await initScripts();
}
