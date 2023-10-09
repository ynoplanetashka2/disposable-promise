import { DisposablePromise } from '../disposable-promise/DisposablePromise';
import { AbortError } from '../disposable-promise/errors/AbortError';

describe('DisposablePromise', () => {
  it('should return instances of DisposablePromise on calls of then, catch, finally', async () => {
    const methods = ['then', 'catch', 'finally'] as const;

    for (const method of methods) {
      const disposablePromise = new DisposablePromise((res) => void res(0));
      expect((disposablePromise as any)[method](() => void 0)).toBeInstanceOf(
        DisposablePromise,
      );
    }
  });

  it('should implement Symbol.toStringTag property', () => {
    const disposablePromise = new DisposablePromise((res) => res(0));
    expect(disposablePromise[Symbol.toStringTag]).toBe('DisposablePromise');
    expect(Object.prototype.toString.call(disposablePromise)).toBe(
      '[object DisposablePromise]',
    );
  });

  it('should become settled asynchronously', async () => {
    const cleanup = jest.fn();
    const disposablePromise = new DisposablePromise((res) => {
      res(1);
      return cleanup;
    });

    // cleanup won't be called if disposablePromise settled, so we this hack to test if it settled
    disposablePromise[Symbol.dispose]();
    await disposablePromise;

    expect(cleanup).toBeCalledTimes(1);
  });

  describe('promise-like behaviour', () => {
    it('should run init-function synchronously(same as regular Promise)', () => {
      expect.assertions(1);
      let isSync = true;
      new DisposablePromise((_res, _rej) => {
        expect(isSync).toBe(true);
      });
      isSync = false;
    });

    describe('operations chaining', () => {
      it('should be chainable with regular promises', async () => {
        const resolved = DisposablePromise.resolve(Promise.resolve(1));
        return resolved.then((value) => {
          expect(value).toBe(1);
        });
      });

      const operations = {
        throwError: () => {
          throw new Error();
        },
        returnValue: () => 1,
      };
      const chainings = ['then', 'catch', 'finally'];

      const okResult = (value: unknown) => ({
        type: 'fulfilled',
        value,
      });
      const errorResult = (error: unknown) => ({
        type: 'rejected',
        error,
      });
      for (const chaining1 of chainings) {
        for (const chaining2 of chainings) {
          for (const [operationName1, operation1] of Object.entries(
            operations,
          )) {
            for (const [operationName2, operation2] of Object.entries(
              operations,
            )) {
              it(`should end up with the same result after calling ${chaining1} with ${operationName1}, ${chaining2} with ${operationName2} as regular promise do`, async () => {
                const regularPromise = Promise.resolve();
                const disposablePromise = DisposablePromise.resolve();

                let regularPromiseResult: any;
                let disposablePromiseResult: any;
                const regularPromiseChaining = (regularPromise as any)
                  [chaining1](operation1)
                  [chaining2](operation2)
                  .then(
                    (value: unknown) => {
                      regularPromiseResult = okResult(value);
                    },
                    (error: unknown) => {
                      regularPromiseResult = errorResult(error);
                    },
                  );
                const disposablePromiseChaining = (disposablePromise as any)
                  [chaining1](operation1)
                  [chaining2](operation2)
                  .then(
                    (value: unknown) => {
                      disposablePromiseResult = okResult(value);
                    },
                    (error: unknown) => {
                      disposablePromiseResult = errorResult(error);
                    },
                  );

                await Promise.all([
                  regularPromiseChaining,
                  disposablePromiseChaining,
                ]);
                expect(regularPromiseResult).toEqual(disposablePromiseResult);
              });
            }
          }
        }
      }
    });

    describe('async chaining', () => {
      const chainings = ['then', 'finally'];
      for (const chaining of chainings) {
        it(`should run callback passed to ${chaining} asynchronously`, () => {
          expect.assertions(1);
          const disposablePromise = DisposablePromise.resolve();
          let isSync = true;
          (disposablePromise as any)[chaining](() => {
            expect(isSync).toBe(false);
          });
          isSync = false;
        });
      }

      it('should run callback passed to catch asynchronously', () => {
        expect.assertions(1);
        const disposablePromise = DisposablePromise.reject();
        let isSync = true;
        disposablePromise.catch(() => {
          expect(isSync).toBe(false);
        });
        isSync = false;
      });
    });
  });

  describe('cleanup', () => {
    describe('without chaining', () => {
      it("should invoke passed cleanup function, when Symbol.dispose called, if promise isn't settled", async () => {
        const fn = jest.fn();
        const disposablePromise = new DisposablePromise<void>((res, _rej) => {
          // will be called on next tick, so promise will be hanging while cleanup is called
          setTimeout(res, 0);
          return fn;
        });
        disposablePromise[Symbol.dispose]();

        expect(fn).toBeCalledTimes(1);
      });

      it('should invoke passed cleanup function only once, if called multiple times', () => {
        const fn = jest.fn();
        const disposablePromise = new DisposablePromise<void>((res) => {
          setTimeout(res, 0);
          return fn;
        });

        disposablePromise[Symbol.dispose]();
        disposablePromise[Symbol.dispose]();

        expect(fn).toBeCalledTimes(1);
      });

      it('should not call cleanup function after promise completion(fullfilled)', async () => {
        const fn = jest.fn();
        const disposablePromise = new DisposablePromise<void>((res) => {
          res();
          return fn;
        });
        return Promise.resolve(disposablePromise).then(() => {
          disposablePromise[Symbol.dispose]();
          expect(fn).toBeCalledTimes(0);
        });
      });

      it('should not call cleanup function after promise completion(failure)', async () => {
        const fn = jest.fn();
        const disposablePromise = new DisposablePromise((_res, rej) => {
          rej(1);
          return fn;
        });
        return Promise.resolve(disposablePromise).catch(() => {
          disposablePromise[Symbol.dispose]();
          expect(fn).toBeCalledTimes(0);
        });
      });

      it('should be ok to pass undefined(dont return) cleanup function', async () => {
        const withoutCleanup = new DisposablePromise((res) => res(1));
        await expect(withoutCleanup).resolves.toBe(1);
      });

      it('should throw if not undefined or function passed as cleanup', async () => {
        const forbiddenCleanups = [null, '', '123', {}, [], Symbol(), 0.1];
        for (const forbiddenCleanup of forbiddenCleanups) {
          const withForbiddenCleanup = new DisposablePromise(
            () => forbiddenCleanup as any,
          );
          await expect(withForbiddenCleanup).rejects.toThrow(
            'unexpected value',
          );
        }
      });

      it("should not raise an Error, if cleanup haven't raised an Error", async () => {
        const disposablePromise = new DisposablePromise((res) => {
          setTimeout(() => res(1), 0);
          return () => void 0;
        });
        disposablePromise[Symbol.dispose]();
        await expect(disposablePromise).resolves.toBe(1);
      });

      it('should rethrow an error thrown by cleanup call', async () => {
        const errorMessage = 'error text';
        const disposablePromise = new DisposablePromise((res) => {
          setTimeout(() => res(1), 0);
          return () => {
            throw new Error(errorMessage);
          };
        });
        expect(() => {
          disposablePromise[Symbol.dispose]();
        }).toThrow(errorMessage);
        await expect(disposablePromise).resolves.toBe(1);
      });
    });

    describe('with chaining', () => {
      it("should raise AbortError on chanied promise's, if Symbol.dispose was called on chained promise while root promise was pending and root promise haven't rised an error", async () => {
        const disposablePromise = new DisposablePromise((res) => res(1));
        const chained = disposablePromise.then(() => void 0);

        chained[Symbol.dispose]();

        await expect(disposablePromise).resolves.toBe(1);
        await expect(chained).rejects.toThrow(AbortError);
      });

      it("should be possible to catch AbortError on chanied promise's catch, if Symbol.dispose was called on chained promise while root promise was pending and root promise haven't rised an error", async () => {
        expect.assertions(5);

        const onFullfill = jest.fn();
        const onReject = jest.fn((arg: unknown) => {
          expect(arg).toBeInstanceOf(AbortError);
          return 2;
        });
        const disposablePromise = new DisposablePromise((res) => res(1));
        const chained = disposablePromise.then(onFullfill, onReject);

        chained[Symbol.dispose]();

        await expect(disposablePromise).resolves.toBe(1);
        await expect(chained).resolves.toBe(2);
        expect(onFullfill).toBeCalledTimes(0);
        expect(onReject).toBeCalledTimes(1);
      });

      it("should perform root promise cleanup when Symbol.dispose called on chained promise's", async () => {
        expect.assertions(1);

        const cleanup = jest.fn();
        const disposablePromise = new DisposablePromise((res) => {
          setTimeout(() => res(1), 0);
          return cleanup;
        });
        const chained = disposablePromise.then(() => void 0);
        chained.catch(() => void 0);

        chained[Symbol.dispose]();

        return Promise.resolve(disposablePromise).then(() => {
          expect(cleanup).toBeCalledTimes(1);
        });
      });

      it('should perform root promise cleanup only once, when cleanup called multiple times on the same chained promise', async () => {
        expect.assertions(1);

        const cleanup = jest.fn();
        const disposablePromise = new DisposablePromise((res) => {
          setTimeout(() => res(1), 0);
          return cleanup;
        });
        const chained = disposablePromise.then(() => void 0);
        chained.catch(() => void 0);

        chained[Symbol.dispose]();
        chained[Symbol.dispose]();

        return Promise.resolve(disposablePromise).then(() => {
          expect(cleanup).toBeCalledTimes(1);
        });
      });

      it('should perform root promise cleanup only once, when cleanup called from different chained promises', async () => {
        expect.assertions(1);

        const cleanup = jest.fn();
        const disposablePromise = new DisposablePromise((res) => {
          setTimeout(() => res(1), 0);
          return cleanup;
        });
        const chained1 = disposablePromise.then(() => void 0);
        const chained2 = disposablePromise.then(() => void 0);
        chained1.catch(() => void 0);
        chained2.catch(() => void 0);

        chained1[Symbol.dispose]();
        chained2[Symbol.dispose]();

        return Promise.resolve(disposablePromise).then(() => {
          expect(cleanup).toBeCalledTimes(1);
        });
      });

      it('should propagate cleanup from chained promises to root with nested chaning', async () => {
        expect.assertions(1);
        const cleanup = jest.fn();
        const disposablePromise = new DisposablePromise((res) => {
          setTimeout(() => res(1), 0);
          return cleanup;
        });
        const chained = disposablePromise.then(() => void 0);
        const nestedChained = chained.then(() => void 0);
        chained.catch(() => void 0);
        nestedChained.catch(() => void 0);

        nestedChained[Symbol.dispose]();

        return Promise.resolve(disposablePromise).then(() => {
          expect(cleanup).toBeCalledTimes(1);
        });
      });

      it('should call cleanup of chained promise, if root promise already settled, chained promise is pending, and Symbol.dispose of chained promise was called', async () => {
        expect.assertions(2);
        const rootCleanup = jest.fn();
        const chainedCleanup = jest.fn();
        const disposablePromise = new DisposablePromise((res) => {
          res(1);
          return rootCleanup;
        });
        const chained = disposablePromise.then(() => {
          return new DisposablePromise((res) => {
            Promise.resolve()
              .then(() => {
                chained[Symbol.dispose]();
              })
              .then(() => {
                res(2);
              });
            return chainedCleanup;
          });
        });

        await chained;
        expect(rootCleanup).toBeCalledTimes(0);
        expect(chainedCleanup).toBeCalledTimes(1);
      });

      it("should not call cleanup on chained promise's if Symbol.dispose called on root promise and root promise already settled", async () => {
        const cleaup = jest.fn();
        const disposablePromise = new DisposablePromise((res) => {
          res(1);
          return cleaup;
        });
        const chained: DisposablePromise<unknown> = disposablePromise
          .then(() => void chained[Symbol.dispose]())
          .catch(() => void 0);

        await chained;
        expect(cleaup).toBeCalledTimes(0);
      });

      it('should not invoke cleanup of chained promise if chained promise is settled', async () => {
        const cleanup = jest.fn();
        const root = new DisposablePromise((res) => {
          res(1);
        });
        const chained = root.then(() => {
          return new DisposablePromise((res) => {
            res(2);
            return cleanup;
          });
        });

        return chained
          .then(() => {
            chained[Symbol.dispose]();
          })
          .then(() => {
            expect(cleanup).toBeCalledTimes(0);
          });
      });

      describe('stub', () => {});
    });
  });

  describe('utility methods', () => {
    it('should create resolved disposable promise with DisposablePromise.resolve', async () => {
      const resolved = DisposablePromise.resolve(1);
      expect(resolved).resolves.toBe(1);
      expect(resolved).toBeInstanceOf(DisposablePromise);
    });

    it('should create rejected disposable promise with DisposablePromise.reject', async () => {
      const rejected = DisposablePromise.reject(new Error());
      expect(rejected).rejects.toThrow();
      expect(rejected).toBeInstanceOf(DisposablePromise);
    });
  });
});
