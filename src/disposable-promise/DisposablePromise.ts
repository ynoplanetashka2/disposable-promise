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
  #isPromiseSettled: boolean = false;
  #cleanupWasPerformed: boolean = false;

  constructor(initFunction: DisposablePromiseInitFunction<T>) {
    let maybeCleanup: DisposeFunction | null = null;
    let isThisCreated = false;
    let isSynchronouslySettled = false;
    const initWrapper: PromiseInitFunction<T> = (resolve, reject) => {
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
          `unexpected value '${Object.prototype.toString.call(cleanup)}' returned from DisposablePromise init-function`,
        );
      }
    };
    super(initWrapper);
    isThisCreated = true;
    if (isSynchronouslySettled) {
      this.#onSettled();
    }
    this.#cleanup = maybeCleanup ?? this.#cleanup;
  }

  #onSettled() {
    this.#isPromiseSettled = true;
  }

  [Symbol.dispose]() {
    if (this.#cleanupWasPerformed || this.#isPromiseSettled) {
      return;
    }
    this.#cleanup();
    this.#cleanupWasPerformed = true;
  }

  then<U = void, V = void>(
    onFullfill: (arg: T) => U | PromiseLike<U>,
    onReject?: (err: unknown) => V | PromiseLike<V>,
  ): DisposablePromise<U | V> {
    const initFunction: DisposablePromiseInitFunction<U | V> = (res, rej) => {
      Promise.prototype.then.call(
        this,
        (arg: T) => {
          const result = onFullfill(arg);
          res(result);
        },
        onReject
          ? (arg: unknown) => {
              try {
                const result = onReject(arg);
                res(result);
              } catch (err: unknown) {
                rej(err);
              }
            }
          : rej,
      );
      return this.#cleanup;
    };
    const disposablePromise = new DisposablePromise(initFunction);
    return disposablePromise;
  }

  catch<R>(
    onReject: (err: unknown) => R | PromiseLike<R>,
  ): DisposablePromise<R | T> {
    const initFunction: DisposablePromiseInitFunction<R | T> = (res, rej) => {
      Promise.prototype.then.call(this, res, (arg: unknown) => {
        try {
          const result = onReject(arg);
          res(result);
        } catch (err: unknown) {
          rej(err);
        }
      });
      return this.#cleanup;
    };
    const disposablePromise = new DisposablePromise(initFunction);
    return disposablePromise;
  }

  finally(onSettled: () => void) {
    const initFunction: DisposablePromiseInitFunction<T> = (res, rej) => {
      Promise.prototype.then.call(
        this,
        (arg: T) => {
          onSettled();
          return res(arg);
        },
        (err: unknown) => {
          onSettled();
          return rej(err);
        },
      );
      return this.#cleanup;
    };
    const disposablePromise = new DisposablePromise(initFunction);
    return disposablePromise;
  }

  static resolve<R>(value?: R): DisposablePromise<Awaited<R>> {
    return new DisposablePromise((res) => res(value as any));
  }

  static reject(error?: unknown) {
    return new DisposablePromise((_res, rej) => rej(error));
  }
}
