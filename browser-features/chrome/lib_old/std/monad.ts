import { type Try, Success, Failure, isFailure } from "./try.ts";
import { type Option, Some, None, isNone } from "./option.ts";

// This interface helps TS infer that 'yield' returns the unwrapped value 'T'
// when yielding a 'Try<T, any>'
export interface TryGenerator<T, E>
  extends Generator<Try<any, any>, T, unknown> {}

/**
 * Simulates Monadic.jl's @mdo or Haskell's do-notation.
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
