---
title: Prior art
description: How the maybloom stack compares to what exists
order: 11
---

# Prior art

Researched July 2026. The individual pieces of the stack are mainstream and
well-documented; the combination appears to be genuinely uncommon. Searches
for starters or templates combining Connect-RPC protobuf contracts, a Go or
Node backend, and an Expo client in one monorepo found no established
project. What exists nearby, and how the stack differs:

## create-t3-turbo (tRPC)

The dominant "shared types + Expo" monorepo template: Next.js, tRPC v11,
Drizzle, Expo. Its contract is implicit in TypeScript server code, which
gives a superb single-language experience and a hard wall the moment a
second language enters. The maybloom stack pays a small ceremony cost
(protos, codegen) to keep the contract language-neutral, which is exactly
the property that makes the Go blueprint a peer of the TypeScript one
rather than a rewrite.

## Encore.go / Encore.ts

The closest philosophical neighbor: type-safe contracts with generated
clients and a Go-first backend. Encore derives the contract from Go source
and couples the project to its framework and cloud tooling in exchange for
a considerable amount of generated infrastructure. The maybloom stack keeps
the contract in neutral proto files, uses plain `net/http` and Fastify, and
owns its deploy story. Encore optimizes for teams adopting a platform; this
stack optimizes for a system one team intends to keep for decades.

## gRPC-web stacks

The previous generation of this idea: gRPC services behind an Envoy
translation proxy, with grpc-web clients. Connect-RPC is the direct
replacement (same protobuf contracts, no proxy, plain HTTP semantics), and
connect-go serves gRPC, gRPC-Web, and Connect simultaneously if
interoperability is ever needed.

## What is distinctive, summarized

1. **Schema-first across languages, at hobby-team scale.** Protobuf
   contracts with generated TypeScript and Go edges are an
   enterprise-common pattern; packaging them with an Expo interface, an
   embedded dev database, and a two-person workflow is not.
2. **Two blessed backends, one contract.** The stack treats backend
   language as a per-service decision behind a stable boundary, with a
   written decision guide, rather than an identity.
3. **Distribution as agent skills.** The stack ships as executable
   documentation for coding agents, with the compiler as the verification
   step. No surveyed stack does this.
4. **Single-box honesty.** The blueprints say "this assumes one instance"
   in every place that assumption is load-bearing, which is rarer in
   published stacks than it should be.
