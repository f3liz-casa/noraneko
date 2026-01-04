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

export function Success<T>(value: T): Success<T> {
  return { kind: _success, isSuccess: true, isFailure: false, value };
}

export function Failure<E>(error: E): Failure<E> {
  return { kind: _failure, isSuccess: false, isFailure: true, error };
}

export function isSuccess<T, E>(t: Try<T, E>): t is Success<T> {
  return t.isSuccess === true;
}

export function isFailure<T, E>(t: Try<T, E>): t is Failure<E> {
  return t.isFailure === true;
}

export function map<T, U, E>(
  t: Try<T, E>,
  transform: (value: T) => U,
): Try<U, E> {
  if (t.isSuccess) {
    return Success(transform(t.value));
  }
  return Failure(t.error);
}

export function flatMap<T, U, E>(
  t: Try<T, E>,
  transform: (value: T) => Try<U, E>,
): Try<U, E> {
  if (t.isSuccess) {
    return transform(t.value);
  }
  return Failure(t.error);
}

export function getOrElse<T, E>(t: Try<T, E>, defaultValue: T): T {
  return t.isSuccess ? t.value : defaultValue;
}

export function runCatching<T>(block: () => T): Try<T, Error> {
  try {
    return Success(block());
  } catch (e) {
    return Failure(e instanceof Error ? e : new Error(String(e)));
  }
}
