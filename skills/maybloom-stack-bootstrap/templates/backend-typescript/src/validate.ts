import { Code, ConnectError, type Interceptor } from "@connectrpc/connect";
import { createValidator } from "@bufbuild/protovalidate";

// The contract's buf.validate rules, enforced before any handler runs, so
// this path refuses what the Go path refuses (an empty title, a page_size
// over the cap, an id that is not a uuid, a missing required message) with
// the same code. Handlers and stores check nothing the contract states.
const validator = createValidator();

export const validateInterceptor: Interceptor = (next) => async (req) => {
  if (!req.stream) {
    const result = validator.validate(req.method.input, req.message);
    if (result.kind === "invalid") {
      throw new ConnectError(
        `validation error: ${result.violations.map((v) => v.toString()).join("; ")}`,
        Code.InvalidArgument,
      );
    }
    if (result.kind === "error") {
      throw new ConnectError("could not validate the request", Code.Internal);
    }
  }
  return next(req);
};
