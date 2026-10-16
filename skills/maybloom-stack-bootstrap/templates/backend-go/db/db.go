// Package db embeds the goose migrations so the binary applies them on boot.
// It is its own package because //go:embed paths are package-relative and
// cannot reach up the tree. Policy: append-only, one logical change per
// file, schema statements only; seed data is a store function switched by
// config, never a migration.
package db

import "embed"

//go:embed migrations/*.sql
var Migrations embed.FS
