---
title: Contracts
description: The protobuf layer, Buf toolchain, and proto conventions
order: 2
---

# Contracts

The contract layer is the part of the stack that makes everything else
replaceable. Protos are the only hand-written source for types that cross a
process boundary; every language target is generated from them with
[Buf](https://buf.build). This layer is the stack's core: the other
documents describe validated implementations built around it, and every
one of them can be swapped in a way the contract cannot.

## Layout

Hand-written protos live at the repo root under `proto/<slug>/`, outside any
package, because more than one package consumes them:

```
proto/<slug>/
  common/v1/        shared value types (tags, windows) used by several resources
  resources/v1/     the domain nouns: one file per resource, messages only
  service/v1/       request/response envelopes + service.proto
```

- `resources/v1` holds data shapes with no RPCs. These are the types the
  database schema mirrors and the interface renders.
- `service/v1` holds one file of envelopes per resource, plus `service.proto`,
  which imports all of them and declares the service.
- `common/v1` stays small on purpose. A type moves here on its second
  consumer, never speculatively.

## The service rule

Each backend owns exactly one `service` block, named `<AppName>Service`, in
its own proto package. RPCs are grouped with comment headers inside that one
service rather than split across services, because both backends key their
exhaustiveness checks off a single service type: TypeScript types the
implementation map as `ServiceImpl<typeof AppService>`, and connect-go
generates one handler constructor per service.

When a second backend joins the repo, it gets a second service package (for
example `proto/<slug>/ingest/v1` with `IngestService`) and shares
`resources/v1` and `common/v1`. The unit of backend choice is the proto
service. See [Choosing a runtime](./choosing.md).

## Message conventions

- Every RPC has a dedicated `<Verb><Resource>Request` and
  `<Verb><Resource>Response`, including empty ones (`message
  DeleteNoteResponse {}`), so fields can be added later without a breaking
  change. `google.protobuf.Empty` is never used.
- Create and update requests carry the whole resource:
  `CreateNoteRequest { resources.v1.Note note = 1; }`. Clients read, modify,
  and write. Field masks arrive only when a real conflict problem demands
  them.
- Get requests take an id. List requests carry the paging trio and then
  a bag of `optional` filter scalars; list responses hold one `repeated`
  field and `next_page_token`.
- The standard resource tail is `created_by`, `created_at`,
  `optional updated_at`, `optional archived_at`. Archival is the norm,
  done through the resource's Update with `bool archived` (set keeps the
  first `archived_at`, clear brings the row back); hard delete is an
  explicit, per-resource decision for leaf data, and the only reason a
  `Delete<Resource>` RPC exists.
- Timestamps are `google.protobuf.Timestamp`. Seconds-since-epoch integers
  and floats are forbidden; they are the single worst fossil observed in
  ported systems.
- `optional` on a scalar means presence matters. The adapter normalizes the
  empty-string/NULL boundary in one place. Plain `string` maps to a
  `NOT NULL` column; `optional string` maps to a nullable one.
- Enums start at `<NAME>_UNSPECIFIED = 0`, values carry the enum-name prefix,
  and database enums are generated from the proto enum names so the two can
  never drift.
- Cross-resource links get dedicated link messages (`BookAuthorLink`)
  instead of embedded resources.
- Comments on fields are load-bearing documentation. Rules like "populated on
  read, ignored on write" live next to the field they govern.
- Keys are surrogate ids. A REST URL that addressed a resource by a unique
  name does not make the name the contract's key; the id is rename-stable,
  and the name rides along as a read-only display field.
- A derived read-only field's home is decided by whom it describes. A flag
  about the caller (`viewer_may_edit`) goes on the response envelope; a
  flag about a member of the resource (`has_access` on a linked person)
  stays on the resource as output-only.
- List requests page by cursor from the first version: `page_size`
  (validated, 0 for the default), an opaque `page_token`, and
  `next_page_token` on the answer, empty on the last page; no offset and
  no total. The token is the keyset of the last row (`created_at, id`),
  so an insert between two pages cannot shift the rest. For time-ordered
  data add a window. An empty list request that reads a whole table is
  cheap to fix before a client exists and expensive after.
- Calendar dates are `YYYY-MM-DD` strings and today is the client's to
  supply; the server has no time zone to resolve a day in.

## Validation in the contract

