// SPDX-License-Identifier: MPL-2.0

import * as path from "@std/path";
import { PATHS } from "./defines.ts";
import { Logger, createSymlink } from "./utils.ts";

const logger = new Logger("symlinker");

export function run(): void {
  const pairs: Array<[string, string]> = [
    [
      path.join(PATHS.loader_features, "link-features-chrome"),
      PATHS.features_chrome,
    ],
    [path.join(PATHS.loader_features, "link-i18n"), PATHS.i18n],
    [path.join(PATHS.loader_modules, "link-modules"), PATHS.modules],
  ];

  for (const [link, target] of pairs) {
    createSymlink(link, target);
  }

  logger.success("Symlinks created successfully.");
}
