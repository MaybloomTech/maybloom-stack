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

	"connectrpc.com/connect"
)

// Cross-cutting behaviour is declared once, as interceptors on the handler,
// so a new RPC arrives with recovery, a request id, logging, auth and
// validation attached. The order is the design (mux.go): RequestID
// outermost so every log line and every error carries the id, the panic
// Recover turns into CodeInternal included; Recover next; Logging outside
// auth so a refused request is still logged; validate innermost so a bad
// request never reaches a handler.
//
// Every interceptor here is a full connect.Interceptor, not a
// UnaryInterceptorFunc: a UnaryInterceptorFunc is skipped for streaming RPCs,
// so the first stream added to the contract would arrive without recovery,
// a request id or a log line (and, in auth, unauthenticated). The server
// makes no outbound RPCs, so WrapStreamingClient is the identity everywhere.

// Recover turns a panic in a handler into CodeInternal instead of a dead
// connection, and logs it with the request id.
func Recover(log *slog.Logger) connect.Interceptor { return recoverInterceptor{log: log} }

type recoverInterceptor struct{ log *slog.Logger }

func (i recoverInterceptor) WrapUnary(next connect.UnaryFunc) connect.UnaryFunc {
	return func(ctx context.Context, req connect.AnyRequest) (res connect.AnyResponse, err error) {
		defer i.recover(ctx, req.Spec().Procedure, &err)
		return next(ctx, req)
	}
}

func (i recoverInterceptor) WrapStreamingHandler(next connect.StreamingHandlerFunc) connect.StreamingHandlerFunc {
	return func(ctx context.Context, conn connect.StreamingHandlerConn) (err error) {
		defer i.recover(ctx, conn.Spec().Procedure, &err)
		return next(ctx, conn)
	}
}

func (recoverInterceptor) WrapStreamingClient(next connect.StreamingClientFunc) connect.StreamingClientFunc {
	return next
}

// recover runs deferred: it swaps the panic for CodeInternal in *err.
func (i recoverInterceptor) recover(ctx context.Context, procedure string, err *error) {
	if r := recover(); r != nil {
		i.log.Error("rpc panicked", "rpc", procedure, "request_id", RequestIDFrom(ctx), "panic", r, "stack", string(debug.Stack()))
		*err = connect.NewError(connect.CodeInternal, errors.New("internal error"))
	}
}

const requestIDHeader = "X-Request-ID" // the spelling canonicalheader wants; the wire is case-insensitive

type requestIDKey struct{}

// RequestID takes the caller's X-Request-ID or makes one, puts it on the
// context for the log lines and on the response (or the error) for the
// caller, so one id names a request on both sides.
func RequestID() connect.Interceptor { return requestIDInterceptor{} }

type requestIDInterceptor struct{}

func (requestIDInterceptor) WrapUnary(next connect.UnaryFunc) connect.UnaryFunc {
	return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
		ctx, id := withRequestID(ctx, req.Header().Get(requestIDHeader))
		res, err := next(ctx, req)
		if err != nil {
			return nil, withRequestIDMeta(err, id)
		}
		res.Header().Set(requestIDHeader, id)
		return res, nil
	}
}

func (requestIDInterceptor) WrapStreamingHandler(next connect.StreamingHandlerFunc) connect.StreamingHandlerFunc {
	return func(ctx context.Context, conn connect.StreamingHandlerConn) error {
		ctx, id := withRequestID(ctx, conn.RequestHeader().Get(requestIDHeader))
		// Headers go out with the first message, so the id is set before next
		// runs; an error after that can only carry it in the error's Meta.
		conn.ResponseHeader().Set(requestIDHeader, id)
		if err := next(ctx, conn); err != nil {
			return withRequestIDMeta(err, id)
		}
		return nil
	}
}

func (requestIDInterceptor) WrapStreamingClient(next connect.StreamingClientFunc) connect.StreamingClientFunc {
	return next
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

// withRequestIDMeta puts the id on the error's Meta so the caller sees it on
// a refusal too. The Meta belongs to this one error: errors are made per call
// (see the store), never shared in a package variable, or two requests would
// write the same header map at once.
func withRequestIDMeta(err error, id string) error {
	if cerr, ok := errors.AsType[*connect.Error](err); ok {
		cerr.Meta().Set(requestIDHeader, id)
	}
	return err
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
// failures log as warnings with the code only.
func Logging(log *slog.Logger) connect.Interceptor { return loggingInterceptor{log: log} }

type loggingInterceptor struct{ log *slog.Logger }

func (i loggingInterceptor) WrapUnary(next connect.UnaryFunc) connect.UnaryFunc {
	return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
		start := time.Now()
		res, err := next(ctx, req)
		i.logRPC(ctx, req.Spec().Procedure, start, err)
		if err != nil {
			return nil, err
		}
		return res, nil
	}
}

func (i loggingInterceptor) WrapStreamingHandler(next connect.StreamingHandlerFunc) connect.StreamingHandlerFunc {
	return func(ctx context.Context, conn connect.StreamingHandlerConn) error {
		start := time.Now()
		err := next(ctx, conn)
		i.logRPC(ctx, conn.Spec().Procedure, start, err)
		return err
	}
}

func (loggingInterceptor) WrapStreamingClient(next connect.StreamingClientFunc) connect.StreamingClientFunc {
	return next
}

func (i loggingInterceptor) logRPC(ctx context.Context, procedure string, start time.Time, err error) {
	attrs := []any{"rpc", procedure, "request_id", RequestIDFrom(ctx), "ms", time.Since(start).Milliseconds()}
	if err == nil {
		i.log.Debug("rpc", attrs...)
		return
	}
	code := connect.CodeOf(err)
	attrs = append(attrs, "code", code.String())
	switch code {
	case connect.CodeInternal, connect.CodeUnknown, connect.CodeUnavailable, connect.CodeDataLoss:
		i.log.Error("rpc failed", append(attrs, "err", err, "cause", rootCause(err))...)
	default:
		i.log.Warn("rpc refused", attrs...)
	}
}

// rootCause is the innermost error in the chain: for an internalError from a
// store that is the driver's error, two Unwraps down (connect.Error, then the
// public-message wrapper), which is why one Unwrap is not enough.
func rootCause(err error) error {
	for {
		next := errors.Unwrap(err)
		if next == nil {
			return err
		}
		err = next
	}
}
