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

export class DisposablePromise<T = unknown> extends Promise<T> {
  #cleanup: DisposeFunction = () => void 0;
  #reject: (err: unknown) => void;
  #isPromiseSettled: boolean = false;
  #cleanupWasPerformed: boolean = false;

  constructor(initFunction: DisposablePromiseInitFunction<T>) {
    let maybeCleanup: DisposeFunction | undefined;
    let isThisCreated = false;
    let isSynchronouslySettled = false;
    let rejectHolder: (arg: unknown) => void;
    const initWrapper: PromiseInitFunction<T> = (resolve, reject) => {
      rejectHolder = reject;
      const handlePromiseSettling =
        <T>(resolver: (arg: T) => void) =>
        (arg: T) => {
          if (isThisCreated) {
            this.#onSettled();
          } else {
            isSynchronouslySettled = true;
          }
          return resolver(arg);
        };

      const cleanup = initFunction(
        handlePromiseSettling(resolve),
        handlePromiseSettling(reject),
      );
      if (typeof cleanup === 'function') {
        maybeCleanup = cleanup;
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
    super(initWrapper);
    isThisCreated = true;
    if (isSynchronouslySettled) {
      this.#onSettled();
    }
    this.#reject = rejectHolder!;
    this.#cleanup = maybeCleanup ?? this.#cleanup;
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
    onFullfill: (arg: T) => U | PromiseLike<U>,
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

      Promise.prototype.then.call(
        this,
        (arg: T) => {
          try {
            const result = onFullfill(arg);
            setCleanupIfPrecent(result);
            res(result);
          } catch (err: unknown) {
            rej(err);
          }
        },
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
    const initFunction: DisposablePromiseInitFunction<R | T> = (res, rej) => {
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

      Promise.prototype.then.call(this, res, (error: unknown) => {
        try {
          const result = onReject(error);
          setCleanupIfPrecent(result);
          res(result);
        } catch (err: unknown) {
          rej(err);
        }
      });
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

  finally(onSettled: () => void) {
    const initFunction: DisposablePromiseInitFunction<T> = (res, rej) => {
      const handleSettled =
        <R>(resolver: (arg: R) => void) =>
        (arg: R) => {
          try {
            onSettled();
            resolver(arg);
          } catch (err: unknown) {
            rej(err);
          }
        };
      Promise.prototype.then.call(this, handleSettled(res), handleSettled(rej));
      return this.#cleanup;
    };
    const disposablePromise = new DisposablePromise(initFunction);
    return disposablePromise;
  }

  stab(): DisposablePromise<T> {
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
