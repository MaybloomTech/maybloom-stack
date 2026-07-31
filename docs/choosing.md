---
title: Choosing a runtime
description: When Fastify, when Go, when Astro
order: 7
---

# Choosing a runtime

The stack has three places code can run, and the choice is usually obvious
once the workload is named honestly. Start from the first question that
applies.

## The short version

| Workload | Runtime |
|---|---|
| Public content known at build time | Astro site |
| Product CRUD the interface talks to | TypeScript backend (Fastify) |
| Daemons, ingestion, concurrency, constrained hardware | Go backend |

## Astro: is it content?

If every visitor sees the same thing and the content changes when someone
commits, it is a site. Marketing pages, documentation, writing, a public
face for the product. Sites build to static files, deploy as nginx
containers, and cost nearly nothing to run or to keep secure.

The boundary is sharp on purpose: the moment a page wants per-user state,
auth, or live data, it stops being a site. Resist the temptation to sprinkle
API calls into a site; that need is the signal a backend service and an
interface screen exist for.

## Fastify: is it the product?

The TypeScript backend is the default for application logic, and the word
default is doing real work: choose it unless a specific pressure pushes to
Go. What it buys:

- **One language across the whole loop.** The person editing a store, a
  handler, and the screen that calls it stays in TypeScript, with the
  contract generating both ends.
- **The best dev database in the business.** PGlite gives a real Postgres
  embedded in-process: clone, install, run. No other runtime matches this
  today.
- **Iteration speed.** tsx watch, one process, seeded dev data, and a
  type error anywhere in the pipeline stops the build.

CRUD over Postgres, session auth, media upload, scheduled reminders, the
occasional fan-out: all of this is comfortably inside Fastify's envelope on
a single box.

## Go: does the runtime matter?

Choose Go when the workload's shape, rather than its logic, is the hard
part. Concrete signals, any one of which is sufficient:

- **It runs forever and must sip resources.** Sensor ingestion polling a
  hardware API every minute, an MQTT consumer, a webhook receiver on the LAN.
  A static binary with a few dozen megabytes of RSS, deployed once and
  forgotten, is Go's home turf.
- **Concurrency is the feature.** Fanning out to many devices or APIs at
  once, streaming aggregation, backpressure. Goroutines and errgroup model
  this more directly than a Node event loop.
- **The hardware is small.** A service destined for a Pi or a
  low-power box benefits from Go's footprint and instant start.
- **The service is being ported from Go.** An existing Go system joining
  the stack keeps its language and adopts the contract, the layer
  discipline, and the tooling.
- **Deploy simplicity is worth more than iteration speed.** One
  self-contained binary with embedded migrations, no node_modules, no
  runtime image beyond a base layer.

The costs, stated plainly: a second toolchain in the repo, a second set of
idioms to hold, and a dev database story (embedded-postgres) that is good
rather than magical. A team of two should pay these costs for a workload
that earns them, and the moment it does, the contract makes the payment
small.

## The rule that makes the choice cheap

**One proto service package, one backend.** The interface never knows which
language serves a call; it holds a generated client per service, and the
transport is identical. This means:

- Backend choice is per-service, made at the boundary of a bounded context
  (the app service, an ingest service, a reports service), never per-RPC.
- A service can be rewritten in the other language RPC-by-RPC behind its
  unchanged contract, with the old and new implementations run side by side
  during the swap.
- Adding a Go service to a TypeScript repo (or the reverse) touches
  `buf.gen.yaml`, the new service's directory, and the compose file.
  Nothing else moves.

## Signals the choice was wrong

- An Astro site is fetching from a backend at runtime: promote that page to
  the interface, or accept it is an app.
- A Fastify service spends its life in `Promise.all` batches babysitting
  CPU-bound or fan-out work, or its container restarts for memory: that
  service is asking to be Go.
- A Go service is churning weekly with product CRUD changes that mirror
  interface work item-for-item: it is paying Go's iteration cost for a
  Fastify-shaped job.
- Anything is being built "in both languages to compare": the contract
  already guarantees the swap is possible later; build it once, in the
  default.

## Open paths

The runtimes above are the validated paths — documented because they have
been built and run for real. They are not the boundary of the stack. The
core travels further: Connect has official implementations for Go,
TypeScript/JavaScript, Swift, and Kotlin, with more maturing, and a
Connect server also speaks gRPC and gRPC-Web, so any language with gRPC
support can join the contract. A SwiftUI client, a Kotlin service, a
Python worker — each consumes the same protos and looks, to the rest of
the system, exactly like a validated implementation.

Choosing an open path means carrying the core and writing the blueprint
as you go: the contract rules from [Contracts](./contracts.md), the layer
vocabulary (a thin transport seam, business logic behind it, pure
translation between wire shapes and stored shapes), and generated edges
that are never committed. The skills support this explicitly — on an
implementation these docs don't blueprint, they fall back to a
language-neutral core reference and take the project's existing code as
the exemplar to imitate.

A path stops being open the day it has been walked far enough to
document; that is how the stack grows. The Go backend is partway through
that passage — blueprinted from study, awaiting its first production
service — and the next path will enter the same way.
