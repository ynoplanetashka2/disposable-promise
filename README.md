# about

This library brings concept of cancellability to promises.
It uses `Symbol.dispose` as general way to implement cleanup/cancellation.

# the point

It's pretty common for promise to represent something, what potentially can be cancelled.
Probably, most common case for promises - http requests.
While usually you can abort http request with _AbortController_ and _signal_ there are some limitations:

- it isn't very convinient
- it doesn't let us know how to cancel a promise in general
- while we simply want to cancel a promise this approach forces us to create a new entity(_AbortController_)

And now, `ECMAScript Explicit Resource Management` poposal on stage 3, and typescript supports it out of the box, so looks like now exist pretty conviniet and standardized way to represent cancellation.

# why should i choose this lib?

- standardized way to cancel a promise, no more different approahces for different resources
- isomorphic (works both on node and browser)
- well testes
- flexible control over cancellation propagation

# api

## class DisposablePromise

class `DisposablePromise` should be used to create _disposable promises_

### DisposablePromise.constructor

`DisposablePromise.constructor` receives argument similar to regular `Promise` _(resolve, reject) => void_,
but argument of `DisposablePromise.constructor` may also return _cleanup_, so argument has signature _(resolve, reject) => cleanup | undefined_.

```js
const disposablePromise = new DisposablePromise((resolve, reject) => {
  const AbortController = new AbortController();
  resolve(
    fetch('https://google.com', {
      signal: AbortController.signal,
    }),
  );
  const cleanup = () => {
    AbortController.abort();
  };
  return cleanup;
});
```

### DisposablePromise.prototype[Symbol.dispose]

DisposablePromise.prototype[Symbol.dispose] is used to cancel a `DisposablePromise`.

### DisposablePromise.prototype.then

`DisposablePromise.prototype.then` method is similar to `Promise.prototype.then`, except `DisposablePromise.prototype.then` not only chaining _tasks_, but also chaning _cleanup's_.
if we create new `DisposablePromise` with `then`, and later call `Symbol.dispose` on chained `DisposablePromise` instance, then if root `DisposablePromise` isn't settled yet, it will try to abort.

```js
const root = new DisposablePromise(/* ... */);
const chained = root.then(/* ... */);

// will cancel root, insead of chained, if possible
chained[Symbol.dispose]();
```

also if function passed to `then` will return `DisposablePromise` insatnce, then it's _cleanup_ also would be chained.

### DisposablePromise.prototype.catch

_DisposablePromise.prototype.catch(onReject)_ is an alias for _DisposablePromise.prototype.then(undefined, onReject)_.

### DisposablePromise.prototype.finally

`DisposablePromise.prototype.finally` is similar to `Promise.prototype.finally`, except it chain _cleanup's_.

### DisposablePromise.prototype.stub

`DisposablePromise.prototype.stub` method is used to prevent _cleanup_ propagation.
Suppose you have only root `DisposablePromise` with multiple chained `DisposablePromise` and it's valid to cancel one of chained `DisposablePromises`'s, while other still should be loaded.
In such case trying to cancel one of the chained `DisposablePromises`'s can cause root `DisposablePromise` to abort and as a result all chained `DisposablePromise`'s won't get it's data as expected.
To work around such problems you can make a stub of root `DisposablePromise`, and _cleanup_ of chained `DisposablePromise`'s won't affect _cleanup_ of root `DisposablePromise`.

```js
const root = new DisposablePromise(/* ... */);
const chained = root.stub().then(/* ... */):

// won't affect root's cleanup
chained[Symbol.dispose]()
```

### DisposablePromise.resolve

`DisposablePromise.resolve` is similar to `Promise.resolve`, except it creates an instance of `DisposablePromise` and preserve cleanup's.

### DisposablePromise.reject

`DisposablePromise.reject` is similar to `Promise.reject`, except it creates an instance of `DisposablePromise` and preserve cleanup's.

```

```

# deep-dive

## cancellation

if `DisposablePromise` instance is already settled, then calling cleanup will do nothing.

while it isn't stricktly required, but when creating your own `DisposablePromise`'s instances recommended to raise an error, when cancellation is performed(similar to how fetch would raise an error if abort is performed).

## cancellation propagation

cancellation will propagate up to the innermost pending `DisposablePromise` in the chain.
it can be helpful, for example, in the case if you have some queries, which depend on each other and if you wanna abort these queries you probably want to abort as soon as possible.

if innermost pending `DisposablePromise` haven't raised an error after abortion attempt and later fullfilled, then chained `DisposablePromise`, which initiated abortion, will receive `AbortError` to prevent waste computations.

if between chained `DisposablePromise` and innermost pending `DisposablePromise` exist a `stub`, then first `stub` on the way from chained to root will be treated as innermost pending `DisposablePromise`.

## async settling

while function passed to `DisposablePromise` constructor invoked synchronously, even if _resolve_ will be called synchronously `DisposablePromise` instance will change its state from _pending_ to _settled_ asynchronously.
it may help to prevent unexpected behaviour in cases like this:

```js
new DisposablePromise((resolve) => {
  resolve(maybePromise);
});
```

in this case, if `DisposablePromise` could become _setttled_ synchronously our code would act different, depending on the value of `maybePromise`.

the moment of `DisposablePromise` become _settled_ is important to _canellation propagation_.
