// SPDX-License-Identifier: MPL-2.0

/**
 * Event Dispatcher Registry
 *
 * DOP-style module event dispatcher with tuple-based Result type.
 * Provides safe method dispatch across module boundaries.
 */

// ============================================================================
// Result Type (Tuple-based)
// ============================================================================

export type Result<T, E extends Error = Error> = [T, null] | [null, E];

export const ok = <T>(value: T): [T, null] => [value, null];

export const err = <T = never>(error: string | Error): Result<T, Error> =>
  [null, typeof error === "string" ? new Error(error) : error];

export const isOk = <T, E extends Error>(
  result: Result<T, E>,
): result is [T, null] => result[1] === null;

export const isErr = <T, E extends Error>(
  result: Result<T, E>,
): result is [null, E] => result[1] !== null;

export const unwrap = <T, E extends Error>(result: Result<T, E>): T => {
  if (isErr(result)) throw result[1];
  return result[0];
};

export const unwrapOr = <T, E extends Error>(
  result: Result<T, E>,
  defaultValue: T,
): T => (isOk(result) ? result[0] : defaultValue);

export const mapResult = <T, U, E extends Error>(
  result: Result<T, E>,
  fn: (v: T) => U,
): Result<U, E> =>
  isOk(result) ? [fn(result[0]), null] : [null, result[1]];

// ============================================================================
// Event Dispatcher Registry
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventMethods = Record<string, (...args: any[]) => unknown>;

const _registry: Map<string, EventMethods> = new Map();

export const registerModuleEventDispatcher = (
  name: string,
  methods: EventMethods,
): void => {
  if (_registry.has(name)) {
    console.warn(
      `[EventDispatcher] Module ${name} is already registered, replacing`,
    );
  }
  _registry.set(name, methods);
};

export const unregisterModuleEventDispatcher = (name: string): void => {
  _registry.delete(name);
};

export const isModuleRegistered = (name: string): boolean =>
  _registry.has(name);

export const getEventDispatcherInstance = (
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Record<string, (...args: any[]) => Promise<Result<unknown, Error>>> => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Proxy({} as any, {
    get(_target, prop: string) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return async (...args: any[]) => {
        const module = _registry.get(name);
        if (!module || !(prop in module)) {
          return ok(undefined);
        }
        try {
          const result = await module[prop](...args);
          return ok(result);
        } catch (e) {
          return err(e instanceof Error ? e : new Error(String(e)));
        }
      };
    },
  });
};
