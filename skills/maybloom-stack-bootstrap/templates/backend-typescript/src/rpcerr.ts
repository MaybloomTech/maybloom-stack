import { Code, ConnectError, type Interceptor } from "@connectrpc/connect";
import { kRequestId } from "context";
import { server } from "server";

// The one shape for an error whose message the client may see while its
// cause stays in the log, mirroring the Go path's rpcerr.Internal. Connect
// sends an error's message to the client, so a driver's text must never be
// the error a store throws; it is the cause behind a public message.
export function internalError(publicMessage: string, cause: unknown): ConnectError {
  return new ConnectError(publicMessage, Code.Internal, undefined, undefined, cause);
}

// The safety net, outermost: anything that is not already a ConnectError
// (a driver error a store did not wrap, a bug) reaches the wire as
// CodeInternal "internal error", and the cause goes to the log with the
// request id. Internal-class ConnectErrors are logged the same way;
// refusals (the expected client failures) are the Fastify access log's.
export const errorInterceptor: Interceptor = (next) => async (req) => {
  try {
    return await next(req);
  } catch (error) {
    const err = error instanceof ConnectError ? error : internalError("internal error", error);
    if (err.code === Code.Internal || err.code === Code.Unknown || err.code === Code.Unavailable) {
      server.log.error(
        { err, cause: err.cause, rpc: `${req.service.typeName}/${req.method.name}`, reqId: req.contextValues.get(kRequestId) },
        "rpc failed",
      );
    }
    throw err;
  }
};

