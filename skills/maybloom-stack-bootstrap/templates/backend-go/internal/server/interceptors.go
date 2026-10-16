package server

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"log/slog"
	"time"

	"connectrpc.com/connect"
)

// Cross-cutting behaviour is declared once, as interceptors on the handler,
// so a new RPC arrives with recovery, a request id, logging, auth and
// validation attached. The order is the design (mux.go): Recover outermost,
// RequestID next so every log line carries it, Logging outside auth so a
// refused request is still logged, validate innermost so a bad request never
// reaches a handler.

// Recover turns a panic in a handler into CodeInternal instead of a dead
// connection, and logs it with the request id.
func Recover(log *slog.Logger) connect.UnaryInterceptorFunc {
	return func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (res connect.AnyResponse, err error) {
			defer func() {
				if r := recover(); r != nil {
					log.Error("rpc panicked", "rpc", req.Spec().Procedure, "request_id", RequestIDFrom(ctx), "panic", r)
					err = connect.NewError(connect.CodeInternal, errors.New("internal error"))
				}
			}()
			return next(ctx, req)
		}
	}
}

const requestIDHeader = "X-Request-Id"

type requestIDKey struct{}

// RequestID takes the caller's X-Request-Id or makes one, puts it on the
// context for the log lines and on the response (or the error) for the
// caller, so one id names a request on both sides.
func RequestID() connect.UnaryInterceptorFunc {
	return func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			id := req.Header().Get(requestIDHeader)
			if id == "" || len(id) > 64 {
				id = newRequestID()
			}
			ctx = context.WithValue(ctx, requestIDKey{}, id)
			res, err := next(ctx, req)
			if err != nil {
				if cerr, ok := errors.AsType[*connect.Error](err); ok {
					cerr.Meta().Set(requestIDHeader, id)
				}
				return nil, err
			}
			res.Header().Set(requestIDHeader, id)
			return res, nil
		}
	}
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
func Logging(log *slog.Logger) connect.UnaryInterceptorFunc {
	return func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			start := time.Now()
			res, err := next(ctx, req)
			attrs := []any{"rpc", req.Spec().Procedure, "request_id", RequestIDFrom(ctx), "ms", time.Since(start).Milliseconds()}
			if err == nil {
				log.Debug("rpc", attrs...)
				return res, nil
			}
			code := connect.CodeOf(err)
			attrs = append(attrs, "code", code.String())
			switch code {
			case connect.CodeInternal, connect.CodeUnknown, connect.CodeUnavailable, connect.CodeDataLoss:
				log.Error("rpc failed", append(attrs, "err", err, "cause", errors.Unwrap(err))...)
			default:
				log.Warn("rpc refused", attrs...)
			}
			return nil, err
		}
	}
}
