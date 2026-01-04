// SPDX-License-Identifier: MPL-2.0
// Julia/Kotlin-style Try monad (like Kotlin's runCatching)

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

// ============================================================================
// Constructors
// ============================================================================

export function Success<T>(value: T): Success<T> {
  return { kind: _success, isSuccess: true, isFailure: false, value };
}

export function Failure<E>(error: E): Failure<E> {
  return { kind: _failure, isSuccess: false, isFailure: true, error };
}

// ============================================================================
// Type Guards
// ============================================================================

export function isSuccess<T, E>(t: Try<T, E>): t is Success<T> {
  return t.isSuccess === true;
}

export function isFailure<T, E>(t: Try<T, E>): t is Failure<E> {
  return t.isFailure === true;
}

// ============================================================================
// Operations (Kotlin-style)
// ============================================================================

export function map<T, U, E>(
  t: Try<T, E>,
  transform: (value: T) => U,
): Try<U, E> {
  return t.isSuccess ? Success(transform(t.value)) : t;
}

export function flatMap<T, U, E>(
  t: Try<T, E>,
  transform: (value: T) => Try<U, E>,
): Try<U, E> {
  return t.isSuccess ? transform(t.value) : t;
}

export function fold<T, E, U>(
  t: Try<T, E>,
  onFailure: (error: E) => U,
  onSuccess: (value: T) => U,
): U {
  return t.isSuccess ? onSuccess(t.value) : onFailure(t.error);
}

export function getOrElse<T, E>(t: Try<T, E>, defaultValue: T): T {
  return t.isSuccess ? t.value : defaultValue;
}

export function getOrNull<T, E>(t: Try<T, E>): T | null {
  return t.isSuccess ? t.value : null;
}

export function getOrThrow<T, E>(t: Try<T, E>): T {
  if (t.isSuccess) return t.value;
  throw t.error;
}

// ============================================================================
// Kotlin-style runCatching
// ============================================================================

export function runCatching<T>(block: () => T): Try<T, Error> {
  try {
    return Success(block());
  } catch (e) {
    return Failure(e instanceof Error ? e : new Error(String(e)));
  }
}

export async function runCatchingAsync<T>(
  block: () => Promise<T>,
): Promise<Try<T, Error>> {
  try {
    return Success(await block());
  } catch (e) {
    return Failure(e instanceof Error ? e : new Error(String(e)));
  }
}
