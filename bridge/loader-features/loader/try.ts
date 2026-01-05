// SPDX-License-Identifier: MPL-2.0

/**
 * Try Type - Success/Failure Pattern
 *
 * Julia/Kotlin-like functional patterns:
 * - Try type (Success/Failure) for error handling
 */

import * as E from "fp-ts/lib/Either.js";

export const _success = Symbol("Success");
export const _failure = Symbol("Failure");

export type Success<T> = {
  readonly kind: typeof _success;
  readonly isSuccess: true;
  readonly isFailure: false;
  readonly value: T;
};

export type Failure<E> = {
  readonly kind: typeof _failure;
  readonly isSuccess: false;
  readonly isFailure: true;
  readonly error: E;
};

export type Try<T, E = Error> = Success<T> | Failure<E>;

/** Create a success result */
export const Success = <T>(value: T): Success<T> => ({
  kind: _success,
  isSuccess: true,
  isFailure: false,
  value,
});

/** Create an error result */
export const Failure = <E>(error: E): Failure<E> => ({
  kind: _failure,
  isSuccess: false,
  isFailure: true,
  error,
});

/** Check if result is success */
export const isSuccess = <T, E>(t: Try<T, E>): t is Success<T> => t.isSuccess;

/** Check if result is failure */
export const isFailure = <T, E>(t: Try<T, E>): t is Failure<E> => t.isFailure;

/** Unwrap value or throw */
export const unwrap = <T, E>(t: Try<T, E>): T => {
  if (isFailure(t)) throw t.error;
  return t.value;
};

/** Unwrap value or return default */
export const unwrapOr = <T, E>(t: Try<T, E>, defaultValue: T): T =>
  isSuccess(t) ? t.value : defaultValue;

/** Map over result value */
export const mapTry = <T, U, E>(t: Try<T, E>, fn: (v: T) => U): Try<U, E> =>
  isSuccess(t) ? Success(fn(t.value)) : t;

// ============================================================================
// fp-ts Either interop
// ============================================================================

/** Convert Try to Either */
export const toEither = <T, E>(t: Try<T, E>): E.Either<E, T> =>
  isSuccess(t) ? E.right(t.value) : E.left(t.error);

/** Convert Either to Try */
export const fromEither = <T, E>(either: E.Either<E, T>): Try<T, E> =>
  E.isRight(either) ? Success(either.right) : Failure(either.left);
