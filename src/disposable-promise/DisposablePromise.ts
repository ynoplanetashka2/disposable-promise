import { AbortError } from './errors/AbortError';
import { isPromise } from './utils/isPromise';

export type DisposeFunction = () => void;
export type PromiseInitFunction<T> = (
  resolve: (arg: T | PromiseLike<T>) => void,
  reject: (err: unknown) => void,
) => void;
export type DisposablePromiseInitFunction<T> = (
  resolve: (arg: T | PromiseLike<T>) => void,
  reject: (err: unknown) => void,
) => DisposeFunction | void;

export class DisposablePromise<T = unknown> {
  #cleanup: DisposeFunction = () => void 0;
  #promise: Promise<T>;
  #isPromiseSettled: boolean = false;
  #cleanupWasPerformed: boolean = false;

  get [Symbol.toStringTag]() {
    return 'DisposablePromise';
  }

  constructor(initFunction: DisposablePromiseInitFunction<T>) {
    const initWrapper: PromiseInitFunction<T> = (resolve, reject) => {
      const handlePromiseSettling =
        <T>(resolver: (arg: T) => void) =>
        (arg: T) => {
          Promise.resolve(arg).then((result: T) => {
            this.#onSettled();
            resolver(result);
          });
        };

      const cleanup = initFunction(
        handlePromiseSettling(resolve),
        handlePromiseSettling(reject),
      );
      if (typeof cleanup === 'function') {
        this.#cleanup = cleanup;
      } else if (cleanup === undefined) {
        return;
      } else {
        throw new TypeError(
          `unexpected value '${Object.prototype.toString.call(
            cleanup,
          )}' returned from DisposablePromise init-function`,
        );
      }
    };
    this.#promise = new Promise(initWrapper);
  }

  #onSettled() {
    this.#isPromiseSettled = true;
  }

  [Symbol.dispose]() {
    if (this.#cleanupWasPerformed || this.#isPromiseSettled) {
      return;
    }
    this.#cleanupWasPerformed = true;
    this.#cleanup();
  }

  then<U = void, V = void>(
    onFullfill: ((arg: T) => U | PromiseLike<U>) | undefined,
    onReject?: (err: unknown) => V | PromiseLike<V>,
  ): DisposablePromise<U | V> {
    const initFunction: DisposablePromiseInitFunction<U | V> = (res, rej) => {
      let cleanup: (() => void) | undefined;
      const setCleanupIfPrecent = (result: unknown) => {
        if (
          isPromise(result) &&
          Symbol.dispose in result &&
          typeof result[Symbol.dispose] === 'function'
        ) {
          cleanup = result[Symbol.dispose] as any;
        }
      };

      this.#promise.then(
        onFullfill
          ? (arg: T) => {
              try {
                const result = onFullfill(arg);
                setCleanupIfPrecent(result);
                res(result);
              } catch (err: unknown) {
                rej(err);
              }
            }
          : (res as any),
        onReject
          ? (arg: unknown) => {
              try {
                const result = onReject(arg);
                setCleanupIfPrecent(result);
                res(result);
              } catch (err: unknown) {
                rej(err);
              }
            }
          : rej,
      );

      return () => {
        if (cleanup) {
          cleanup();
        } else {
          this.#cleanup();
        }
      };
    };
    const disposablePromise = new DisposablePromise(initFunction);
    return disposablePromise;
  }

  catch<R>(
    onReject: (err: unknown) => R | PromiseLike<R>,
  ): DisposablePromise<R | T> {
    return this.then(undefined, onReject);
  }

  finally(onSettled: () => void) {
    return this.then(
      (arg: T) => {
        onSettled();
        return arg;
      },
      (err: unknown) => {
        onSettled();
        throw err;
      },
    );
  }

  stub(): DisposablePromise<T> {
    const initFunction: DisposablePromiseInitFunction<T> = (res, rej) => {
      Promise.prototype.then.call(this, res, rej);
    };
    return new DisposablePromise(initFunction);
  }

  static resolve<R>(value?: R): DisposablePromise<Awaited<R>> {
    return new DisposablePromise((res) => res(value as any));
  }

  static reject(error?: unknown) {
    return new DisposablePromise((_res, rej) => rej(error));
  }
}
