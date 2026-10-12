---
name: maybloom-stack-statusline
description: Use when the user wants the maybloom status line in Claude Code — the two-line terminal status line that shows the working directory, git branch, model, the 5-hour and weekly usage percentages with their reset countdowns, the model-scoped weekly limit (the "Fable" week), and context usage. Triggers on "install the status line", "add the statusline", "show usage in the status line", "add fable to the status line", "same status line as the other machine", "my status line is missing the fable limit", or "the status line stopped showing usage". Installs or updates `~/.claude/statusline-command.sh` and the `statusLine` key in `~/.claude/settings.json` from the script this skill ships; nothing about the stack's code is involved, and no sibling skill covers it. Not for the `/statusline` built-in that writes a fresh script from a description — this one is the team's fixed script.
---

# maybloom-stack-statusline

The team's Claude Code status line, as one script. It renders two lines:

```
~/workspace/app | [main] | Fable 5.1
5h:31% (2h00m) | weekly:55% (2d07h33m) | fable:53% (4d08h39m) | ctx:12%
```

- Line 1: working directory (`$HOME` shortened to `~`), git branch when the
  directory is a checkout, model display name.
- Line 2: the 5-hour window, the 7-day window, the model-scoped weekly
  limit, and context-window usage. Each percentage is green under 50,
  yellow from 50, red from 80; the dim countdown is the time to its reset.

The first two usage numbers come from the JSON Claude Code pipes into
every status-line command. The model-scoped one does not: the status-line
JSON carries only the 5-hour and 7-day buckets, so the script reads the
same OAuth usage endpoint that `/usage` reads, picks the `limits[]` entry
of kind `weekly_scoped`, and labels it with that limit's model name in
lower case (`fable` today; whichever model is scoped tomorrow). The
response is cached for five minutes under `~/.cache/claude-statusline/`
and refreshed in a background process, so the status line never waits on
the network. If the cache is older than an hour (refreshes failing, most
often an expired login) the segment is hidden rather than left stale.

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
than referenced in place.

1. Check the dependencies: `command -v jq curl git`. Install what is
   missing (`apt install jq`, `brew install jq`).
2. Look before copying. `<this-skill-dir>` is the directory this
   `SKILL.md` was loaded from. If `~/.claude/statusline-command.sh`
   already exists, diff it first; the file may carry the user's own
   edits, and the copy below would destroy them:

   ```sh
   test -f ~/.claude/statusline-command.sh \
     && diff -u ~/.claude/statusline-command.sh <this-skill-dir>/scripts/statusline.sh
   ```

   No file, or no output: go on to the copy. A diff: show it to the user
   and ask before overwriting. When they want their edits kept, merge
   instead of copying: keep their file and bring over the block headed
   "Model-scoped weekly limit" and the `scoped_name` segment of line 2.

   Then copy:

   ```sh
   cp <this-skill-dir>/scripts/statusline.sh ~/.claude/statusline-command.sh
   chmod +x ~/.claude/statusline-command.sh
   ```
3. Set the key in `~/.claude/settings.json`, keeping every other key:

   ```sh
   python3 - <<'PY'
   import json, os
   p = os.path.expanduser("~/.claude/settings.json")
   d = json.load(open(p)) if os.path.exists(p) else {}
   d["statusLine"] = {"type": "command", "command": "bash ~/.claude/statusline-command.sh"}
   json.dump(d, open(p, "w"), indent=2)
   print("statusLine set")
   PY
   ```

4. Verify without restarting. Pipe a sample payload through the script
   twice, a few seconds apart; the first run only starts the cache
   refresh, the second prints the scoped segment:

   ```sh
   echo '{"model":{"display_name":"test"},"workspace":{"current_dir":"'"$PWD"'"},"context_window":{"used_percentage":12},"rate_limits":{"five_hour":{"used_percentage":31,"resets_at":'$(( $(date +%s) + 7200 ))'},"seven_day":{"used_percentage":55,"resets_at":'$(( $(date +%s) + 200000 ))'}}}' \
     | bash ~/.claude/statusline-command.sh
   ```

   Expected: two lines, the second ending in `fable:NN% (...) | ctx:12%`.
   The running session picks the new command up on its next redraw; a
   session started before `settings.json` changed may need a restart.

## Update

`/plugin marketplace update maybloom-stack`, then repeat step 2 (the diff
check included) and step 4. Step 3 is already in place.

## Troubleshooting

- **No second line at all:** the payload had no `rate_limits`, which
  happens outside a signed-in claude.ai session (API-key sessions have no
  usage buckets). Nothing to fix.
- **The scoped segment is missing, the others show:** the cache is stale
  or absent. The normal refresh runs in the background with its output
  discarded, so ask the script itself:

  ```sh
  STATUSLINE_DEBUG=1 bash ~/.claude/statusline-command.sh < /dev/null
  ```

  That runs the refresh in the foreground and prints one `statusline:`
  line on stderr saying why: no OAuth token (not signed in on this
  machine, or an API-key session), `HTTP 401` (login expired: `/login`),
  a curl exit code (network or DNS), or `usage cache refreshed`, after
  which the segment is back on the next redraw. No `curl` on the machine
  means the segment is skipped by design.
- **Linux shows the segment, macOS does not:** the keychain read needs the
  `security` tool to find `Claude Code-credentials`; sign in to Claude
  Code on that Mac first, then wait one refresh (five minutes) or delete
  `~/.cache/claude-statusline/usage.json`.
- **A different model is scoped:** nothing to do, the label follows the
  limit's own `display_name`.

## Changing it

The script is the source of truth and is meant to be edited here, not in
place on one machine: a change that should reach every machine is a pull
request on this repo, and the install repeats on each. Segment labels are
the `printf` format strings in the "Line 2" section (`5h:`, `weekly:`,
`ctx:`); the colour thresholds are in `color_pct`; the cache lifetime is
`USAGE_TTL` (seconds).
