#!/usr/bin/env bash
# Claude Code status line script
# Shows: cwd | git branch | model | 5-hour usage+reset | weekly usage+reset | model-scoped week (e.g. Fable) | context usage
#
# ctx is coloured against the session budget: amber from MAYBLOOM_CTX_BUDGET_PCT
# (default 30), red from 50. Every redraw also writes this session's numbers to
# $XDG_CACHE_HOME/claude-statusline/sessions/<session_id>.json, which the
# session-budget prompt hook reads (hooks do not receive context usage).
#
# STATUSLINE_DEBUG=1 runs the usage refresh in the foreground and reports on
# stderr why the scoped segment is or is not available (no token, HTTP 401,
# curl failure, stale cache); see SKILL.md, Troubleshooting.

input=$(cat)

# ANSI color helpers (using printf-safe sequences)
c_reset='\033[0m'
c_dim='\033[2m'
c_cyan='\033[36m'
c_magenta='\033[35m'
c_yellow='\033[33m'
c_green='\033[32m'
c_red='\033[31m'

# Field separator for multi-value reads from jq: a non-whitespace character,
# because bash collapses runs of whitespace IFS characters (a tab would make
# an empty middle field shift the ones after it).
US=$'\x1f'

debug_log() {
  [ -n "${STATUSLINE_DEBUG:-}" ] && printf 'statusline: %s\n' "$*" >&2
  return 0
}

# Color a usage percentage by threshold: green <50, yellow 50-79, red >=80.
# Anything that is not a number (jq's "null", an empty string) prints nothing,
# so a caller that passes a bad value gets an empty segment rather than a
# green 0% and an error on stderr.
color_pct() {
  local pct="${1%%.*}"
  [[ "$pct" =~ ^[0-9]+$ ]] || return 0
  if [ "$pct" -ge 80 ]; then
    printf '%b%s%%%b' "$c_red" "$pct" "$c_reset"
  elif [ "$pct" -ge 50 ]; then
    printf '%b%s%%%b' "$c_yellow" "$pct" "$c_reset"
  else
    printf '%b%s%%%b' "$c_green" "$pct" "$c_reset"
  fi
}

# Color the context percentage against the session budget: green under it,
# yellow from it, red from 50 (or from the budget, when the budget is higher).
ctx_budget="${MAYBLOOM_CTX_BUDGET_PCT:-30}"
[[ "$ctx_budget" =~ ^[0-9]+$ ]] || ctx_budget=30
color_ctx() {
  local pct="${1%%.*}" red=50
  [[ "$pct" =~ ^[0-9]+$ ]] || return 0
  [ "$ctx_budget" -gt "$red" ] && red="$ctx_budget"
  if [ "$pct" -ge "$red" ]; then
    printf '%b%s%%%b' "$c_red" "$pct" "$c_reset"
  elif [ "$pct" -ge "$ctx_budget" ]; then
    printf '%b%s%%%b' "$c_yellow" "$pct" "$c_reset"
  else
    printf '%b%s%%%b' "$c_green" "$pct" "$c_reset"
  fi
}

# Format seconds-until-reset. Modes: "hm" (default, Xh Ym) or "dhm" (Xd Yh Zm).
# resets_at is an epoch; a fractional one is truncated, a non-number prints nothing.
format_reset() {
  local resets_at="${1%%.*}"
  local mode="${2:-hm}"
  [[ "$resets_at" =~ ^[0-9]+$ ]] || return 0
  local now
  now=$(date +%s)
  local secs=$(( resets_at - now ))
  if [ "$secs" -le 0 ]; then
    return 0
  fi
  local d=$(( secs / 86400 ))
  local h=$(( (secs % 86400) / 3600 ))
  local m=$(( (secs % 3600) / 60 ))
  if [ "$mode" = "dhm" ]; then
    if [ "$d" -gt 0 ]; then
      printf '%dd%02dh%02dm' "$d" "$h" "$m"
    elif [ "$h" -gt 0 ]; then
      printf '%dh%02dm' "$h" "$m"
    else
      printf '%dm' "$m"
    fi
  else
    local th=$(( secs / 3600 ))
    if [ "$th" -gt 0 ]; then
      printf '%dh%02dm' "$th" "$m"
    else
      printf '%dm' "$m"
    fi
  fi
}

