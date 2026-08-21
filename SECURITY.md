# Security

## Reporting a vulnerability

Two private channels, both reaching the same person:

- **GitHub** — open the **Security** tab on this repository and choose
  **Report a vulnerability**. This opens a private advisory and is the
  better channel for anything with a patch attached, since the discussion
  and the fix stay together.
- **Email** — **hello@maybloom.tech**, if you would rather not use GitHub
  or do not have an account.

Please do not open a public issue for a suspected vulnerability. If you
are unsure whether something qualifies, report it privately and we will
say so.

Expect an acknowledgement within a week. This is a small project with one
maintainer, so that is a realistic figure rather than an aspirational one.

## What the attack surface actually is

This repository ships documents, agent skills, and a static site. Reading
that list is most of the security model, so it is worth being precise
about where the risk lives:

- **The skills generate code.** They instruct an agent to write backends,
  clients, and infrastructure into somebody else's repository. A skill
  that teaches an insecure default — a permissive CORS policy, a missing
  auth check, a credential written to a file that is not ignored — is a
  real vulnerability, because it reproduces itself into every project that
  runs it. This is the class we care most about.
- **The bootstrap templates ship defaults.** `docker-compose.yaml` uses
  `postgres`/`postgres` and the backend binds a development port. These
  are intentional local-development defaults, documented as such, and are
  not a finding. A template that leaks a secret into a committed file, or
  that ignores a file it should not, is.
- **The site is static.** It builds to files and is served by nginx with
  no server-side code and no runtime data. Findings here would be build
  supply-chain issues rather than application ones.
- **CI runs on untrusted input.** Pull request titles and commit messages
  from forks reach workflow steps. These are passed through environment
  variables rather than interpolated into shell, which is deliberate; a
  path where that is not true is a finding.

## Out of scope

The private system this stack was extracted from is not part of this
repository and is not in scope. Neither are vulnerabilities in upstream
dependencies that have already been published — report those upstream,
though we do want to hear if this repository pins an affected version.
