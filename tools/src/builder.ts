// SPDX-License-Identifier: MPL-2.0

import * as path from "@std/path";
import { PROJECT_ROOT, PATHS, BIN_DIR } from "./defines.ts";
import {
  createSymlink,
  exists,
  Logger,
  runCommandChecked,
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
  const results = commands.map(([cmd, dir]) => {
    logger.info(`Running \`${cmd.join(" ")}\` in \`${dir}\``);
    // Use runCommandChecked (sync) to capture stdout/stderr concisely in Deno
    const res = runCommandChecked(cmd[0], cmd.slice(1), dir);
    return {
      success: res.code === 0,
      cmd,
      dir,
      out: res.stdout,
      err: res.stderr,
    };
  });

  for (const res of results) {
    if (!res.success) {
      throw new Error(
        `Build command \`${res.cmd.join(" ")}\` in \`${res.dir}\` failed\nSTDOUT:\n${res.out}\nSTDERR:\n${res.err}`,
      );
    }
  }
}

export async function buildAndDeployNMA(version: string, channel = "nightly"): Promise<void> {
  logger.info("Packaging browser-features/chrome to NMA...");

  const type = channel === "release" ? "stable" : channel;
  const nmaFilename = `${type}_${version}_noraneko.nma.zip`;

  const result = runCommandChecked(
    "deno",
    ["task", "nma:build", "--version", version, "--channel", channel, "--output", nmaFilename],
    PROJECT_ROOT,
  );

  if (!result.success) {
    logger.warn(`NMA build failed:\n${result.stderr}`);
    return;
  }

  const srcPath = path.join(PROJECT_ROOT, nmaFilename);
  if (exists(srcPath) && exists(BIN_DIR)) {
    // Remove stale NMA files from BIN_DIR
    for (const entry of Deno.readDirSync(BIN_DIR)) {
      if (entry.name.match(/^[a-z0-9-]+_[a-z0-9.-]+_noraneko\.nma\.zip$/i)) {
        safeRemove(path.join(BIN_DIR, entry.name));
      }
    }
    Deno.copyFileSync(srcPath, path.join(BIN_DIR, nmaFilename));
    safeRemove(srcPath);
    logger.success(`NMA deployed: ${path.join(BIN_DIR, nmaFilename)}`);
  } else {
    logger.warn(`NMA file not found at ${srcPath} or BIN_DIR not ready, skipping deploy`);
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

  const devCommands: CommandTuple[] = [
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
      path.join(PROJECT_ROOT, "bridge/loader-features"),
    ],
    [
      ["deno", "task", "build"],
      path.join(PROJECT_ROOT, "browser-features/pages-aboutDialog"),
    ],
  ];

  const prodCommands: CommandTuple[] = [
    [
      ["deno", "task", "build", `--env.MODE=${mode}`],
      path.join(PROJECT_ROOT, "bridge/startup"),
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
      ["deno", "task", "build", `--env.MODE=${mode}`],
      path.join(PROJECT_ROOT, "bridge/loader-features"),
    ],
    [
      ["deno", "task", "build"],
      path.join(PROJECT_ROOT, "browser-features/pages-aboutDialog"),
    ],
    // [
    //   [
    //     "deno",
    //     "run",
    //     "-A",
    //     "vite",
    //     "build",
    //     "--base",
    //     "chrome://noraneko-settings/content",
    //   ],
    //   path.join(PROJECT_ROOT, "src/ui/settings"),
    // ],
  ];

  if (mode.startsWith("dev")) {
    await runInParallel(devCommands);
  } else {
    await runInParallel(prodCommands);
  }

  // Always package browser-features/chrome into NMA and deploy to BIN_DIR
  await buildAndDeployNMA(version);

  if (mode.startsWith("production")) {
    const mounts: Array<[string, string]> = [
      ["content", "browser-features/chrome/_dist"],
      ["startup", "bridge/startup/_dist"],
      ["skin", "browser-features/skin"],
      ["resource", "bridge/loader-modules/_dist"],
      ["loader", "bridge/loader-features/_dist"],
      ["aboutdialog", "browser-features/pages-aboutDialog/_dist"],
    ];

    const dirPath = "_dist/noraneko";
    try {
      if (exists(dirPath)) {
        safeRemove(dirPath);
      }
    } catch {}
    Deno.mkdirSync(dirPath);

    for (const [subdir, target] of mounts) {
      const linkPath = path.resolve(dirPath, subdir);
      const targetPath = path.resolve(target);
      try {
        if (exists(linkPath)) {
          safeRemove(linkPath);
        }
      } catch {
        // ignore
      }

      try {
        createSymlink(linkPath, targetPath);
      } catch (e: any) {
        logger.warn(
          `Failed to create symlink ${linkPath} -> ${targetPath}: ${e?.message ?? e}`,
        );
      }
    }
  }

  logger.success("Build complete.");
}
