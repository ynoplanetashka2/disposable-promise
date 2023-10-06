import { isPromise } from "../../disposable-promise/utils/isPromise"

describe('isPromise', () => {
  it('should return true for native promises', () => {
    expect(isPromise(Promise.resolve())).toBe(true);
  })

  it('should return true for promise-likes', () => {
    const promiseLike = { then(_onFullfilled: any, _onRejected: any) { return Promise.resolve(); } };
    expect(isPromise(promiseLike)).toBe(true);
  })

  it('should return false for not promise-like arugment', () => {
    const notPromiseLikes = [0, null, undefined, '', [], {}, Symbol()];
    for (const notPromiseLike of notPromiseLikes) {
      expect(isPromise(notPromiseLike)).toBe(false);
    }
  })
})