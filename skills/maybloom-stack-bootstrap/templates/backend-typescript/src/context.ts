import { createContextKey } from "@connectrpc/connect";

// Connect-RPC context keys propagate request-scoped data from the auth/CORS
// hooks down to handlers. Add new keys here; set them in main.ts's
// `contextValues` callback; read them in handlers via
// `context.values.get(kUserId)`.
export const kRequestId = createContextKey<string | undefined>(undefined);
export const kUserId = createContextKey<string | undefined>(undefined);
