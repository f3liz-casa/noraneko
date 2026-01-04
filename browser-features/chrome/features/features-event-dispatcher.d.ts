// SPDX-License-Identifier: MPL-2.0

import type * as E from "fp-ts/Either";

type ExtractModuleName<T> = T extends {
  _metadata: () => { moduleName: infer N };
} ? N : never;

declare global {
  interface FeatureModuleRegistry {}
  interface FeatureModuleEventMethods {}
}

type AllFeatureClasses = FeatureModuleRegistry[keyof FeatureModuleRegistry];

type FeatureModuleClassMap = {
  [K in AllFeatureClasses as ExtractModuleName<K>]: K;
};

// Use the global event methods interface directly
type FeatureEventMethods = FeatureModuleEventMethods;

type EventMethodsToEither<T> = {
  [K in keyof T]: T[K] extends (...args: infer Args) => infer Ret
    ? Ret extends Promise<infer AsyncRet>
      ? (...args: Args) => Promise<E.Either<Error, AsyncRet>>
      : (...args: Args) => Promise<E.Either<Error, Ret>>
    : never;
};

type EventMethodsToSoftEither<T> = {
  [K in keyof T]: T[K] extends (...args: infer Args) => infer Ret
    ? Ret extends Promise<infer AsyncRet>
      ? (...args: Args) => Promise<E.Either<Error, AsyncRet | undefined>>
      : (...args: Args) => Promise<E.Either<Error, Ret | undefined>>
    : never;
};

export type InferredEventDispatcherDependencies<
  TDeps extends readonly (keyof FeatureEventMethods)[],
  TSoftDeps extends readonly (keyof FeatureEventMethods)[],
> = {
  [K in TDeps[number]]: EventMethodsToEither<FeatureEventMethods[K]>;
} & {
  [K in TSoftDeps[number]]: EventMethodsToSoftEither<FeatureEventMethods[K]>;
};

export type ModuleEventDispatcherType<TModuleName extends keyof FeatureEventMethods> =
  EventMethodsToEither<FeatureEventMethods[TModuleName]>;

export type SoftModuleEventDispatcherType<TModuleName extends keyof FeatureEventMethods> =
  EventMethodsToSoftEither<FeatureEventMethods[TModuleName]>;
