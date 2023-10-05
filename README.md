# about

This library implements concept of cancellability to promises.
It uses `Symbol.dispose` as a standardized way to implement cancellation.

# the point

It's pretty common for promise to represent something, what potentially can be cancelled.
Probably, most common case for promises - http requests.
While usually u can abort http request with _AbortController_ and _signal_ there are some limitations:
- it isn't very convinient
- it doesn't let as know how to cancel a promise in general
- while we simply want to cancel a promise this approach forces us to create a new entity

And now, `ECMAScript Explicit Resource Management` poposal on stage 3, and typescript support it out of the box, so looks like now exist pretty conviniet and standardized way to represent cancellation.

<!-- TODO: api section-->