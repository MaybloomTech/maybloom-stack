# Go-first scaffold and the contract templates

**Date**: 2026-10-15
**Status**: In progress
**Card(s)**: STACK-1 (Go-first bootstrap as a real scaffold), STACK-6 (contract templates and conventions). Parent: STACK-5. Blocks ESP-2.

## Why

`maybloom-stack-bootstrap` generated the Fastify backend and
`maybloom-stack-bootstrap-go` was prose only. The app deleted its
TypeScript backend on 2026-09-24 and has run on Go since; the plugin's
templates still contradicted its own references (googleapis in `buf.yaml`,
no vendored protovalidate, no Health RPC, no `go_package`, offset-free
unbounded lists, hard deletes). This change makes the templates say what
the app settled, in one PR, because the Go scaffold and the contract it
serves are generated together.

## Decisions

Quoted from STACK-5 (Miguel, 2026-10-15), with what each one became here:

- "Go-first scaffold; Fastify stays as the documented alternative path."
  `scaffold.py --backend go` is the default; `--backend typescript` keeps
  the Fastify path working from the same contract.
- "Templates reflect what has been working in the app (contract, backend
  layout, interface structure: keep what works)." The `go/` templates are
  the app's module shape with the Note example in place of its resources;
  where the plugin's prose and the app disagreed, the app won.
- "Interceptor order: Recover -> RequestID -> Logging -> auth -> validate.
  Logging outside auth so rejected requests are logged; RequestID
  outermost after Recover so every line carries it; audit is opt-in."
  That is `internal/server/mux.go` in the template.
- "NO_SIDE_EFFECTS: dropped from the conventions." Removed from every
  template, skill and document.
- "Paging: cursor-based (page_size, opaque page_token, next_page_token; no
  total_size)." `ListNotes` is keyset-paged on `(created_at, id)`.
- "Delete: soft delete (archived_at, row kept) is the default; a hard
  Delete RPC is the option for leaf data." Archiving is `UpdateNote` with
  `archived: true`; the scaffold ships no `DeleteNote`, and add-resource
  documents hard Delete as the leaf-data option.
- "Contract docs site: kept in the scaffold, opt-out." Unchanged.
- "Deploy: the stack carries the shape (Dockerfile, ...), never the site."
  `go/Dockerfile` is the app's; registry and compose stay out (STACK-11).
- "SSO/Authelia: outside the skill." The scaffold ships an `Authenticator`
  seam with a development implementation (`DEV_USER`) and refuses to boot
  in production until a real one is wired.

Confirmed by Miguel on the proposal (2026-10-15): archive through Update
with no Delete RPC in the scaffold; removed field numbers are always
`reserved`; `go.mod` pins the app's versions as a floor and `go.sum` is
shipped; the gating auth interceptor with `DEV_USER`; `common/v1` ships
empty with a `.gitkeep`.

## Shape

See `skills/maybloom-stack-bootstrap/SKILL.md` for the tree. In short:
`templates/root/` is shared, `templates/root-go/` and
`templates/root-typescript/` hold the files that differ per backend
(`package.json`, `CLAUDE.md`, the Go wrappers), `templates/backend-go/`
lands at `go/`, `templates/backend-typescript/` at `packages/backend/`,
and `templates/third_party/` vendors `buf/validate/validate.proto`.

## Chores this creates

- **Per release: refresh `templates/backend-go/go.sum`.** Scaffold a
  throwaway project, run `go get -u ./...` (or raise the pins by hand) and
  `go mod tidy` in its `go/`, confirm `go generate . && go build ./... &&
  go test ./...`, and copy `go.mod`'s versions and `go.sum` back into the
  templates. The post-scaffold checklist runs `go mod tidy` so a stale
  floor costs a download, not a broken build.
- The pnpm catalog refresh (step 1 of the bootstrap checklist) is the same
  chore for the TypeScript side and already exists.

## Verification

Recorded in the PR. The Go path through the scaffold's own `scripts/go`
(the Go toolchain in the pinned alpine image, since the machine has no Go
installed) against a Postgres 17 container: `pnpm install`, `buf
generate`, `go generate .`, `go build`, `go vet`, `go test`, boot, and the
Note loop over Connect (create, list, get, update, archive). The
TypeScript path once, to prove the flag. `-race` is not run here: the
alpine image has no cgo. It runs in CI, which STACK-7 scaffolds.

## Left to other cards

CI and the commits action (STACK-7); the design board (STACK-8); the
interface's Backend context, feature folders and tests (STACK-9: the Note
screen changed only where the contract forced it and still uses React
Query); domain packages, oapi-codegen, jobs, secrets, data migrations,
`.dockerignore` and the rest of the Go guidance (STACK-10); the push
script and production compose example (STACK-11); AGENTS.md and the agent
setup (STACK-12).
