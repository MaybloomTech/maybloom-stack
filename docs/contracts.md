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
- Get requests take an id. List requests are a bag of `optional` filter
  scalars; list responses hold one `repeated` field.
- The standard resource tail is `created_by`, `created_at`,
  `optional updated_at`, `optional archived_at`. Archival is the norm;
  hard delete is an explicit, per-resource decision.
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

## Field number policy

While a project is pre-launch, removed field numbers are reused and
`reserved` is unnecessary; the wire never leaves the building. The moment a
project has shipped clients you cannot atomically upgrade, removed numbers
become `reserved N;` permanently. Write the switch date down when it happens.

## Codegen

`buf.yaml` declares the module and its deps (googleapis for well-known
types). `buf.gen.yaml` declares one plugin block per language target:

```yaml
version: v2
plugins:
  # TypeScript: types + service shapes for backend and interface
  - local: node_modules/.bin/protoc-gen-es
    out: packages/protocol-buffers/src
    opt: [target=ts]
  # Go: messages + connect-go service scaffolding (when a Go service exists)
  - remote: buf.build/protocolbuffers/go
    out: go/gen
    opt: [paths=source_relative]
  - remote: buf.build/connectrpc/go
    out: go/gen
    opt: [paths=source_relative]
```

Every proto file carries an explicit `go_package` option pointing into
`go/gen/proto/...`, so Go output lands inside the Go module.

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
- Go consumers import `go/gen/proto/<slug>/resources/v1` and the generated
  `<pkg>connect` handler package.
- The interface uses the same generated schema objects for
  `create(<Message>Schema, {...})` construction that the backend uses for
  responses. One contract, one construction idiom, every language.
