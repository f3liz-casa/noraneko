// SPDX-License-Identifier: MPL-2.0
// Monadic do-notation helpers (Julia's Monadic.jl style)

import { type Try, Success, isFailure } from "./Try.ts";
import { type Option, Some, None, isNone } from "./Option.ts";

// ============================================================================
// Try do-notation (like Julia's @mdo or Haskell's do-notation)
// ============================================================================

/**
 * Simulates Monadic.jl's @mdo for Try monad.
 *
 * @example
 * ```typescript
 * const result = tryDo(function* () {
 *   const a = yield Try.runCatching(() => JSON.parse(raw));
 *   const b = yield decode(schema, a);
 *   return b;
 * });
 * ```
 */
export function tryDo<T>(
  gen: () => Generator<Try<any, any>, T, any>,
): Try<T, Error> {
  const iterator = gen();
  let state = iterator.next();

  while (!state.done) {
    const result = state.value;
    if (isFailure(result)) {
      return result as unknown as Try<T, Error>;
    }
    state = iterator.next(result.value);
  }
  return Success(state.value);
}

/**
 * Async version of tryDo
 */
export async function tryDoAsync<T>(
  gen: () => AsyncGenerator<Try<any, any>, T, any>,
): Promise<Try<T, Error>> {
  const iterator = gen();
  let state = await iterator.next();

  while (!state.done) {
    const result = state.value;
    if (isFailure(result)) {
      return result as unknown as Try<T, Error>;
    }
    state = await iterator.next(result.value);
  }
  return Success(state.value);
}

// ============================================================================
// Option do-notation
// ============================================================================

/**
 * do-notation for Option monad.
 *
 * @example
 * ```typescript
 * const result = optionDo(function* () {
 *   const a = yield Option.fromNullable(maybeValue);
 *   const b = yield Option.fromNullable(a.nested);
 *   return b.value;
 * });
 * ```
 */
export function optionDo<T>(
  gen: () => Generator<Option<any>, T, any>,
): Option<T> {
  const iterator = gen();
  let state = iterator.next();

  while (!state.done) {
    const result = state.value;
    if (isNone(result)) {
      return None;
    }
    state = iterator.next(result.value);
  }
  return Some(state.value);
}
