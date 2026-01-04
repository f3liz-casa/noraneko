export const _left = Symbol("Left");
export const _right = Symbol("Right");

export type Left<L> = {
  readonly kind: typeof _left;
  readonly isLeft: true;
  readonly isRight: false;
  readonly value: L;
};

export type Right<R> = {
  readonly kind: typeof _right;
  readonly isLeft: false;
  readonly isRight: true;
  readonly value: R;
};

export type Either<L, R> = Left<L> | Right<R>;

export function Left<L>(value: L): Left<L> {
  return { kind: _left, isLeft: true, isRight: false, value };
}

export function Right<R>(value: R): Right<R> {
  return { kind: _right, isLeft: false, isRight: true, value };
}

export function isLeft<L, R>(either: Either<L, R>): either is Left<L> {
  return either.isLeft === true;
}

export function isRight<L, R>(either: Either<L, R>): either is Right<R> {
  return either.isRight === true;
}

export function map<L, R, U>(
  either: Either<L, R>,
  transform: (value: R) => U,
): Either<L, U> {
  return either.isRight
    ? Right(transform(either.value))
    : (either as unknown as Either<L, U>);
}

export function flatMap<L, R, U>(
  either: Either<L, R>,
  transform: (value: R) => Either<L, U>,
): Either<L, U> {
  return either.isRight
    ? transform(either.value)
    : (either as unknown as Either<L, U>);
}

export function getOrElse<L, R>(either: Either<L, R>, defaultValue: R): R {
  return either.isRight ? either.value : defaultValue;
}
