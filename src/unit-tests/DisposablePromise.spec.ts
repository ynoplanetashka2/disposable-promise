import { DisposablePromise } from '../disposable-promise/DisposablePromise';
// import { symbolDispose as Symbol} from "../disposable-promise/utils/dispose";

describe('DisposablePromise', () => {
  it('should run init-function synchronously(same as regular Promise)', () => {
    let isSync = true;
    new DisposablePromise((_res, _rej) => {
      expect(isSync).toBe(true);
    });
    isSync = false;
  });

  it("should invoke passed cleanup function, when Symbol.dispose called, if promise isn't ended", () => {
    const fn = jest.fn(() => void 0);
    const disposablePromise = new DisposablePromise<void>((res, _rej) => {
      // will be called on next tick, so promise will be hanging while cleanup is called
      setTimeout(() => res(), 0);
      return fn;
    });

    disposablePromise[Symbol.dispose]();

    expect(fn.mock.calls.length).toBe(1);
  });

  it('should invoke passed cleanup function only once, if called multiple times', () => {
    const fn = jest.fn(() => void 0);
    const disposablePromise = new DisposablePromise<void>((res, _rej) => {
      // will be called on next tick, so promise will be hanging while cleanup is called
      setTimeout(() => res(), 0);
      return fn;
    });

    disposablePromise[Symbol.dispose]();
    disposablePromise[Symbol.dispose]();

    expect(fn.mock.calls.length).toBe(1);
  });

  it('should not call cleanup function after promise completion(fullfilled)', async () => {
    const fn = jest.fn(() => void 0);
    const disposablePromise = new DisposablePromise<void>((res, _rej) => {
      res();
      return fn;
    });
    return disposablePromise.then(() => {
      disposablePromise[Symbol.dispose]();
      expect(fn.mock.calls.length).toBe(0);
    });
  });

  it('should not call cleanup function after promise completion(failure)', async () => {
    const fn = jest.fn(() => void 0);
    const disposablePromise = new DisposablePromise((_res, rej) => {
      rej(1);
      return fn;
    });
    return disposablePromise.catch(() => {
      disposablePromise[Symbol.dispose]();
      expect(fn.mock.calls.length).toBe(0);
    });
  });

  it('should return instaces of DisposablePromise on calls of then, catch, finally', async () => {
    const methods = ['then', 'catch', 'finally'] as const;

    for (const method of methods) {
      const disposablePromise = new DisposablePromise(() => void 0);
      expect((disposablePromise as any)[method](() => void 0)).toBeInstanceOf(
        DisposablePromise,
      );
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

  it('should pass error through final', async () => {
    const fn = jest.fn();
    const disposablePromise = new DisposablePromise((_res, rej) =>
      rej(new Error()),
    );

    const withFinally = disposablePromise.finally(fn);
    await expect(withFinally).rejects.toThrow();
    expect(fn.mock.calls.length).toBe(1);
  });

  it('should create resolved disposable promise with DisposablePromise.resolve', async () => {
    const resolved = DisposablePromise.resolve(1);
    expect(resolved).resolves.toBe(1);
  });

  it('should create rejected disposable promise with DisposablePromise.reject', async () => {
    const resolved = DisposablePromise.reject(new Error());
    expect(resolved).rejects.toThrow();
  });

  it('should call cleanup on chained disposable promises', async () => {
    const cleanup = jest.fn();
    const resolved = new DisposablePromise<number>((res, _rej) => {
      res(1);
      return cleanup;
    });
    const chained = resolved.then((value) => value).then((value) => value);
    chained[Symbol.dispose]();
    expect(cleanup.mock.calls.length).toBe(1);
  });

  it("should call cleanup only once, event if cleanup called from promises and it's chained items", async () => {
    {
      // from promise to it's chained
      const cleanup = jest.fn();
      const resolved = new DisposablePromise((res) => {
        res(1);
        cleanup();
      });
      const chained = resolved.then(() => 2);
      resolved[Symbol.dispose]();
      chained[Symbol.dispose]();
      expect(cleanup.mock.calls.length).toBe(1);
    }
    {
      // from chained to corresponding promise
      const cleanup = jest.fn();
      const resolved = new DisposablePromise((res) => {
        res(1);
        cleanup();
      });
      const chained = resolved.then(() => 2);
      resolved[Symbol.dispose]();
      chained[Symbol.dispose]();
      expect(cleanup.mock.calls.length).toBe(1);
    }
  });

  it('should be chainable with regular promises', async () => {
    const resolved = DisposablePromise.resolve(Promise.resolve(1));
    return resolved.then((value) => {
      expect(value).toBe(1);
    });
  });

  it('should propagate error rised in catch to chained catch', async () => {
    const rejected = DisposablePromise.reject();
    const withError = rejected.catch(() => {
      throw 1;
    });
    const catched = withError.catch((err) => {
      expect(err).toBe(1);
      return 2;
    });
    expect(catched).resolves.toBe(2);
  });
});
