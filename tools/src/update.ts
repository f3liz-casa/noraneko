// SPDX-License-Identifier: MPL-2.0

import * as path from "@std/path";
import { runCommandChecked, exists, Logger } from "./utils.ts";
import { PROJECT_ROOT } from "./defines.ts";

const logger = new Logger("update");

export function writeVersion(geckoDir: string): void {
  const pkgPath = path.join(PROJECT_ROOT, "package.json");
  const pkg = JSON.parse(Deno.readTextFileSync(pkgPath));
  const version = pkg.version;
  const configDir = path.join(geckoDir, "config");
  Deno.mkdirSync(configDir, { recursive: true });
  ["version.txt", "version_display.txt"].forEach((file) => {
    Deno.writeTextFileSync(path.join(configDir, file), String(version));
  });
  logger.success(`Version files written to ${configDir}`);
}

export function writeBuildid2(pathBuildid2: string, buildid2: string): void {
  const dir = path.dirname(pathBuildid2);
  Deno.mkdirSync(dir, { recursive: true });
  Deno.writeTextFileSync(pathBuildid2, buildid2);
  logger.success(`Build ID written to ${pathBuildid2}`);
}

export function readBuildid2(pathBuildid2: string): string | null {
  if (!exists(pathBuildid2)) return null;
  return Deno.readTextFileSync(pathBuildid2).trim();
}

export function generateUuidV7(): string {
  const scriptPath = path.join(PROJECT_ROOT, "tools", "scripts", "gen-uuid.ts");
  const res = runCommandChecked("deno", ["run", "--allow-net", scriptPath]);
  if (!res.success) {
    throw new Error(`Failed to generate UUIDv7: ${res.stderr}`);
  }
  logger.info(`Generated build id: ${res.stdout.trim()}`);
  return res.stdout.trim();
}

export function generateUpdateXml(metaPath: string, outputPath: string): void {
  const meta = JSON.parse(Deno.readTextFileSync(metaPath));
  const patchUrl =
    "http://github.com/nyanrus/noraneko/releases/download/alpha/noraneko-win-amd64-full.mar";
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<updates>
  <update type="minor" displayVersion="${meta["version_display"]}" appVersion="${meta["version"]}" platformVersion="${meta["version"]}" buildID="${meta["buildid"]}" appVersion2="${meta["noraneko_version"]}">
    <patch type="complete" URL="${patchUrl}" size="${meta["mar_size"]}" hashFunction="sha512" hashValue="${meta["mar_shasum"]}"/>
  </update>
</updates>
`;
  Deno.writeTextFileSync(outputPath, xml);
  logger.success(`update.xml generated at ${outputPath}`);
}
