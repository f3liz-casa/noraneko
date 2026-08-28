// SPDX-License-Identifier: MPL-2.0

import * as path from "@std/path";
import { PROJECT_ROOT, PATHS } from "./defines.ts";
import {
  createFeatureSymlinks,
  exists,
  Logger,
  safeRemove,
} from "./utils.ts";
import { writeBuildid2 } from "./update.ts";

const logger = new Logger("builder");

export function packageVersion(): string {
  const pkgPath = path.join(PROJECT_ROOT, "package.json");
  const content = Deno.readTextFileSync(pkgPath);
  return JSON.parse(content).version;
}

type CommandTuple = readonly [readonly string[], string];

export async function runInParallel(commands: CommandTuple[]): Promise<void> {
  const decoder = new TextDecoder();
  const results = await Promise.all(
    commands.map(async ([cmd, dir]) => {
      logger.info(`Running \`${cmd.join(" ")}\` in \`${dir}\``);
      const res = await new Deno.Command(cmd[0], {
        args: cmd.slice(1),
        cwd: dir,
        stdout: "piped",
        stderr: "piped",
      }).output();
      return {
        success: res.code === 0,
        cmd,
        dir,
        out: decoder.decode(res.stdout),
        err: decoder.decode(res.stderr),
      };
    }),
  );

  for (const res of results) {
    if (!res.success) {
      throw new Error(
        `Build command \`${res.cmd.join(" ")}\` in \`${res.dir}\` failed\nSTDOUT:\n${res.out}\nSTDERR:\n${res.err}`,
      );
    }
  }
}

export async function run(mode = "dev", buildid2: string): Promise<void> {
  logger.info(`Building features with mode=${mode}`);

  // Ensure buildid2 is written to the expected path so other tools can read it.
  try {
    writeBuildid2(PATHS.buildid2, buildid2);
  } catch (e: any) {
    logger.error(`Failed to write buildid2: ${e?.message ?? e}`);
  }

  const version = packageVersion();

  const commands: CommandTuple[] = [
    [
      ["deno", "task", "build", `--env.MODE=${mode}`],
      path.join(PROJECT_ROOT, "bridge/startup"),
    ],
    [
      [
        "deno",
        "task",
        "build",
        `--env.__BUILDID2__=${buildid2}`,
        `--env.__VERSION2__=${version}`,
      ],
      path.join(PROJECT_ROOT, "bridge/loader-modules"),
    ],
    [
      [
        "deno",
        "run",
        "-A",
        "vite",
        "build",
        "--base",
        "chrome://noraneko/content",
      ],
      path.join(PROJECT_ROOT, "browser-features/chrome"),
    ],
    [
      ["deno", "task", "build", `--env.MODE=${mode}`],
      path.join(PROJECT_ROOT, "browser-features/webext-actors"),
    ],
    [
      ["deno", "task", "build"],
      path.join(PROJECT_ROOT, "browser-features/pages-aboutDialog"),
    ],
    [
      ["deno", "task", "build"],
      path.join(PROJECT_ROOT, "browser-features/pages-newtab"),
    ],
    [
      ["deno", "task", "build"],
      path.join(PROJECT_ROOT, "browser-features/settings"),
    ],
  ];

  await runInParallel(commands);

  if (mode.startsWith("production")) {
    const dirPath = "_dist/noraneko";
    try {
      if (exists(dirPath)) {
        safeRemove(dirPath);
      }
    } catch {}
    Deno.mkdirSync(dirPath);

    createFeatureSymlinks(dirPath);
  }

  logger.success("Build complete.");
}
