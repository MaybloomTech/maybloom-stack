# Gotchas

Sharp edges in the maybloom stack. Each entry has a *symptom*, a *cause*,
and a *fix* — only the precise version of the rule, never "always do X."

## Drizzle-kit's interactive rename prompt

**Symptom.** `pnpm --filter <ORG>/backend db:generate` hangs without
producing output. Or, if you're tailing logs, drizzle-kit prints a
question like:

```
Is column ... created or renamed from ...?
> + create column                    <-- default
  ~ rename column from ...
```

…and waits on stdin.

**Cause.** drizzle-kit can't disambiguate a column rename from a
drop+add. Same for tables and (sometimes) enum values. It prompts only
when the diff is ambiguous; clean adds and clean drops go through
silently.

**Fix.** When the generator hangs and you actually want the "create"
default (which is correct during dev where the DB gets reset), pipe a
stream of `\r` characters with small delays so each prompt receives a
keypress:

```bash
for i in $(seq 1 10); do printf '\r'; sleep 0.4; done | \
  pnpm --filter <ORG>/backend db:generate
```

If you want a rename, run `db:generate` interactively and answer by
hand. Don't pipe \r when there's a real rename you care about — the
defaults will do the wrong thing and you'll have to revert.

**When *not* to use this workaround.** Don't pipe \r on every
generation. Most schema diffs are clean adds and the prompt never
appears. Reaching for the workaround when generation succeeded silently
just means you're staring at output that's already done.

## Proto field number reuse vs `reserved`

**Symptom.** Two contradictory pieces of advice in the wild: "always
mark removed fields `reserved`" vs "renumber freely."

**Cause.** Both are correct depending on whether the proto has shipped
to clients you don't control.

**Fix in a pre-release project.** While the project has no deployed proto
consumers, **reuse removed field numbers, and do not add `reserved N;`
lines.** Nothing on the network can see a wire-format conflict, and a
growing list of reserved numbers in a schema that has never shipped is
noise that outlives its reason. Ask the project's owner which regime
applies before assuming; some prefer reserving from day one.

**Fix in a shipped project.** Once clients you do not control are on the
network, mark removed numbers `reserved`:

```proto
message Book {
  reserved 17;
  reserved "publisher_id";  // optional, by name
  // ... existing fields ...
  repeated BookAuthorLink author_links = 18;
}
```

Reserving prevents anyone from re-introducing the old field-id with a
new type, which would corrupt deserialization for old clients.

**Bottom line.** Match the policy to whether wire-format consumers exist
outside your control. Pre-release: reuse. Once it ships: reserve.

## (Not a gotcha) "Always use `pnpm exec biome lint packages`"

If you read this somewhere as a rule, it isn't one. The `pnpm lint:ts`
package script wraps the same `biome lint packages` invocation; both
work. Use the script. `pnpm exec biome ...` is just the direct call when
you want to skip the script indirection (e.g. passing extra biome flags)
— it's a "how to" tip, not a gotcha.

## A `SameSite=Strict` cookie and a dev server on another origin

**Symptom.** From the Expo dev server (`localhost:8081`) against a
deployed backend, sign-in works and reads work, then after one
access-token lifetime everything is `Unauthenticated`, and a reload
comes back signed out. The same client against a local docker stack
is fine.

**Cause.** The session or refresh cookie is `SameSite=Strict`, which is
the correct production setting. `localhost:8081` to
`https://staging.example` is cross-site, and the browser neither sends
nor even stores a `Strict` cookie from a cross-site response. The local
stack hid it: `localhost:8081` to `localhost:8090` is same-site, because
ports do not count.

**Fix.** Prove the web session on the hosted build, on the API's origin;
that is the deploy rule in `docs/interface.md`. A dev CORS allow-list on
the backend covers reads and is not the session path. If a cross-origin
dev loop is essential, the cookie has to be `Lax` or the dev server has
to be proxied to be same-site; decide that knowingly. Native clients
carry the token in the request body and never meet this.

## The TypeScript proto output has dangling imports

**Symptom.** `tsc` in the interface fails on
`buf/validate/validate_pb` (or another imported module) that no
generated file provides, while the Go build is fine.

**Cause.** protoc-gen-es emits only the module named as input; the
contract imports protovalidate (or another dependency), and Go never
noticed because `protoc-gen-go` output imports protovalidate's published
Go module instead.

**Fix.** `include_imports: true` on the protoc-gen-es plugin block, not
`include_wkt` (the well-known types come from `@bufbuild/protobuf/wkt`).
Then make sure something compiles against the generated TypeScript on
every CI run; a generated target with no consumer is unverified.

## buf refuses an empty module

**Symptom.** The first `buf generate` on a fresh or freshly-emptied
contract fails rather than producing nothing.

**Cause.** A module with no proto files is an error, not a no-op.

**Fix.** Start the contract with one RPC (`Health` is the conventional
one); it is useful anyway for the version stamp and the readiness check.
