---
name: maybloom-stack-statusline
description: Use when the user wants the maybloom status line in Claude Code — the two-line terminal status line that shows the working directory, git branch, model, the 5-hour and weekly usage percentages with their reset countdowns, the model-scoped weekly limit (the "Fable" week), context usage against the session budget, and the prompt cache countdown; it also writes the per-session numbers file the scaffolded session-budget hook reads. Triggers on "install the status line", "add the statusline", "show usage in the status line", "add fable to the status line", "same status line as the other machine", "my status line is missing the fable limit", "the status line stopped showing usage", "the budget hook never warns", or "show the cache timer in the status line". Installs or updates `~/.claude/statusline-command.sh` and the `statusLine` key in `~/.claude/settings.json` from the script this skill ships; nothing about the stack's code is involved, and no sibling skill covers it. Not for the `/statusline` built-in that writes a fresh script from a description — this one is the team's fixed script.
---

# maybloom-stack-statusline

The team's Claude Code status line, as one script. It renders two lines:

```
~/workspace/app | [main] | Fable 5.1
5h:31% (2h00m) | weekly:55% (2d07h33m) | fable:53% (4d08h39m) | ctx:12% | cache:4m50s
```

- Line 1: working directory (`$HOME` shortened to `~`), git branch when the
  directory is a checkout, model display name.
- Line 2: the 5-hour window, the 7-day window, the model-scoped weekly
  limit, context-window usage, and the prompt cache countdown. Each usage
  percentage is green under 50, yellow from 50, red from 80; the dim
  countdown is the time to its reset. `ctx:` has its own thresholds,
  from the session budget
  (`maybloom-stack-delegate`, Session budget): yellow from
  `MAYBLOOM_CTX_BUDGET_PCT` (default 30), red from 50. Set a changed
  budget in the shell that starts Claude Code: whether a project's
  `settings.json` `env` block reaches the status line is not verified
  (it does reach the budget hook).

Last on line 2, `cache:` is the time left before the session's prompt
cache goes cold (see "Where the cache countdown comes from", below). It is
green, yellow under five minutes, red under one minute, and `cache:cold`
in red once it has passed.

The model-scoped weekly limit is a third usage window: a weekly cap that
applies to one model only (on top of the all-models weekly window), shown
under that model's name. An account without one shows no segment.

Every redraw also writes the numbers it shows to a per-session file,
`~/.cache/claude-statusline/sessions/<session_id>.json` (`ctx_pct`,
`ctx_budget_pct`, `five_hour`, `seven_day` and `scoped`, each with `pct`
and `resets_at` as epoch seconds; `null` where the payload had none), by
a temporary file and a rename. Hooks do not receive context usage and
the status line does, so this file is how the session-budget hook a
scaffolded project carries (`.claude/hooks/session-budget.sh`) knows
where the session stands. Files untouched for a week are deleted when
the usage cache refreshes (so only where `curl` is installed).

The first two usage numbers come from the JSON Claude Code pipes into
every status-line command. The model-scoped one does not: the status-line
JSON carries only the 5-hour and 7-day buckets, so the script reads the
same OAuth usage endpoint that `/usage` reads, picks the `limits[]` entry
of kind `weekly_scoped`, and labels it with the first word of that
limit's model name in lower case (`fable` today, from "Fable 5.1";
whichever model is scoped tomorrow). The response is cached for five
minutes under `~/.cache/claude-statusline/` and refreshed in a background
process, so the status line never waits on the network; a refresh that
fails is not retried before the next five minutes either. If the cache is
older than an hour (refreshes failing, most often an expired login) the
segment is hidden rather than left stale.

