# Proto layer

Three files. Two new, one edit.

## 1. `proto/<APP_SLUG>/resources/v1/<resources>.proto`

The data model. One `message` for the resource itself; enums next to it if
the resource has any. Field IDs are stable contracts — once shipped to real
clients, never reuse a number.

```proto
syntax = "proto3";

package <APP_SLUG>.resources.v1;

import "google/protobuf/timestamp.proto";

message <Resource> {
  string id = 1;
  string title = 2;
  // ...your fields here, numbered sequentially...
  string created_by = 5;
  google.protobuf.Timestamp created_at = 6;
  optional google.protobuf.Timestamp updated_at = 7;
}
```

Conventions to follow:

- IDs are `string` (UUIDs at the store layer).
- `created_at` is non-optional. `updated_at` is `optional` so newly created
  rows can omit it.
- `created_by` is `string` (a user ID); in handlers, the session user is
  forced onto it for create flows.
- For enums, use the `<NAME>_UNSPECIFIED = 0;` convention so the default
  value is meaningful.

For deeper proto authoring rules — field-number reuse policy, oneof +
TypeScript narrowing, empty-string-vs-NULL semantics, and the
one-service-per-project rule — see
`../../maybloom-stack-shared/references/proto-conventions.md`.

## 2. `proto/<APP_SLUG>/service/v1/<resources>.proto`

Request/response message pairs for each RPC. One pair per method.

```proto
syntax = "proto3";

package <APP_SLUG>.service.v1;

import "<APP_SLUG>/resources/v1/<resources>.proto";

message Create<Resource>Request {
  <APP_SLUG>.resources.v1.<Resource> <resource> = 1;
}
message Create<Resource>Response {
  <APP_SLUG>.resources.v1.<Resource> <resource> = 1;
}

message Get<Resource>Request {
  string id = 1;
}
message Get<Resource>Response {
  <APP_SLUG>.resources.v1.<Resource> <resource> = 1;
}

message List<Resources>Request {
  // Add filters here as needed; keep them all optional.
}
message List<Resources>Response {
  repeated <APP_SLUG>.resources.v1.<Resource> <resources> = 1;
}

message Update<Resource>Request {
  <APP_SLUG>.resources.v1.<Resource> <resource> = 1;
}
message Update<Resource>Response {
  <APP_SLUG>.resources.v1.<Resource> <resource> = 1;
}

message Delete<Resource>Request {
  string id = 1;
}
message Delete<Resource>Response {}
```

Empty messages (`{}`) are fine for Delete responses. Don't invent fields
you don't need yet.

## 3. Edit `proto/<APP_SLUG>/service/v1/service.proto`

Add an import and five `rpc` lines:

```proto
import "<APP_SLUG>/service/v1/<resources>.proto";

service <APP_NAME>Service {
  // ... existing rpc lines ...

  rpc Create<Resource>(Create<Resource>Request) returns (Create<Resource>Response);
  rpc Update<Resource>(Update<Resource>Request) returns (Update<Resource>Response);
  rpc Get<Resource>(Get<Resource>Request) returns (Get<Resource>Response);
  rpc List<Resources>(List<Resources>Request) returns (List<Resources>Response);
  rpc Delete<Resource>(Delete<Resource>Request) returns (Delete<Resource>Response);
}
```

## Regenerate

```bash
pnpm proto:gen
```

This runs `buf generate --clean` and overwrites
`packages/protocol-buffers/src/<APP_SLUG>/...`. Never edit those files by
hand.

After this, `import { <Resource>Schema, type <Resource> } from
"<ORG_SCOPE>/protocol-buffers/<APP_SLUG>/resources/v1/<resources>_pb"`
should resolve. If it doesn't, the regen failed silently — check the buf
output and the catalog versions.
