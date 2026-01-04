// SPDX-License-Identifier: MPL-2.0
// Julia/Kotlin-style Either monad

export const _left = Symbol("Left");
export const _right = Symbol("Right");

export type Left<L> = {
  readonly kind: typeof _left;
  readonly isLeft: true;
  readonly isRight: false;
  readonly left: L;
};

export type Right<R> = {
  readonly kind: typeof _right;
  readonly isLeft: false;
  readonly isRight: true;
  readonly right: R;
};

export type Either<L, R> = Left<L> | Right<R>;

// ============================================================================
// Constructors
// ============================================================================

export function Left<L>(left: L): Left<L> {
  return { kind: _left, isLeft: true, isRight: false, left };
}

export function Right<R>(right: R): Right<R> {
  return { kind: _right, isLeft: false, isRight: true, right };
}

// ============================================================================
// Type Guards
// ============================================================================

export function isLeft<L, R>(either: Either<L, R>): either is Left<L> {
  return either.isLeft === true;
}

export function isRight<L, R>(either: Either<L, R>): either is Right<R> {
  return either.isRight === true;
}

// ============================================================================
// Operations (Kotlin-style)
// ============================================================================

export function map<L, R, U>(
  either: Either<L, R>,
  transform: (value: R) => U,
): Either<L, U> {
  return either.isRight ? Right(transform(either.right)) : either;
}

export function mapLeft<L, R, U>(
  either: Either<L, R>,
  transform: (value: L) => U,
): Either<U, R> {
  return either.isLeft ? Left(transform(either.left)) : either;
}

export function flatMap<L, R, U>(
  either: Either<L, R>,
  transform: (value: R) => Either<L, U>,
): Either<L, U> {
  return either.isRight ? transform(either.right) : either;
}

export function fold<L, R, U>(
  either: Either<L, R>,
  onLeft: (left: L) => U,
  onRight: (right: R) => U,
): U {
  return either.isRight ? onRight(either.right) : onLeft(either.left);
}

export function getOrElse<L, R>(either: Either<L, R>, defaultValue: R): R {
  return either.isRight ? either.right : defaultValue;
}

export function getOrNull<L, R>(either: Either<L, R>): R | null {
  return either.isRight ? either.right : null;
}
