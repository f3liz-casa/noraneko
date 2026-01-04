// SPDX-License-Identifier: MPL-2.0
// Julia/Kotlin-style Option monad

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

// ============================================================================
// Constructors
// ============================================================================

export function Some<T>(value: T): Some<T> {
  return { kind: _some, isSome: true, isNone: false, value };
}

export const None: None = { kind: _none, isSome: false, isNone: true };

// ============================================================================
// Type Guards
// ============================================================================

export function isSome<T>(option: Option<T>): option is Some<T> {
  return option.isSome === true;
}

export function isNone<T>(option: Option<T>): option is None {
  return option.isNone === true;
}

// ============================================================================
// Operations (Kotlin-style)
// ============================================================================

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

export function getOrNull<T>(option: Option<T>): T | null {
  return option.isSome ? option.value : null;
}

export function fold<T, U>(
  option: Option<T>,
  onNone: () => U,
  onSome: (value: T) => U,
): U {
  return option.isSome ? onSome(option.value) : onNone();
}

// ============================================================================
// Constructors from nullable
// ============================================================================

export function fromNullable<T>(value: T | null | undefined): Option<T> {
  return value != null ? Some(value) : None;
}
