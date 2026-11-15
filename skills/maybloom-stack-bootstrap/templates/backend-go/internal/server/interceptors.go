package server

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"log/slog"
	"regexp"
	"runtime/debug"
	"time"

	"connectrpc.com/connect/v2"
)

// Cross-cutting behaviour is declared once, as interceptors on the server, so
// a new RPC arrives with recovery, a request id, logging, auth and validation
// attached. The order is the design (NewServer in mux.go): RequestID
// outermost so every log line and every error carries the id, the panic
// Recover turns into CodeInternal included; Recover next; Logging outside
// auth so a refused request is still logged; validate innermost so a bad
// request never reaches a handler.
//
// A connect-go v2 server interceptor is one function that wraps the whole
// call: next(ctx, spec, stream) runs the rest of the chain and then the
// handler, which reads its request off the stream and writes its response to
// it. That one shape covers unary and streaming RPCs alike, so the first
// stream added to the contract arrives with all of this already attached;
// there is no streaming half to forget. What an interceptor sees of the
// request is the headers, through the call's CallInfo, and the procedure,
// through the Spec; the body is decompressed and unmarshalled later, by the
// generated handler, with stream.Receive inside next. An interceptor that
// needs the message itself (validate does) wraps the stream it passes on.
//
// The order holds under the whole-call wrapping, and two things follow from
// it. Auth runs before any body is decoded, so an anonymous request is
// refused without being decompressed or unmarshalled, and validate, which
// compiles and runs CEL, only ever sees a message from a known caller. And a
// body that does not decode fails inside next, so RequestID, Recover and
// Logging see that failure too.
//
// Only a *connect.Error built with connect.NewError or connect.Errorf sends
// its code and message to the client; any other error is a bare CodeUnknown on
// the wire and its text stays in the log. An interceptor that refuses a call
// builds one; one that observes an error passes it on as it is.

// Recover turns a panic in a handler into CodeInternal instead of a dead
// connection, and logs it with the request id.
func Recover(log *slog.Logger) connect.ServerInterceptor {
	return func(next connect.ServerFunc) connect.ServerFunc {
		return func(ctx context.Context, spec connect.Spec, stream connect.ServerStream) (err error) {
			defer func() {
				if r := recover(); r != nil {
					log.Error("rpc panicked", "rpc", spec.Procedure, "request_id", RequestIDFrom(ctx), "panic", r, "stack", string(debug.Stack()))
					err = connect.NewError(connect.CodeInternal, "internal error")
				}
			}()
			return next(ctx, spec, stream)
		}
	}
}

const requestIDHeader = "X-Request-ID" // the spelling canonicalheader wants; the wire is case-insensitive

type requestIDKey struct{}

// RequestID takes the caller's X-Request-ID or makes one, puts it on the
// context for the log lines and on the response headers for the caller, so
// one id names a request on both sides. The response headers go out with the
// first message or with the error, whichever comes first, so the id is set
// before next runs and a refusal carries it too.
func RequestID() connect.ServerInterceptor {
	return func(next connect.ServerFunc) connect.ServerFunc {
		return func(ctx context.Context, spec connect.Spec, stream connect.ServerStream) error {
			var in string
			info, ok := connect.CallInfoForServerContext(ctx)
			if ok {
				in = info.RequestHeader().Get(requestIDHeader)
			}
			ctx, id := withRequestID(ctx, in)
			if ok {
				info.ResponseHeader().Set(requestIDHeader, id)
			}
			return next(ctx, spec, stream)
		}
	}
}

// requestIDShape is what a caller's X-Request-ID may look like; anything
// else (too long, spaces, control characters that would end up in a log line
// or a header) is replaced by a fresh id.
var requestIDShape = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)

// withRequestID keeps the caller's id when it has the shape, mints one
// otherwise, and puts it on the context.
func withRequestID(ctx context.Context, id string) (context.Context, string) {
	if !requestIDShape.MatchString(id) {
		id = newRequestID()
	}
	return context.WithValue(ctx, requestIDKey{}, id), id
}

// RequestIDFrom reads the id RequestID put on the context; "" outside an RPC.
func RequestIDFrom(ctx context.Context) string {
	id, _ := ctx.Value(requestIDKey{}).(string)
	return id
}

func newRequestID() string {
	var b [8]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}

// Logging logs one line per RPC. Internal-class codes log as errors with the
// full chain (the cause behind a public message included); expected client
// failures log as warnings with the code only. The time it reports is the
// whole call, the request body's read included.
func Logging(log *slog.Logger) connect.ServerInterceptor {
	return func(next connect.ServerFunc) connect.ServerFunc {
		return func(ctx context.Context, spec connect.Spec, stream connect.ServerStream) error {
			start := time.Now()
			err := next(ctx, spec, stream)
			logRPC(ctx, log, spec.Procedure, start, err)
			return err
		}
	}
}

func logRPC(ctx context.Context, log *slog.Logger, procedure string, start time.Time, err error) {
	attrs := []any{"rpc", procedure, "request_id", RequestIDFrom(ctx), "ms", time.Since(start).Milliseconds()}
	if err == nil {
		log.Debug("rpc", attrs...)
		return
	}
	code := connect.CodeOf(err)
	attrs = append(attrs, "code", code.String())
	switch code {
	case connect.CodeInternal, connect.CodeUnknown, connect.CodeUnavailable, connect.CodeDataLoss:
		log.Error("rpc failed", append(attrs, "err", err, "cause", rootCause(err))...)
	default:
		log.Warn("rpc refused", attrs...)
	}
}

// rootCause is the innermost error in the chain: for an rpcerr.Internal from a
// store that is the driver's error, one Unwrap down from the *connect.Error
// (its local cause, which is never sent), and further for a cause that wraps
// another.
func rootCause(err error) error {
	for {
		next := errors.Unwrap(err)
		if next == nil {
			return err
		}
		err = next
	}
}