Where the cache countdown comes from: Claude Code sends a `prompt_cache`
object in the same payload, from version 2.1.251 on. `expires_at` is the
epoch second at which the prompt cache goes cold, and `warm` says whether
it is still warm. Every request that hits the cache resets that clock, so
the number moves with each response, and the countdown needs no network
call. By default the window is 1h on a subscription within plan usage, and 5m
on usage credits, an API key or a cloud provider. The `promptCacheTtl`
setting or the `CLAUDE_CODE_PROMPT_CACHE_TTL` variable overrides it, and so
do `ENABLE_PROMPT_CACHING_1H` (one hour) and `FORCE_PROMPT_CACHING_5M` (five
minutes). The script shows the time left until `expires_at`, so it follows
whichever `ttl` Claude Code ends up with. With no `expires_at` there is no
segment: the field is `null` when the last response reported no cache
tokens (prompt caching is off, or the provider does not report it), and
there is no `prompt_cache` at all before the first response of the session.
The countdown only moves while the status line re-runs, which is why step
3 of the install sets `refreshInterval`.

The script is `scripts/statusline.sh` next to this file. It needs `bash`,
`jq`, `curl` and `git`, and runs on Linux and macOS: on macOS the OAuth
token comes from the keychain item `Claude Code-credentials`, on Linux
from `~/.claude/.credentials.json`. The token reaches curl through a
config on stdin, never as an argument, so it is not readable in `ps`
while a refresh runs.

## Install

A plugin cannot set a user's `statusLine`, so this is a copy plus one
settings key, done once per machine. The plugin's own path changes on
every update, which is why the script is copied to a stable one rather
than referenced in place. The steps below write `$CFG`, the Claude Code
config directory: `~/.claude` unless `CLAUDE_CONFIG_DIR` is set, which
the script honours too:

```sh
CFG="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
```

1. Check the dependencies: `command -v jq curl git`. Install what is
   missing (`apt install jq`, `brew install jq`).
2. Look before copying. `<this-skill-dir>` is the directory this
   `SKILL.md` was loaded from. If `$CFG/statusline-command.sh` already
   exists, diff it first; the file may carry the user's own edits, and
   the copy below would destroy them:

   ```sh
   test -f "$CFG/statusline-command.sh" \
     && diff -u "$CFG/statusline-command.sh" <this-skill-dir>/scripts/statusline.sh
   ```

   No file, or no output: go on to the copy. A diff: show it to the user
   and ask before overwriting. When they want their edits kept, the
   workable order is copy the shipped script and re-apply their edits on
   top of it, using the diff you just showed. Do not try to graft the
   scoped-limit feature into an older script piecemeal: it is spread over
   `US`, `debug_log`, `iso_to_epoch`, the payload `read`, the whole block
   headed "Model-scoped weekly limit" (`file_mtime`, `oauth_token`,
   `refresh_usage_cache` and the gate under it), `usage_segment` and the
   line-2 segments, and a partial graft fails with "command not found" on
   every redraw.

   Then copy:

   ```sh
   cp <this-skill-dir>/scripts/statusline.sh "$CFG/statusline-command.sh"
   chmod +x "$CFG/statusline-command.sh"
   ```
3. Set the key in `$CFG/settings.json`, keeping every other key. The
   file is written whole and renamed into place, so a failure mid-way
   leaves the old settings intact:

   ```sh
   python3 - <<'PY'
   import json, os
   home = os.path.expanduser("~")
   cfg = os.environ.get("CLAUDE_CONFIG_DIR") or os.path.join(home, ".claude")
   script = os.path.join(cfg, "statusline-command.sh")
   if script.startswith(home + os.sep):
       script = "~" + script[len(home):]
   p = os.path.join(cfg, "settings.json")
   d = json.load(open(p)) if os.path.exists(p) else {}
   sl = d.get("statusLine")
   if not isinstance(sl, dict):
       sl = {}
   sl.update({"type": "command", "command": "bash " + script, "refreshInterval": 10})
   d["statusLine"] = sl
   out = json.dumps(d, indent=2) + "\n"
   tmp = p + ".tmp"
   with open(tmp, "w") as f:
       f.write(out)
   os.replace(tmp, p)
   print("statusLine set to:", d["statusLine"]["command"])
   PY
   ```

   `refreshInterval` makes Claude Code run the command every 10 seconds,
   so the cache countdown ticks while the session is idle. Without it the
   command still re-runs on conversation updates, on `/compact`, on a mode
   change, at a rate-limit reset and when the cache reaches `expires_at`,
   so `cold` shows on time either way; the key fills the gaps in between.
   A redraw makes no network call of its own. But while a session is open,
   even idle, the timer keeps redrawing, so the background usage refresh
   keeps firing at its five-minute gate for as long as any session is open.

