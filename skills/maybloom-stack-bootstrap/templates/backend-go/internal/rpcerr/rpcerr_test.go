package rpcerr

import (
	"errors"
	"sync"
	"testing"

	"connectrpc.com/connect/v2"
)

// The stack's docs lean on connect-go v2's errors being immutable: WithCause
// and WithDetail return a clone, so a sentinel kept in a package variable is
// safe to share and to attach a cause to per request. A connect-go upgrade
// that changed that would be a data race across requests; this fails first.
func TestWithCauseLeavesTheSentinelAlone(t *testing.T) {
	t.Parallel()
	sentinel := connect.NewError(connect.CodeNotFound, "note not found")

	var wg sync.WaitGroup
	for range 50 {
		wg.Go(func() {
			cause := errors.New("driver")
			err := sentinel.WithCause(cause).WithDetail(&connect.ErrorDetail{Type: "t"})
			if !errors.Is(err, cause) || len(err.Details()) != 1 {
				t.Error("the clone lost its cause or detail")
			}
		})
	}
	wg.Wait()

	if errors.Unwrap(sentinel) != nil || len(sentinel.Details()) != 0 {
		t.Fatal("WithCause or WithDetail changed the shared error")
	}
}

// Internal is a public message with a local cause: the client-visible parts
// are the code and the message, and the cause is still there for the log.
func TestInternalKeepsTheCauseLocal(t *testing.T) {
	t.Parallel()
	cause := errors.New("pq: password authentication failed")
	err := Internal("could not save", cause)

	cerr, ok := errors.AsType[*connect.Error](err)
	if !ok || cerr.Code() != connect.CodeInternal || cerr.Message() != "could not save" {
		t.Fatalf("want CodeInternal %q, got %v", "could not save", err)
	}
	if !errors.Is(err, cause) {
		t.Fatal("the cause should be reachable with errors.Is")
	}
}
