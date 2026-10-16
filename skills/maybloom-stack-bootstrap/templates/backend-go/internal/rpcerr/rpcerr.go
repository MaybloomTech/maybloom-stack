// Package rpcerr is the one shape for an error whose message the client may
// see while its cause stays in the log. connect-go sends err.Error() to the
// client, so a driver's or a provider's message must never be the error a
// layer returns; it is the cause behind a public message.
package rpcerr

import "connectrpc.com/connect"

// publicError is what connect-go puts on the wire (Error) with the cause kept
// behind it (Unwrap) for the logging interceptor, which logs the root of the
// chain.
type publicError struct {
	public string
	cause  error
}

func (e *publicError) Error() string { return e.public }
func (e *publicError) Unwrap() error { return e.cause }

// Internal is a CodeInternal whose message is public and whose cause is
// logged, never sent. Made per call: the RequestID interceptor writes into
// an error's Meta, so errors are never shared.
func Internal(public string, cause error) error {
	return connect.NewError(connect.CodeInternal, &publicError{public: public, cause: cause})
}
