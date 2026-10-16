// Package version holds the build stamp. go/Dockerfile sets it with
// -ldflags "-X .../internal/version.Version=<git short sha>"; a plain
// `go build` leaves "dev". The Health RPC reports it.
package version

var Version = "dev"
