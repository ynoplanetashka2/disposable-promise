import { DisposablePromise } from '../disposable-promise/DisposablePromise';

describe('DisposablePromise', () => {
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
      it("should invoke passed cleanup function, when Symbol.dispose called, if promise isn't settled", () => {
        const fn = jest.fn();
        const disposablePromise = new DisposablePromise<void>((res, _rej) => {
          // will be called on next tick, so promise will be hanging while cleanup is called
          setTimeout(res, 0);
          return fn;
        });

        disposablePromise[Symbol.dispose]();

        expect(fn.mock.calls.length).toBe(1);
      });

      it('should invoke passed cleanup function only once, if called multiple times', () => {
        const fn = jest.fn();
        const disposablePromise = new DisposablePromise<void>((res) => {
          setTimeout(res, 0);
          return fn;
        });

        disposablePromise[Symbol.dispose]();
        disposablePromise[Symbol.dispose]();

        expect(fn.mock.calls.length).toBe(1);
      });

      it('should not call cleanup function after promise completion(fullfilled)', async () => {
        const fn = jest.fn();
        const disposablePromise = new DisposablePromise<void>((res) => {
          res();
          return fn;
        });
        return Promise.resolve(disposablePromise).then(() => {
          disposablePromise[Symbol.dispose]();
          expect(fn.mock.calls.length).toBe(0);
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
          expect(fn.mock.calls.length).toBe(0);
        });
      });

      it('should return instances of DisposablePromise on calls of then, catch, finally', async () => {
        const methods = ['then', 'catch', 'finally'] as const;

        for (const method of methods) {
          const disposablePromise = new DisposablePromise((res) => void res(0));
          expect(
            (disposablePromise as any)[method](() => void 0),
          ).toBeInstanceOf(DisposablePromise);
        }
      });

      it('should be ok to pass undefined(dont return) cleanup function', async () => {
        const withoutCleanup = new DisposablePromise(() => void 0);
        expect(async () => withoutCleanup).not.toThrow();
      });

      it('should throw if not undefined or function passed as cleanup', async () => {
        const forbiddenCleanups = [null, '', '123', {}, [], Symbol(), 0.1];
        for (const forbiddenCleanup of forbiddenCleanups) {
          const withForbiddenCleanup = new DisposablePromise(
            () => forbiddenCleanup as any,
          );
          expect(withForbiddenCleanup).rejects.toThrow('unexpected value');
        }
      });

      it('should be chainable with regular promises', async () => {
        const resolved = DisposablePromise.resolve(Promise.resolve(1));
        return resolved.then((value) => {
          expect(value).toBe(1);
        });
      });
    });

    describe('with chaining', () => {});

    describe('utility methods', () => {
      it('should create resolved disposable promise with DisposablePromise.resolve', async () => {
        const resolved = DisposablePromise.resolve(1);
        expect(resolved).resolves.toBe(1);
      });

      it('should create rejected disposable promise with DisposablePromise.reject', async () => {
        const resolved = DisposablePromise.reject(new Error());
        expect(resolved).rejects.toThrow();
      });
    });
  });
});
