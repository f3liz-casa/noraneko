// SPDX-License-Identifier: MPL-2.0

/**
 * EventDispatcher Registry - Data-Oriented Programming Style
 * 
 * Julia/Kotlin-like functional patterns:
 * - Module-level state (data) + pure functions
 * - Result type: [value, error] tuple (Julia style)
 * - No classes, just data and functions
 * 
 * Note: Payloads don't need to be serializable as everything runs in one process.
 */

// ============================================================================
// Result Type - Julia-like tuple pattern [value, error]
// ============================================================================

/** Result type: [value, null] for success, [null, error] for failure */
export type Result<T> = [T, null] | [null, Error];

/** Create a success result */
export const ok = <T>(value: T): Result<T> => [value, null];

/** Create an error result */
export const err = <T>(error: Error | string): Result<T> => 
  [null, error instanceof Error ? error : new Error(error)];

/** Check if result is ok */
export const isOk = <T>(result: Result<T>): result is [T, null] => 
  result[1] === null;

/** Check if result is error */
export const isErr = <T>(result: Result<T>): result is [null, Error] => 
  result[1] !== null;

/** Unwrap value or throw */
export const unwrap = <T>(result: Result<T>): T => {
  if (isErr(result)) throw result[1];
  return result[0];
};

/** Unwrap value or return default */
export const unwrapOr = <T>(result: Result<T>, defaultValue: T): T => 
  isOk(result) ? result[0] : defaultValue;

/** Map over result value */
export const mapResult = <T, U>(result: Result<T>, fn: (v: T) => U): Result<U> =>
  isOk(result) ? ok(fn(result[0])) : [null, result[1]];

// ============================================================================
// fp-ts Either interop (for existing code using fp-ts)
// ============================================================================

import * as E from "fp-ts/lib/Either.js";

/** Convert Result to Either */
export const toEither = <T>(result: Result<T>): E.Either<Error, T> =>
  isOk(result) ? E.right(result[0]) : E.left(result[1]);

/** Convert Either to Result */
export const fromEither = <T>(either: E.Either<Error, T>): Result<T> =>
  E.isRight(either) ? ok(either.right) : err(either.left);

// ============================================================================
// Module State - Data (Julia-like module-level state)
// ============================================================================

/** Module registry: maps module name -> wrapped event functions */
const _modules: Map<string, Record<string, (...args: any[]) => Promise<E.Either<Error, any>>>> = new Map();

// ============================================================================
// Pure Functions - Operations on State
// ============================================================================

/**
 * Wrap a function to return Either for error safety
 */
const wrapFn = <T extends (...args: any[]) => any>(fn: T) => 
  async (...args: Parameters<T>): Promise<E.Either<Error, Awaited<ReturnType<T>>>> => {
    try {
      const result = await fn(...args);
      return E.right(result);
    } catch (error) {
      return E.left(error instanceof Error ? error : new Error(String(error)));
    }
  };

/**
 * Wrap all functions in an object
 */
const wrapFunctions = <T extends Record<string, any>>(
  functions: T
): Record<string, (...args: any[]) => Promise<E.Either<Error, any>>> => {
  const wrapped: Record<string, any> = {};
  for (const [key, fn] of Object.entries(functions)) {
    if (typeof fn === "function") {
      wrapped[key] = wrapFn(fn);
    }
  }
  return wrapped;
};

/**
 * Create a soft proxy for missing modules
 * Returns Either<Error, undefined> for any method call
 */
const createSoftProxy = (): Record<string, (...args: any[]) => Promise<E.Either<Error, undefined>>> =>
  new Proxy({} as any, {
    get: () => async () => E.right(undefined),
  });

// ============================================================================
// Public API - Event Dispatcher Functions
// ============================================================================

/**
 * Register a module's event dispatcher interface
 */
export function registerModuleEventDispatcher<T extends Record<string, any>>(
  moduleName: string,
  functions: T
): void {
  if (_modules.has(moduleName)) {
    console.warn(`[EventDispatcher] Module ${moduleName} is already registered, replacing...`);
  }
  _modules.set(moduleName, wrapFunctions(functions));
  console.debug(`[EventDispatcher] Registered module: ${moduleName}`);
}

/**
 * Unregister a module's event dispatcher interface
 */
export function unregisterModuleEventDispatcher(moduleName: string): void {
  _modules.delete(moduleName);
  console.debug(`[EventDispatcher] Unregistered module: ${moduleName}`);
}

/**
 * Check if a module is registered
 */
export function isModuleRegistered(moduleName: string): boolean {
  return _modules.has(moduleName);
}

/**
 * Get the event dispatcher instance for a module
 * Returns wrapped functions or soft proxy for missing modules
 */
export function getEventDispatcherInstance(moduleName: string): any {
  return _modules.get(moduleName) ?? createSoftProxy();
}

/**
 * Create typed event dispatcher object for module dependencies
 * Uses lazy getters for on-demand resolution
 */
export function createDependencyEventDispatchers<T extends Record<string, any>>(
  dependencies: string[]
): T {
  const eventsObject: any = {};
  
  for (const dep of dependencies) {
    Object.defineProperty(eventsObject, dep, {
      get: () => getEventDispatcherInstance(dep),
      enumerable: true,
      configurable: false,
    });
  }
  
  return eventsObject as T;
}


