// Package rpcerr is the one shape for an error whose message the client may
// see while its cause stays in the log. connect-go v2 sends the message of a
// *connect.Error you create (connect.NewError, connect.Errorf) and nothing
// of any other error: a driver's or a provider's error that a layer returns
// as it is reaches the client as a bare CodeUnknown, and its text stays
// local. So a refusal the client should understand is always built with
// connect.NewError, and the cause, when there is one, rides on it with
// WithCause: logged, never sent.
package rpcerr

import "connectrpc.com/connect/v2"

// Internal is a CodeInternal whose message is public and whose cause is
// logged, never sent: connect-go serializes the code and the message, and
// WithCause attaches the error behind it for errors.Is, errors.As and the
// logging interceptor, which logs the root of the chain. Made per call, so
// an error is never shared between two requests.
func Internal(public string, cause error) error {
	return connect.NewError(connect.CodeInternal, public).WithCause(cause)
}
