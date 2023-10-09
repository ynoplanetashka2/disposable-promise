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

const getCleanupIfPrecent = (
  maybeDisposablePromise: unknown,
): (() => void) | undefined => {
  if (
    isPromise(maybeDisposablePromise) &&
    Symbol.dispose in maybeDisposablePromise &&
    typeof maybeDisposablePromise[Symbol.dispose] === 'function'
  ) {
    return () => (maybeDisposablePromise[Symbol.dispose] as any)();
  }
};

export class DisposablePromise<T = unknown> {
  #cleanup: DisposeFunction = () => void 0;
  #promise: Promise<T>;
  #isAborted: boolean = false;
  #isPromiseSettled: boolean = false;
  #cleanupWasPerformed: boolean = false;

  get [Symbol.toStringTag]() {
    return 'DisposablePromise';
  }

  constructor(initFunction: DisposablePromiseInitFunction<T>) {
    const initWrapper: PromiseInitFunction<T> = (resolve, reject) => {
      let isResolverCalled = false;
      const handlePromiseSettling =
        <T>(resolver: (arg: T) => void) =>
        (arg: T) => {
          if (isResolverCalled) {
            return;
          }
          isResolverCalled = true;
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
    const chainedDisposablePromise = new DisposablePromise<U | V>(
      (res, rej) => {
        let cleanup: (() => void) | undefined;

        this.#promise.then(
          onFullfill
            ? (arg: T) => {
                if (chainedDisposablePromise.#isAborted) {
                  if (onReject) {
                    try {
                      const result = onReject(new AbortError());
                      const cleanup = getCleanupIfPrecent(result);
                      res(result);
                    } catch (err: unknown) {
                      rej(err);
                    }
                  } else {
                    rej(new AbortError());
                  }
                  return;
                }
                try {
                  const result = onFullfill(arg);
                  cleanup = getCleanupIfPrecent(result);
                  res(result);
                } catch (err: unknown) {
                  rej(err);
                }
              }
            : (arg: T) => {
                if (chainedDisposablePromise.#isAborted) {
                  if (onReject) {
                    try {
                      const result = onReject(new AbortError());
                      cleanup = getCleanupIfPrecent(result);
                      res(result);
                    } catch (err: unknown) {
                      rej(err);
                    }
                  } else {
                    rej(new AbortError());
                  }
                  return;
                }
                res(arg as any);
              },
          onReject
            ? (arg: unknown) => {
                try {
                  const result = onReject(arg);
                  cleanup = getCleanupIfPrecent(result);
                  res(result);
                } catch (err: unknown) {
                  rej(err);
                }
              }
            : rej,
        );

        return () => {
          if (chainedDisposablePromise.#isPromiseSettled) {
            return;
          }
          chainedDisposablePromise.#isAborted = true;
          if (cleanup) {
            cleanup();
          }
          this[Symbol.dispose]();
        };
      },
    );

    return chainedDisposablePromise;
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
    const stubDisposablePromise = new DisposablePromise<T>((res, rej) => {
      this.#promise.then((arg: T) => {
        if (stubDisposablePromise.#isAborted) {
          rej(new AbortError());
          return;
        }
        res(arg);
      }, rej);
    });

    return stubDisposablePromise;
  }

  static resolve<R>(value?: R): DisposablePromise<Awaited<R>> {
    return new DisposablePromise((res) => res(value as any));
  }

  static reject(error?: unknown) {
    return new DisposablePromise((_res, rej) => rej(error));
  }
}
