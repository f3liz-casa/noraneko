// SPDX-License-Identifier: MPL-2.0

import { BIN_PATH_EXE, PATHS, STOCK_FIREFOX } from "./defines.ts";
import { ProcessUtils, safeRemove } from "./utils.ts";
import * as path from "@std/path";

/**
 * Minimal port of tools/lib/browser_launcher.rb
 */

function printFirefoxLog(line: string) {
  if (
    /MOZ_CRASH|JavaScript error:|console\.error|\] Errors|\[fluent\] Couldn't find a message:|\[fluent\] Missing|EGL Error:/.test(
      line,
    )
  ) {
    console.log(`\x1b[31m${line}\x1b[0m`);
  } else if (/console\.warn|WARNING:|\[WARN|JavaScript warning:/.test(line)) {
    console.log(`\x1b[33m${line}\x1b[0m`);
  } else if (/console\.debug/.test(line)) {
    console.log(`\x1b[36m${line}\x1b[0m`);
  } else {
    console.log(line);
  }
}

export async function browserCommand(port: number): Promise<string[]> {
  return [
    BIN_PATH_EXE,
    "--profile",
    PATHS.profile_test,
    "--remote-debugging-port",
    String(port),
    // Lets Marionette/WebDriver run chrome-context scripts (screenshots etc.).
    "--remote-allow-system-access",
    "--jsdebugger",
  ];
}

export async function run(port = 5180): Promise<void> {
  // Stock Firefox lacks the noraneko-runtime nsAppRunner buildid2 patch that
  // invalidates the startup cache when the build changes, so the chrome
  // registry (omni.ja chrome.manifest) can go stale across runs. Drop the
  // profile's startup cache before launch to force a fresh read.
  if (STOCK_FIREFOX) {
    safeRemove(path.join(PATHS.profile_test, "startupCache"));
  }

  const cmd = await browserCommand(port);

  console.log("[launcher] Launching browser with command: " + cmd.join(" "));

  await ProcessUtils.runCommandWithLogging(
    cmd,
    (stream: "stdout" | "stderr", line: string) => {
      if (stream === "stderr") {
        const m = line.match(/^WebDriver BiDi listening on (ws:\/\/.*)/);
        if (m) {
          console.log("nora-{bbd11c51-3be9-4676-b912-ca4c0bdcab94}-webdriver");
        }
      }
      printFirefoxLog(line.trim());
    },
  );

  console.log("[launcher] Browser Closed");
}
