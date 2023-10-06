export class AbortError extends Error {
  get [Symbol.toStringTag]() {
    return 'AbortError';
  }
}