**protovalidate constraints** (`buf.validate` field options) are the input
validation, and the contract is where they live. The Go path enforces them
in an interceptor, so handlers check nothing; the TypeScript path can with
`@bufbuild/protovalidate`, and until it does its stores check presence.
Constraints distribute by message role: always-valid invariants (lengths,
enum membership) on the resource, presence on the request envelopes (ids
`uuid`, `page_size` bounded), and a message-typed request field the handler
dereferences marked `required`, because that is the only nil guard once
handlers stop checking.

`option idempotency_level = NO_SIDE_EFFECTS` is not used (dropped
2026-10-15). It was a read marker for an audit interceptor, inherited from
the first Go service; it also makes an RPC GET-able and cacheable by any
intermediary, a second meaning the marker's users did not want. Audit is
opt-in per service, with the interceptor keeping its own list of what it
records.

## Field number policy

A removed field's number and name are `reserved`, from the first commit
(decided 2026-10-15). The earlier rule reused numbers until the first
build a non-developer installed; the moment is easy to miss and the cost
of missing it is corrupted deserialization on clients already on the
network, so the rule is now one rule. Add `buf breaking --against` the
default branch to CI once clients you do not control exist.

## Codegen

`buf.yaml` declares two modules: `proto/`, and `third_party/protovalidate`,
which vendors `buf/validate/validate.proto` as a lint-ignored module so
the constraints resolve with no registry dependency, in CI and in the Go
image build alike. Each language target gets a plugin block, and the
validated shape is one template per toolchain:

```yaml
# buf.gen.yaml at the repo root: the TypeScript target, run by pnpm
version: v2
plugins:
  - local: node_modules/.bin/protoc-gen-es
    out: packages/protocol-buffers/src
    include_imports: true          # emit the modules the contract imports (protovalidate)
    opt: [target=ts]
```

```yaml
# go/buf.gen.yaml: the Go targets, run from go/ as `go tool buf generate ../proto --template buf.gen.yaml`
version: v2
plugins:
  - local: ["go", "tool", "protoc-gen-go"]
    out: gen
    opt: paths=source_relative
  - local: ["go", "tool", "protoc-gen-connect-go"]
    out: gen
    opt: paths=source_relative
```

A third target, `protoc-gen-connect-openapi` as another local plugin in
the Go template, produces an OpenAPI document for readers who will never
open a proto; the scaffolded docs site answers the same need by rendering
the descriptor set. Either is optional.

The split is what lets the Go image build with no JavaScript toolchain and
the TypeScript package generate with no Go on a pure-frontend machine.
Every plugin is a local, pinned binary (`go tool` in `go.mod`, pnpm for
protoc-gen-es), so generation makes no network call; `remote:` plugins on
the Buf Schema Registry work too and cost egress on every build.

Every proto file carries an explicit `go_package` option of the form
`github.com/<org>/<repo>/go/gen/<slug>/service/v1;servicev1`, and
`paths=source_relative` makes the Go output mirror the proto directory
under `go/gen/`.

Two lint facts to know before the first `buf lint`: the standard rules
require every RPC's request and response to be unique types, so a shared
empty message is refused (each empty response is its own named message,
which is what the conventions above want anyway); and buf refuses to
generate an empty module, so a fresh contract starts with one RPC.

Two rules that keep codegen honest:

1. **Generated code is never committed.** The TypeScript package gitignores
   its `src/`, the Go module gitignores `gen/`. `pnpm proto:gen` (which runs
   `buf generate --clean`) is wired into the root `postinstall`, and CI runs
   the identical command. There is no "did you regenerate?" review comment in
   this stack.
2. **`buf lint` gates every proto change.** The standard category, no
   exceptions accumulated.

## Consuming generated types

- TypeScript consumers deep-import through the package export map:
  `@<org>/protocol-buffers/<slug>/service/v1/service_pb`.
- Go consumers import `<module>/gen/<slug>/resources/v1` and the generated
  `<module>/gen/<slug>/service/v1/servicev1connect` handler package.
- TypeScript consumers never re-export the generated tree through a barrel
  file: Metro does not tree-shake, and a barrel over the contract drags
  every message into every bundle. Deep imports only.
- The interface uses the same generated schema objects for
  `create(<Message>Schema, {...})` construction that the backend uses for
  responses. One contract, one construction idiom, every language.
