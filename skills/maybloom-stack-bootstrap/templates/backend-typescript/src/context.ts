import { createContextKey } from '@connectrpc/connect';

// Connect-RPC context keys propagate request-scoped data from main.ts's
// `contextValues` callback down to handlers, which read them with
// `context.values.get(kUserId)`. kUserId is "" for an anonymous caller; the
// auth interceptor (auth.ts) refuses those before any handler but Health
// runs, so a handler can use it as the caller without checking.
export const kRequestId = createContextKey<string>('');
export const kUserId = createContextKey<string>('');
