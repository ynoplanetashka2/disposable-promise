import { AbortError } from '../../disposable-promise/errors/AbortError';

describe('AbortError', () => {
  it('should has "AbortError" toStringTag', () => {
    const abortError = new AbortError();
    const stringified = Object.prototype.toString.call(abortError);
    expect(stringified).toBe('[object AbortError]');
  });
});
