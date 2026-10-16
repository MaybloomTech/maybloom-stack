// Package generate is the module root, which exists for one reason: `go
// generate .` is the single command that produces every generated package the
// build needs (the contract through buf, the data layer through sqlc). The
// README, the Dockerfile and CI all say only that. Outputs are gitignored; a
// fresh clone does not compile until this has run.
package generate

//go:generate go tool buf generate ../proto --template buf.gen.yaml
//go:generate go tool sqlc generate