# ISO 8601 timestamp -> epoch seconds. Keeps the zone (Z or +hh:mm), drops
# only fractional seconds; a bare epoch passes through; anything else prints
# nothing. GNU date first, then BSD date (macOS), which wants +hhmm.
iso_re='^([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2})(\.[0-9]+)?(Z|[+-][0-9]{2}:?[0-9]{2})?$'
iso_to_epoch() {
  local s="$1" base tz
  if [[ "$s" =~ ^[0-9]+(\.[0-9]+)?$ ]]; then
    printf '%s' "${s%%.*}"
    return 0
  fi
  [[ "$s" =~ $iso_re ]] || return 0
  base="${BASH_REMATCH[1]}"
  tz="${BASH_REMATCH[3]:-Z}"
  [ "$tz" = Z ] && tz='+00:00'
  date -u -d "${base}${tz}" +%s 2>/dev/null \
    || date -j -f '%Y-%m-%dT%H:%M:%S%z' "${base}${tz/:/}" +%s 2>/dev/null \
    || true
}

# Everything the status-line payload gives us, in one jq call. Missing values
# come through as empty fields; US keeps empty fields in place.
IFS="$US" read -r session_id raw_cwd model used_pct five_pct five_resets week_pct week_resets < <(
  printf '%s' "$input" | jq -r --arg us "$US" '
    [ (.session_id // ""),
      (.workspace.current_dir // .cwd // ""),
      (.model.display_name // ""),
      (.context_window.used_percentage // ""),
      (.rate_limits.five_hour.used_percentage // ""),
      (.rate_limits.five_hour.resets_at // ""),
      (.rate_limits.seven_day.used_percentage // ""),
      (.rate_limits.seven_day.resets_at // "") ]
    | map(tostring) | join($us)' 2>/dev/null)

# Display form of the directory: $HOME shortened to ~ only at a path boundary
# (so /home/mc never shortens /home/mcerver). git gets raw_cwd.
cwd="$raw_cwd"
if [ -n "$HOME" ]; then
  if [ "$raw_cwd" = "$HOME" ]; then
    cwd='~'
  elif [[ "$raw_cwd" == "$HOME"/* ]]; then
    # shellcheck disable=SC2088 # a literal ~ for display, never expanded
    cwd="~/${raw_cwd#"$HOME"/}"
  fi
fi

# Git branch (skip optional locks to avoid blocking)
git_branch=""
if [ -n "$raw_cwd" ]; then
  git_branch=$(git -C "$raw_cwd" --no-optional-locks symbolic-ref --short HEAD 2>/dev/null)
fi


# Model-scoped weekly limit (e.g. "Week, Fable"). The status line JSON only
# carries the 5-hour and 7-day buckets, so this comes from the same OAuth usage
# endpoint /usage reads (limits[] entry with kind weekly_scoped). Cached in
# $XDG_CACHE_HOME/claude-statusline/usage.json and refreshed in the background
# so the status line never waits on the network. One request per USAGE_TTL
# seconds, whether or not the last one succeeded: the attempt stamp records the
# start of every refresh, so an expired login costs one request per TTL, not
# one per redraw.
USAGE_TTL=300
usage_cache_dir="${XDG_CACHE_HOME:-$HOME/.cache}/claude-statusline"
usage_cache="$usage_cache_dir/usage.json"
usage_attempt="$usage_cache.attempt"   # mtime = start of the last refresh
usage_lock="$usage_cache.lock"          # a directory: mkdir is atomic

file_mtime() {
  stat -c %Y "$1" 2>/dev/null || stat -f %m "$1" 2>/dev/null || echo 0
}

oauth_token() {
  local creds="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/.credentials.json"
  if [ -r "$creds" ]; then
    jq -r '.claudeAiOauth.accessToken // empty' "$creds" 2>/dev/null
  elif command -v security >/dev/null 2>&1; then
    security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null \
      | jq -r '.claudeAiOauth.accessToken // empty' 2>/dev/null
  fi
}

# Fetch the usage JSON into the cache. The bearer token travels to curl through
# a config file on stdin (-K -), never on the command line, so it is not
# readable in `ps` or /proc/*/cmdline while the request runs. printf is a bash
# builtin, so there is no process carrying it either.
refresh_usage_cache() {
  local tok tmp code rc
  tok=$(oauth_token)
  if [ -z "$tok" ]; then
    debug_log "no OAuth token (not signed in to claude.ai here, or an API-key session): scoped segment unavailable"
    return 0
  fi
  tmp="$usage_cache.tmp.$$"
  code=$(printf 'header = "Authorization: Bearer %s"\nheader = "anthropic-beta: oauth-2025-04-20"\n' "$tok" \
    | curl -sS -m 8 -K - -o "$tmp" -w '%{http_code}' https://api.anthropic.com/api/oauth/usage 2>/dev/null)
  rc=$?
  if [ "$rc" -ne 0 ]; then
    debug_log "curl failed (exit $rc): network or DNS; segment hidden once the cache is an hour old"
  elif [ "$code" != 200 ]; then
    debug_log "usage endpoint answered HTTP $code (401 = login expired: run /login)"
  elif ! jq -e '.limits' "$tmp" >/dev/null 2>&1; then
    # one file, overwritten each time, so failing refreshes do not pile up
    mv -f "$tmp" "$usage_cache.bad"
    debug_log "usage endpoint answered 200 without a limits[] array; response kept at $usage_cache.bad"
  else
    mv -f "$tmp" "$usage_cache"
    debug_log "usage cache refreshed"
  fi
  rm -f "$tmp"
}

scoped_pct=""; scoped_name=""; scoped_resets=""
if command -v curl >/dev/null 2>&1; then
  mkdir -p "$usage_cache_dir" 2>/dev/null
  now=$(date +%s)
  age=$(( now - $(file_mtime "$usage_cache") ))
  since_attempt=$(( now - $(file_mtime "$usage_attempt") ))
  if [ -n "${STATUSLINE_DEBUG:-}" ]; then
    # foreground, every time, messages on stderr; then judge the cache the
    # way a normal run would, by its real age
    refresh_usage_cache
    age=$(( $(date +%s) - $(file_mtime "$usage_cache") ))
  elif [ "$age" -ge "$USAGE_TTL" ] && [ "$since_attempt" -ge "$USAGE_TTL" ]; then
    # one refresher at a time: mkdir either wins or fails, atomically; a lock
    # directory older than 60 s belongs to a refresher that died and is removed.
    if [ -d "$usage_lock" ] && [ $(( now - $(file_mtime "$usage_lock") )) -gt 60 ]; then
      rmdir "$usage_lock" 2>/dev/null
    fi
    if mkdir "$usage_lock" 2>/dev/null; then
      : > "$usage_attempt"
      # sidecars untouched for a week, at most once per USAGE_TTL
      find "$usage_cache_dir/sessions" -name '*.json' -mtime +7 -delete 2>/dev/null
      ( refresh_usage_cache; rmdir "$usage_lock" ) >/dev/null 2>&1 &
      disown 2>/dev/null
    fi
  fi
  # a cache older than an hour means refreshes have been failing (token?), hide rather than mislead
  if [ -r "$usage_cache" ] && [ "$age" -lt 3600 ]; then
    # first word of the model's display name, lower case: "Fable 5.1" -> fable
    IFS="$US" read -r scoped_pct scoped_name scoped_resets < <(
      jq -r --arg us "$US" '[.limits[]? | select(.kind == "weekly_scoped" and .percent != null)][0]
             | select(. != null)
             | [ (.percent | tostring),
                 (((.scope.model.display_name // "model") | ascii_downcase | split(" ")[0]) // "model"),
                 (.resets_at // "" | tostring) ]
             | join($us)' \
         "$usage_cache" 2>/dev/null)
    scoped_resets=$(iso_to_epoch "$scoped_resets")
  elif [ -r "$usage_cache" ]; then
    debug_log "cache at $usage_cache is ${age}s old (over an hour): segment hidden until a refresh succeeds"
  else
    debug_log "no usable cache at $usage_cache"
  fi
else
  debug_log "curl not found: the scoped segment is skipped by design"
fi

# Dim separator
sep=$(printf ' %b|%b ' "$c_dim" "$c_reset")

# Line 1: cwd, git branch, model
line1=()
if [ -n "$cwd" ]; then
  line1+=("$(printf '%b%s%b' "$c_cyan" "$cwd" "$c_reset")")
fi
if [ -n "$git_branch" ]; then
  line1+=("$(printf '%b[%s]%b' "$c_magenta" "$git_branch" "$c_reset")")
fi
if [ -n "$model" ]; then
  line1+=("$(printf '%b%s%b' "$c_yellow" "$model" "$c_reset")")
fi

# One usage segment: "label:NN% (reset)". Nothing when the percentage is not a number.
usage_segment() {
  local label="$1" pct="$2" resets="$3" mode="$4"
  local colored reset_str
  colored=$(color_pct "$pct")
  [ -n "$colored" ] || return 0
  reset_str=""
  if [ -n "$resets" ]; then
    reset_str=$(format_reset "$resets" "$mode")
  fi
  if [ -n "$reset_str" ]; then
    printf '%s:%s %b(%s)%b' "$label" "$colored" "$c_dim" "$reset_str" "$c_reset"
  else
    printf '%s:%s' "$label" "$colored"
  fi
}

# Line 2: 5-hour, weekly, scoped week (fable), context
line2=()
seg=$(usage_segment "5h" "$five_pct" "$five_resets" hm);                 [ -n "$seg" ] && line2+=("$seg")
seg=$(usage_segment "weekly" "$week_pct" "$week_resets" dhm);            [ -n "$seg" ] && line2+=("$seg")
seg=$(usage_segment "${scoped_name:-model}" "$scoped_pct" "$scoped_resets" dhm); [ -n "$seg" ] && line2+=("$seg")
if [ -n "$used_pct" ]; then
  colored=$(color_ctx "$used_pct")
  [ -n "$colored" ] && line2+=("$(printf 'ctx:%s' "$colored")")
fi

join_parts() {
  local out=""
  for p in "$@"; do
    if [ -z "$out" ]; then
      out="$p"
    else
      out="${out}${sep}${p}"
    fi
  done
  printf '%s' "$out"
}

# The per-session sidecar: the numbers this redraw shows, for the prompt hook.
# Only for a session id that is safe as a file name; written to a temp file and
# renamed, so a reader never sees half a file. Sidecars untouched for a week
# are pruned with the usage refresh, above.
write_sidecar() {
  local dir="$usage_cache_dir/sessions" tmp
  [[ "$session_id" =~ ^[A-Za-z0-9_-]+$ ]] || return 0
  mkdir -p "$dir" 2>/dev/null || return 0
  tmp="$dir/.$session_id.$$"
  jq -n \
    --arg session_id "$session_id" --arg ctx "$used_pct" \
    --arg five "$five_pct" --arg five_resets "$five_resets" \
    --arg week "$week_pct" --arg week_resets "$week_resets" \
    --arg scoped "$scoped_pct" --arg scoped_name "$scoped_name" --arg scoped_resets "$scoped_resets" \
    --arg budget "$ctx_budget" --argjson updated_at "$(date +%s)" '
    def num: if . == "" then null else (tonumber? // null) end;
    { session_id: $session_id, updated_at: $updated_at,
      ctx_pct: ($ctx | num), ctx_budget_pct: ($budget | num),
      five_hour: { pct: ($five | num), resets_at: ($five_resets | num) },
      seven_day: { pct: ($week | num), resets_at: ($week_resets | num) },
      scoped: { name: (if $scoped_name == "" then null else $scoped_name end),
                pct: ($scoped | num), resets_at: ($scoped_resets | num) } }' \
    > "$tmp" 2>/dev/null && mv -f "$tmp" "$dir/$session_id.json"
  rm -f "$tmp"
  return 0
}
write_sidecar

l1=$(join_parts "${line1[@]}")
l2=$(join_parts "${line2[@]}")

if [ -n "$l1" ]; then printf '%s\n' "$l1"; fi
if [ -n "$l2" ]; then printf '%s\n' "$l2"; fi
