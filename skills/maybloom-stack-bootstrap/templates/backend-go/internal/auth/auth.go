// Package auth is the identity seam: who is calling, resolved once per RPC by
// the interceptor and read by handlers from the context. The scaffold ships
// one Authenticator, the development identity; a real one (an OIDC client
// behind the household's provider, bearer tokens the service mints) is the
// project's first auth decision and lives beside it here.
package auth

import (
	"context"
	"errors"
	"net/http"

	"connectrpc.com/connect"
)

// Identity is the caller. UserID is what stores write into created_by.
type Identity struct {
	UserID string
	Name   string
}

// Authenticator resolves the caller from the request headers. nil, nil means
// anonymous; an error means the check itself failed (CodeInternal), not that
// the caller is unknown.
type Authenticator interface {
	Authenticate(ctx context.Context, header http.Header) (*Identity, error)
}

// DevAuthenticator makes every request the named user. Development only; the
// config refuses it in production.
type DevAuthenticator struct {
	UserID string
}

func (d DevAuthenticator) Authenticate(context.Context, http.Header) (*Identity, error) {
	return &Identity{UserID: d.UserID, Name: d.UserID}, nil
}

type identityKey struct{}

// WithIdentity puts the caller on the context; the interceptor does this.
func WithIdentity(ctx context.Context, id *Identity) context.Context {
	return context.WithValue(ctx, identityKey{}, id)
}

// IdentityFrom reads the caller the interceptor put on the context; nil when
// the RPC was open and the caller anonymous.
func IdentityFrom(ctx context.Context) *Identity {
	id, _ := ctx.Value(identityKey{}).(*Identity)
	return id
}

// Interceptor gates: it resolves the caller on every RPC and rejects
// anonymous calls with CodeUnauthenticated, except for the procedures in
// open (the health check). The alternative shape, which populates and lets
// each handler assert, fits a service whose anonymous RPCs are a feature.
func Interceptor(a Authenticator, open ...string) connect.UnaryInterceptorFunc {
	openSet := make(map[string]bool, len(open))
	for _, p := range open {
		openSet[p] = true
	}
	return func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			id, err := a.Authenticate(ctx, req.Header())
			if err != nil {
				return nil, connect.NewError(connect.CodeInternal, err)
			}
			if id == nil && !openSet[req.Spec().Procedure] {
				return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("sign in first"))
			}
			if id != nil {
				ctx = WithIdentity(ctx, id)
			}
			return next(ctx, req)
		}
	}
}
