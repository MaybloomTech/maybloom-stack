import type { DescMessage, MessageShape } from "@bufbuild/protobuf";
import { Code, ConnectError, type Interceptor } from "@connectrpc/connect";
import { createValidator } from "@bufbuild/protovalidate";

// The contract's buf.validate rules, enforced before any handler runs, so
// this path refuses what the Go path refuses (an empty title, a page_size
// over the cap, an id that is not a uuid, a missing required message) with
// the same code. Handlers and stores check nothing the contract states.
const validator = createValidator();

function check<D extends DescMessage>(schema: D, message: MessageShape<D>) {
  const result = validator.validate(schema, message);
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

// Each message of a client stream is checked as it arrives, so a streaming
// RPC gets the same rules as a unary one.
async function* checkEach<D extends DescMessage>(
  schema: D,
  messages: AsyncIterable<MessageShape<D>>,
): AsyncIterable<MessageShape<D>> {
  for await (const message of messages) {
    check(schema, message);
    yield message;
  }
}

export const validateInterceptor: Interceptor = (next) => async (req) => {
  if (req.stream) {
    return next({ ...req, message: checkEach(req.method.input, req.message) });
  }
  check(req.method.input, req.message);
  return next(req);
};