4. Verify without restarting. Pipe a sample payload through the script
   twice, a few seconds apart; the first run only starts the cache
   refresh, the second prints the scoped segment:

   ```sh
   echo '{"session_id":"statusline-check","model":{"display_name":"test"},"workspace":{"current_dir":"'"$PWD"'"},"context_window":{"used_percentage":12},"rate_limits":{"five_hour":{"used_percentage":31,"resets_at":'$(( $(date +%s) + 7200 ))'},"seven_day":{"used_percentage":55,"resets_at":'$(( $(date +%s) + 200000 ))'}},"prompt_cache":{"warm":true,"ttl":"5m","expires_at":'$(( $(date +%s) + 290 ))'}}' \
     | bash "$CFG/statusline-command.sh"
   ```

   Expected: two lines, the second ending in `fable:NN% (...) | ctx:12% |
   cache:4m50s`, and the sidecar
   `${XDG_CACHE_HOME:-$HOME/.cache}/claude-statusline/sessions/statusline-check.json`
   with `"ctx_pct": 12` (delete it afterwards).
   The running session picks the new command up on its next redraw; a
   session started before `settings.json` changed may need a restart.

## Update

A session cannot update the plugin it is running from: `<this-skill-dir>`
stays the old version's folder for the rest of the session, even after
`/reload-plugins`, so step 2 would copy the old script. So don't copy
anything here. Tell the user to update the plugin (the Updating section
of `../README.md`; auto-update, if it is on, runs only after a session's
first message and can take minutes), then start a new session and ask
for the status line again. That session repeats step 2 (the diff check
included) and step 4. Step 3 is already in place, except on a machine
installed before this version: its `statusLine` has no `refreshInterval`
yet, so there step 3 is repeated once.

## Troubleshooting

- **No second line at all:** the payload had no `rate_limits`, which
  happens outside a signed-in claude.ai session (API-key sessions have no
  usage buckets). Nothing to fix.
- **The scoped segment is missing, the others show:** the cache is stale
  or absent. The normal refresh runs in the background with its output
  discarded, so ask the script itself:

  ```sh
  STATUSLINE_DEBUG=1 bash "$CFG/statusline-command.sh" < /dev/null
  ```

  That runs the refresh in the foreground and prints `statusline:` lines
  on stderr saying why: no OAuth token (not signed in on this machine, or
  an API-key session), `HTTP 401` (login expired: `/login`), a curl exit
  code (network or DNS), `curl not found` (the segment is skipped by
  design), a cache over an hour old (hidden until a refresh succeeds), or
  `usage cache refreshed`, after which the segment is back on the next
  redraw. Debug mode judges the cache by the same one-hour rule as a
  normal run, so what it shows is what the status line shows.
- **Linux shows the segment, macOS does not:** the keychain read needs the
  `security` tool to find `Claude Code-credentials`; sign in to Claude
  Code on that Mac first, then wait one refresh (five minutes) or delete
  `~/.cache/claude-statusline/usage.json`.
- **No `cache:` segment:** one of three causes. Claude Code older than
  2.1.251, which does not send `prompt_cache` (update Claude Code). No
  response yet in this session, since the field appears with the first
  main-conversation response. Or the last response reported no cache tokens
  (`expires_at` is `null`): prompt caching is off, or the provider does not
  report it. Nothing else to fix.
- **A different model is scoped:** nothing to do, the label follows the
  limit's own `display_name`.

## Changing it

The script is the source of truth and is meant to be edited here, not in
place on one machine: a change that should reach every machine is a pull
request on this repo, and the install repeats on each. Segment labels are
the `printf` format strings in the "Line 2" section (`5h:`, `weekly:`,
`ctx:`); the colour thresholds are in `color_pct` and, for context,
`color_ctx`; the cache countdown's format strings and its five-minute and
one-minute thresholds are in `cache_segment`; the sidecar's fields are in
`write_sidecar` (the hook reads them, so change both together); `USAGE_TTL` (seconds)
is both the cache lifetime and the minimum gap between two requests,
successful or not.
