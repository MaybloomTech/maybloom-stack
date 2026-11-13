---
title: Status line
description: The two-line Claude Code status line, what it shows, how to install it and why the budget hook needs it
order: 13
---

# Status line

The stack's status line is one shell script that gives Claude Code a
two-line status bar: where you are, and how much of your usage and your
session budget is spent. It also writes the numbers it shows to a small
file per session, which the budget hook of a scaffolded project reads, so
the hook only works where the status line is installed. You install it
once per machine by asking for it in a session.

## What it shows

```
~/workspace/app | [main] | Fable 5.1
5h:31% (2h00m) | weekly:55% (2d07h33m) | fable:53% (4d08h39m) | ctx:12% | cache:4m50s
```

| Segment | What it shows |
|---|---|
| `~/workspace/app` | The working directory, with `$HOME` shortened to `~` |
| `[main]` | The git branch, when the directory is a checkout |
| `Fable 5.1` | The model's display name |
| `5h:31% (2h00m)` | Usage of the 5-hour window, and the time until it resets |
| `weekly:55% (2d07h33m)` | Usage of the 7-day window, and the time until it resets |
| `fable:53% (4d08h39m)` | The weekly cap that applies to one model only, labelled with that model's first word in lower case; an account without one shows no segment |
| `ctx:12%` | Context-window usage, judged against the session budget |
| `cache:4m50s` | The time left before the session's prompt cache goes cold; `cache:cold` once it has |

