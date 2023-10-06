export function isPromise(arg: unknown): arg is PromiseLike<unknown | void> {
  return (
    typeof arg === 'object' &&
    arg !== null &&
    'then' in arg &&
    typeof arg['then'] === 'function'
  );
}
