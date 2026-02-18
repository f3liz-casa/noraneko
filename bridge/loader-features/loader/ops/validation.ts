// SPDX-License-Identifier: MPL-2.0

/**
 * Validation Operations - Data-Oriented Programming Style
 *
 * Pure functions for dependency validation and topological sorting.
 * No side effects - only data transformations.
 */

import type { LoadedModule } from "../types/mod.ts";

// ============================================================================
// Dependency Validation
// ============================================================================

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

// ============================================================================
// Reverse Dependency Graph
// ============================================================================

/**
 * Build reverse dependency graph (who depends on whom)
 * Used for determining cleanup order
 */
export const buildDependedByGraph = (
  modules: Map<string, { metadata: { dependencies: string[] } }>,
): Map<string, Set<string>> => {
  const dependedBy = new Map<string, Set<string>>();

  for (const [name, module] of modules) {
    if (!dependedBy.has(name)) {
      dependedBy.set(name, new Set());
    }

    for (const dep of module.metadata.dependencies) {
      if (!dependedBy.has(dep)) {
        dependedBy.set(dep, new Set());
      }
      dependedBy.get(dep)!.add(name);
    }
  }

  return dependedBy;
};

/**
 * Get modules sorted for cleanup (dependents first - topological sort)
 * Reverse of load order
 */
export const getSortedModulesForCleanup = (
  modules: Map<string, { metadata: { dependencies: string[] } }>,
): string[] => {
  const sorted: string[] = [];
  const visited = new Set<string>();
  const dependedBy = buildDependedByGraph(modules);

  const visit = (name: string): void => {
    if (visited.has(name)) return;
    visited.add(name);

    // Visit dependents first (modules that depend on this one)
    const deps = dependedBy.get(name);
    if (deps) {
      for (const dependent of deps) {
        visit(dependent);
      }
    }

    sorted.push(name);
  };

  for (const name of modules.keys()) {
    visit(name);
  }

  return sorted;
};

/**
 * Get modules for selective cleanup
 * Includes target modules plus all modules that depend on them
 */
export const getModulesForSelectiveCleanup = (
  moduleNames: string[],
  modulesMap: Map<string, { metadata: { dependencies: string[] } }>,
): string[] => {
  const allModulesToCleanup = new Set<string>(moduleNames);
  const dependedBy = buildDependedByGraph(modulesMap);

  // Add all modules that depend (directly or transitively) on the target modules
  const addDependents = (name: string): void => {
    const deps = dependedBy.get(name);
    if (!deps) return;

    for (const dependent of deps) {
      if (!allModulesToCleanup.has(dependent)) {
        allModulesToCleanup.add(dependent);
        addDependents(dependent);
      }
    }
  };

  for (const name of moduleNames) {
    addDependents(name);
  }

  // Topological sort (dependents first)
  const sorted: string[] = [];
  const visited = new Set<string>();

  const visit = (name: string): void => {
    if (visited.has(name) || !allModulesToCleanup.has(name)) return;
    visited.add(name);

    // Visit dependents first
    const deps = dependedBy.get(name);
    if (deps) {
      for (const dependent of deps) {
        if (allModulesToCleanup.has(dependent)) {
          visit(dependent);
        }
      }
    }

    sorted.push(name);
  };

  for (const name of allModulesToCleanup) {
    visit(name);
  }

  return sorted;
};
