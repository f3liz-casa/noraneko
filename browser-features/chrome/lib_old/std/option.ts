export const _some = Symbol("Some");
export const _none = Symbol("None");

export type Some<T> = {
  readonly kind: typeof _some;
  readonly isSome: true;
  readonly isNone: false;
  readonly value: T;
};

export type None = {
  readonly kind: typeof _none;
  readonly isSome: false;
  readonly isNone: true;
};

export type Option<T> = Some<T> | None;

export function Some<T>(value: T): Some<T> {
  return { kind: _some, isSome: true, isNone: false, value };
}

export const None: None = { kind: _none, isSome: false, isNone: true };

export function isSome<T>(option: Option<T>): option is Some<T> {
  return option.isSome === true;
}

export function isNone<T>(option: Option<T>): option is None {
  return option.isNone === true;
}

export function map<T, U>(
  option: Option<T>,
  transform: (value: T) => U,
): Option<U> {
  return option.isSome ? Some(transform(option.value)) : None;
}

export function flatMap<T, U>(
  option: Option<T>,
  transform: (value: T) => Option<U>,
): Option<U> {
  return option.isSome ? transform(option.value) : None;
}

export function getOrElse<T>(option: Option<T>, defaultValue: T): T {
  return option.isSome ? option.value : defaultValue;
}
