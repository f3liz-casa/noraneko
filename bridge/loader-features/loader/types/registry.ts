// SPDX-License-Identifier: MPL-2.0

/**
 * Registry Types - Data-Oriented Programming Style
 *
 * Type definitions for module registry.
 */

import type { ModuleMetadata } from "./module.ts";

/** Module info stored in registry */
export interface ModuleInfo {
  name: string;
  instance: any;
  metadata: ModuleMetadata;
  loadedAt: number;
  isNMAModule: boolean;
}

/** Hotswap event types */
export interface HotswapEvent {
  type: "cleanup" | "load" | "hotswap_start" | "hotswap_complete";
  moduleName?: string;
  success?: boolean;
  timestamp: number;
}

/** Hotswap listener function type */
export type HotswapListener = (event: HotswapEvent) => void;
