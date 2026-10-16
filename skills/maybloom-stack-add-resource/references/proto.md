# Proto layer

Three files. Two new, one edit.

## 1. `proto/<APP_SLUG>/resources/v1/<resources>.proto`

The data model. One `message` for the resource itself; enums next to it if
the resource has any. Field numbers are stable contracts: a removed number
is marked `reserved`, never reused.

```proto
syntax = "proto3";

package <APP_SLUG>.resources.v1;

import "buf/validate/validate.proto";
import "google/protobuf/timestamp.proto";

option go_package = "<GO_MODULE>/gen/<APP_SLUG>/resources/v1;resourcesv1";

message <Resource> {
  string id = 1;
  string title = 2 [(buf.validate.field).string = {
    min_len: 1
    max_len: 200
  }];
  // ...your fields here, numbered sequentially...
  string created_by = 5;
  google.protobuf.Timestamp created_at = 6;
  optional google.protobuf.Timestamp updated_at = 7;
  // Only if this resource archives (see below): set by Archive<Resource>.
  optional google.protobuf.Timestamp archived_at = 8;
}
```

Conventions to follow:

- IDs are `string` (UUIDs; the database assigns them on the Go path).
- `created_at` is non-optional. `updated_at` (and `archived_at`, when the
  resource archives) are `optional` so newly created rows can omit them.
- `created_by` is `string` (a user ID); in handlers, the session user is
  forced onto it for create flows.
- Always-valid invariants (lengths, enum membership) go here as
  `buf.validate` rules; presence rules go on the request envelopes.
- For enums, use the `<NAME>_UNSPECIFIED = 0;` convention so the default
  value is meaningful.
- Copy the `go_package` option from a neighbouring file; every proto
  carries one.

For deeper proto authoring rules — field-number reuse policy, oneof +
TypeScript narrowing, empty-string-vs-NULL semantics, and the
one-service-per-project rule — see
`../../maybloom-stack-shared/references/proto-conventions.md`.

## 2. `proto/<APP_SLUG>/service/v1/<resources>.proto`

Request/response message pairs for each RPC. One pair per method.

```proto
syntax = "proto3";

package <APP_SLUG>.service.v1;

import "buf/validate/validate.proto";
import "<APP_SLUG>/resources/v1/<resources>.proto";

option go_package = "<GO_MODULE>/gen/<APP_SLUG>/service/v1;servicev1";

message Create<Resource>Request {
  // required: the handler dereferences it; the validate interceptor is the
  // only nil guard.
  <APP_SLUG>.resources.v1.<Resource> <resource> = 1 [(buf.validate.field).required = true];
}
message Create<Resource>Response {
  <APP_SLUG>.resources.v1.<Resource> <resource> = 1;
}

message Get<Resource>Request {
  string id = 1 [(buf.validate.field).string.uuid = true];
}
message Get<Resource>Response {
  <APP_SLUG>.resources.v1.<Resource> <resource> = 1;
}

// Cursor-paged, newest first.
message List<Resources>Request {
  // At most this many; 0 means the default (50), 200 is the most.
  int32 page_size = 1 [(buf.validate.field).int32 = {
    gte: 0
    lte: 200
  }];
  // From the previous answer's next_page_token; empty starts at the top.
  string page_token = 2;
  // Only if this resource archives.
  bool include_archived = 3;
  // Add filters after these as needed; keep them all optional.
}
message List<Resources>Response {
  repeated <APP_SLUG>.resources.v1.<Resource> <resources> = 1;
  // Empty when this was the last page.
  string next_page_token = 2;
}

// Replaces the mutable fields; the server keeps id, created_by, created_at
// and sets updated_at. The CEL rule is the uuid check on the embedded id.
message Update<Resource>Request {
  <APP_SLUG>.resources.v1.<Resource> <resource> = 1 [
    (buf.validate.field).required = true,
    (buf.validate.field).cel = {
      id: "<resource>.id.uuid"
      message: "<resource>.id must be a uuid"
      expression: "this.id.matches('^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')"
    }
  ];
}
message Update<Resource>Response {
  <APP_SLUG>.resources.v1.<Resource> <resource> = 1;
}
```

Then the fifth pair, the resource's own answer to how it leaves the
default view. How a resource leaves the default view is the app's decision, not the
stack's. Ask it when the resource arrives: what should happen to the
resource, and to the rows that point at it? Some common answers, as
illustrations only: a hard `Delete<Resource>` RPC that removes the row
(leaf data nothing references); a soft delete, a `deleted_at` the reads
filter on, with no way back; archive as a first-class state through a
dedicated verb RPC (`Archive<Resource>(id)` sets `archived_at`, `List`
takes `include_archived`, and `Unarchive<Resource>` mirrors it when a
screen needs it). The list is not exhaustive and an app may do otherwise.
What the stack asks is that the answer be its own RPC with its rule in its
comment, never a flag on `Update`. The Note example gives one answer,
`ArchiveNote`.

Two of the answers, as they look in a contract. An archive, the Note
example's:

```proto
// Sets archived_at (kept if already set); the row and its id stay, and
// List leaves it out unless include_archived is set. Errors: CodeNotFound.
message Archive<Resource>Request {
  string id = 1 [(buf.validate.field).string.uuid = true];
}
message Archive<Resource>Response {
  <APP_SLUG>.resources.v1.<Resource> <resource> = 1;
}
```

A hard delete, for leaf data nothing references, named as such:

```proto
// Removes the row. <Resource> is leaf data: nothing references it.
message Delete<Resource>Request {
  string id = 1 [(buf.validate.field).string.uuid = true];
}
message Delete<Resource>Response {}
```

Named empty messages (`{}`) are fine for responses with nothing to say.
Don't invent fields you don't need yet.

## 3. Edit `proto/<APP_SLUG>/service/v1/service.proto`

Add an import and five `rpc` lines under a comment header for the
resource (the four CRUD ones and the resource's verb):

```proto
import "<APP_SLUG>/service/v1/<resources>.proto";

service <APP_NAME>Service {
  // ... existing rpc lines ...

  // <Resources>
  rpc Create<Resource>(Create<Resource>Request) returns (Create<Resource>Response);
  rpc Get<Resource>(Get<Resource>Request) returns (Get<Resource>Response);
  rpc List<Resources>(List<Resources>Request) returns (List<Resources>Response);
  rpc Update<Resource>(Update<Resource>Request) returns (Update<Resource>Response);
}
```

## Regenerate

```bash
pnpm proto:gen
```

This runs `buf generate --clean proto` and overwrites
`packages/protocol-buffers/src/<APP_SLUG>/...`. On the Go path, `go
generate .` in `go/` does the same for `go/gen/`. Never edit those files
by hand.

After this, `import { <Resource>Schema, type <Resource> } from
"<ORG_SCOPE>/protocol-buffers/<APP_SLUG>/resources/v1/<resources>_pb"`
should resolve. If it doesn't, the regen failed silently — check the buf
output and the catalog versions.
