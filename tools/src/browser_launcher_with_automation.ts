// SPDX-License-Identifier: MPL-2.0

import { BIN_PATH_EXE, PATHS } from "./defines.ts";
import { ProcessUtils } from "./utils.ts";

/**
 * Enhanced browser launcher with mus-uc-devtools integration
 * for automated browser control and testing
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

export interface LaunchOptions {
  port?: number;
  marionettePort?: number;
  headless?: boolean;
  onReady?: (wsUrl: string, marionettePort: number) => void | Promise<void>;
}

export async function browserCommand(
  port: number,
  marionettePort: number,
  headless: boolean = false,
): Promise<string[]> {
  const cmd = [
    BIN_PATH_EXE,
    "--profile",
    PATHS.profile_test,
    "--remote-debugging-port",
    String(port),
    "--marionette",
    "-marionette-port",
    String(marionettePort),
  ];

  if (headless) {
    cmd.push("--headless");
  }

  return cmd;
}

export async function runWithAutomation(
  options: LaunchOptions = {},
): Promise<void> {
  const {
    port = 5180,
    marionettePort = 2828,
    headless = false,
    onReady,
  } = options;

  const cmd = await browserCommand(port, marionettePort, headless);

  console.log("[launcher] Launching browser with command: " + cmd.join(" "));
  console.log(
    `[launcher] Marionette will be available on port ${marionettePort}`,
  );

  let wsUrl: string | null = null;
  let marionetteReady = false;

  await ProcessUtils.runCommandWithLogging(
    cmd,
    async (stream: "stdout" | "stderr", line: string) => {
      if (stream === "stderr") {
        const m = line.match(/^WebDriver BiDi listening on (ws:\/\/.*)/);
        if (m) {
          wsUrl = m[1];
          console.log(
            "[launcher] WebDriver BiDi ready:",
            "nora-{bbd11c51-3be9-4676-b912-ca4c0bdcab94}-webdriver",
          );
        }

        // Check for Marionette ready signal
        if (
          line.includes("Marionette") &&
          (line.includes("listening") || line.includes("ready"))
        ) {
          marionetteReady = true;
          console.log(`[launcher] Marionette ready on port ${marionettePort}`);

          // Call onReady callback if both are ready
          if (wsUrl && marionetteReady && onReady) {
            try {
              await onReady(wsUrl, marionettePort);
            } catch (e: any) {
              console.error(
                `[launcher] Error in onReady callback: ${e?.message ?? e}`,
              );
            }
          }
        }
      }
      printFirefoxLog(line.trim());
    },
  );

  console.log("[launcher] Browser Closed");
}
