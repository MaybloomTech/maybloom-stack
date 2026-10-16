import type { DescMethod } from "@bufbuild/protobuf";
import { Code, ConnectError, type Interceptor } from "@connectrpc/connect";
import { kUserId } from "context";

// The gate, mirroring the Go path's auth.Interceptor: every RPC needs a
// caller (kUserId, set in main.ts's contextValues) except the ones listed as
// open (Health). Handlers read the identity and never check for it; a
// mutation that reaches a handler has a caller.
export function createAuthInterceptor(open: DescMethod[]): Interceptor {
  const openSet = new Set(open.map((m) => `${m.parent.typeName}/${m.name}`));
  return (next) => async (req) => {
    const procedure = `${req.service.typeName}/${req.method.name}`;
    if (!openSet.has(procedure) && !req.contextValues.get(kUserId)) {
      throw new ConnectError("sign in first", Code.Unauthenticated);
    }
    return next(req);
  };
}
