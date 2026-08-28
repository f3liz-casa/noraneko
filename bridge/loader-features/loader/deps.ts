// SPDX-License-Identifier: MPL-2.0

/**
 * Dependency checks and ordering. Pure functions.
 */

import type { LoadedModule } from "./types.ts";

/**
 * Validate module dependencies (no missing, no circular).
 * Returns a set of module names that should be skipped due to dependency issues.
 * Never throws - errors are logged and the affected modules are excluded.
 */
export const validateDependencies = (modules: LoadedModule[]): Set<string> => {
  const moduleNames = new Set(modules.map((m) => m.name));
  const moduleMap = new Map(modules.map((m) => [m.name, m]));
  const invalid = new Set<string>();
  const visited = new Set<string>();
  const visiting = new Set<string>();

  const checkCircular = (name: string, path: string[]): void => {
    if (visiting.has(name)) {
      const cycle = [...path.slice(path.indexOf(name)), name];
      console.error(
        `[noraneko] Circular dependency detected: ${cycle.join(" -> ")}`,
      );
      for (const n of cycle) invalid.add(n);
      return;
    }
    if (visited.has(name)) return;

    visiting.add(name);
    const module = moduleMap.get(name);
    if (module) {
      for (const dep of module.metadata.dependencies) {
        if (moduleMap.has(dep)) checkCircular(dep, [...path, name]);
      }
    }
    visiting.delete(name);
    visited.add(name);
  };

  for (const module of modules) {
    // Check hard dependencies exist
    for (const dep of module.metadata.dependencies) {
      if (!moduleNames.has(dep)) {
        console.warn(
          `[noraneko] Skipping ${module.name}: missing dependency "${dep}"`,
        );
        invalid.add(module.name);
      }
    }
    checkCircular(module.name, []);
  }

  return invalid;
};

// ============================================================================
// Topological Sorting
// ============================================================================

/**
 * Topological sort modules by dependencies
 * Dependencies are loaded before dependents
 */
export const sortByDependencies = (modules: LoadedModule[]): LoadedModule[] => {
  const sorted: LoadedModule[] = [];
  const processed = new Set<string>();
  const moduleMap = new Map(modules.map((m) => [m.name, m]));

  const process = (module: LoadedModule): void => {
    if (processed.has(module.name)) return;

    for (const depName of module.metadata.dependencies) {
      const dep = moduleMap.get(depName);
      if (dep && !processed.has(depName)) process(dep);
    }

    sorted.push(module);
    processed.add(module.name);
  };

  modules.forEach(process);
  return sorted;
};