Each usage percentage is green under 50, yellow from 50 and red from 80.
`ctx:` is yellow from the session budget (30% unless you change it, see
[Running a loop](./running-a-loop.md#the-session-budget)) and red from 50.
The cache countdown is green, yellow under five minutes and red under
one.

The first two usage numbers come from the data Claude Code gives every
status-line command. The model-scoped one does not: the script reads it
from the same usage endpoint the `/usage` command reads, keeps the answer
for five minutes and refreshes it in a background process, so the status
line never waits on the network. If that cache is more than an hour old,
because refreshes keep failing, the segment is hidden rather than left
stale.

## What you need

- `bash`, `jq`, `curl` and `git`. Check with `command -v jq curl git`;
  install what is missing (`brew install jq`, `apt install jq`).
- Linux or macOS. On macOS the script reads your sign-in from the keychain
  item `Claude Code-credentials`; on Linux from
  `~/.claude/.credentials.json`. Sign in to Claude Code on that machine
  first.
- A signed-in claude.ai session for the usage segments. A session on an API
  key has no usage windows, so the `5h:` and `weekly:` segments do not
  appear; context and cache still do.
- Claude Code 2.1.251 or later for the `cache:` segment (see below).

## Install

Ask in any Claude Code session where the plugin is installed:

```
Install the status line.
```

The skill checks the dependencies, copies the script into place and sets
the `statusLine` key. If you already have a `statusline-command.sh`, it
shows you the difference and asks before it overwrites your edits. A
plugin cannot set a user's status line, which is why this is a copy plus
one settings key rather than part of the plugin install.

### What the install changes

- It copies `statusline.sh` from the plugin to
  `~/.claude/statusline-command.sh` and makes it executable. A stable path
  is used because the plugin's own folder changes with every update. If
  `CLAUDE_CONFIG_DIR` is set, that directory is used instead of
  `~/.claude`.
- It sets `statusLine` in `~/.claude/settings.json` to
  `{ "type": "command", "command": "bash ~/.claude/statusline-command.sh",
  "refreshInterval": 10 }`, keeping every other key. The file is written
  whole and renamed into place, so a failure leaves the old settings
  intact. `refreshInterval` re-runs the command every 10 seconds, so the
  cache countdown ticks while the session is idle.

Once installed, the script itself writes under `~/.cache/claude-statusline/`
(or `$XDG_CACHE_HOME/claude-statusline/`): `usage.json`, the cached usage
answer, and `sessions/<session_id>.json`, the numbers for each session.
Files in `sessions/` untouched for a week are deleted when the usage cache
refreshes. The token reaches `curl` through its standard input, never as
an argument, so it is not readable in the process list.

## Verify

Pipe a sample payload through the installed script. Run it twice, a few
seconds apart: the first run only starts the usage refresh, the second
prints the model-scoped segment.

```sh
CFG="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
echo '{"session_id":"statusline-check","model":{"display_name":"test"},"workspace":{"current_dir":"'"$PWD"'"},"context_window":{"used_percentage":12},"rate_limits":{"five_hour":{"used_percentage":31,"resets_at":'$(( $(date +%s) + 7200 ))'},"seven_day":{"used_percentage":55,"resets_at":'$(( $(date +%s) + 200000 ))'}},"prompt_cache":{"warm":true,"ttl":"5m","expires_at":'$(( $(date +%s) + 290 ))'}}' \
  | bash "$CFG/statusline-command.sh"
```

Expect two lines, the second ending in `ctx:12% | cache:4m50s`, with
`fable:NN% (...)` before `ctx:` on the second run. The script also writes
`~/.cache/claude-statusline/sessions/statusline-check.json` with
`"ctx_pct": 12`; delete it afterwards. A session that was already open may
need a restart to pick up the new command.

## Troubleshooting

- **No `5h:` or `weekly:` segment:** the data had no usage windows, which
  happens outside a signed-in claude.ai session. The rest of the second
  line (`ctx:`, `cache:`) still shows. Nothing to fix.
- **The model-scoped segment is missing and the others show:** the cache is
  stale or empty. Ask the script why; it runs the refresh in the
  foreground and prints `statusline:` lines on stderr:

  ```sh
  STATUSLINE_DEBUG=1 bash "$CFG/statusline-command.sh" < /dev/null
  ```

  The reasons it names are: no sign-in token on this machine, `HTTP 401`
  (the login expired; run `/login`), a `curl` exit code (network or DNS),
  `curl not found`, or a cache over an hour old. `usage cache refreshed`
  means the segment is back on the next redraw.
- **It shows on Linux but not on macOS:** the keychain read needs the
  `security` tool to find `Claude Code-credentials`. Sign in to Claude
  Code on that Mac, then wait one refresh (five minutes) or delete
  `~/.cache/claude-statusline/usage.json`.
- **No `cache:` segment:** Claude Code is older than 2.1.251, or the
  session has had no response yet, or the last response reported no cache
  tokens (prompt caching is off, or the provider does not report it).
- **A different model is scoped:** nothing to do; the label follows the
  limit's own name.

## The cache countdown and the Claude Code version

From version 2.1.251 Claude Code sends the status-line command a
`prompt_cache` object whose `expires_at` is the moment the prompt cache
goes cold. Each request that hits the cache resets that clock, so the
countdown needs no network call of its own. The window is one hour on a
subscription within plan usage and five minutes on usage credits, an API
key or a cloud provider; the `promptCacheTtl` setting or the
`CLAUDE_CODE_PROMPT_CACHE_TTL` variable changes it, and the script follows
whichever one Claude Code ends up with. On an older Claude Code the rest
of the line works and the segment is absent.

## The budget hook depends on it

A hook does not receive context usage; the status line does. So every
redraw writes `ctx_pct`, the budget, and the 5-hour, weekly and scoped
numbers to `sessions/<session_id>.json`, and the session-budget hook a
scaffolded project carries (`.claude/hooks/session-budget.sh`) reads that
file. Without the status line there is no file and the hook stays silent:
no warning at the budget, none at the usage limits. The hook does not need
the cache countdown or 2.1.251; it needs the status line installed. The
hook, its thresholds and the switch that silences it are on
[Running a loop](./running-a-loop.md#the-session-budget).

## Updating

A session cannot update the plugin it runs from, so ask for the update in
two steps: update the plugin (the commands are under
[Updating](https://github.com/MaybloomTech/maybloom-stack/blob/main/skills/README.md#updating)
in `skills/README.md`), start a new session, and ask for the status line
again. The install repeats its difference check, so your own edits are not
overwritten without asking.
