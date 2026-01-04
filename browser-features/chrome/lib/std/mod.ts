// SPDX-License-Identifier: MPL-2.0
// Standard library - Julia/Kotlin-style FP primitives

// Monads (namespaced exports)
export * as Option from "./Option.ts";
export * as Either from "./Either.ts";
export * as Try from "./Try.ts";

// Codec utilities
export { decode, decodeOrThrow, v } from "./Codec.ts";

// Monadic do-notation
export { tryDo, tryDoAsync, optionDo } from "./Monad.ts";

// Pipe operator
export { pipe, compose } from "./Pipe.ts";

// Re-export common constructors for convenience
export { Some, None, isSome, isNone, fromNullable } from "./Option.ts";
export { Left, Right, isLeft, isRight } from "./Either.ts";
export {
  Success,
  Failure,
  isSuccess,
  isFailure,
  runCatching,
  runCatchingAsync,
} from "./Try.ts";
