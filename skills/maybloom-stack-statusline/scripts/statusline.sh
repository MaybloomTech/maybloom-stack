#!/usr/bin/env bash
# Claude Code status line script
# Shows: cwd | git branch | model | 5-hour usage+reset | weekly usage+reset | model-scoped week (e.g. Fable) | context usage
#
# STATUSLINE_DEBUG=1 runs the usage refresh in the foreground and reports on
# stderr why the scoped segment is or is not available (no token, HTTP 401,
# curl failure); see SKILL.md, Troubleshooting.

input=$(cat)

# ANSI color helpers (using printf-safe sequences)
c_reset='\033[0m'
c_dim='\033[2m'
c_cyan='\033[36m'
c_magenta='\033[35m'
c_yellow='\033[33m'
c_green='\033[32m'
c_red='\033[31m'

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

# Current working directory. raw_cwd is what git gets; cwd is the display
# form, with $HOME shortened to ~ only at a path boundary (so /home/mc never
# shortens /home/mcerver).
raw_cwd=$(echo "$input" | jq -r '.workspace.current_dir // .cwd // ""')
cwd="$raw_cwd"
if [ -n "$HOME" ]; then
  if [ "$raw_cwd" = "$HOME" ]; then
    cwd='~'
  elif [[ "$raw_cwd" == "$HOME"/* ]]; then
    cwd="~/${raw_cwd#"$HOME"/}"
  fi
fi

# Git branch (skip optional locks to avoid blocking)
git_branch=""
if [ -n "$raw_cwd" ]; then
  git_branch=$(git -C "$raw_cwd" --no-optional-locks symbolic-ref --short HEAD 2>/dev/null)
fi

# Model display name
model=$(echo "$input" | jq -r '.model.display_name // ""')

# Context window usage (used%)
used_pct=$(echo "$input" | jq -r '.context_window.used_percentage // empty')

# 5-hour rate limit — percentage and reset timestamp
five_pct=$(echo "$input" | jq -r '.rate_limits.five_hour.used_percentage // empty')
five_resets=$(echo "$input" | jq -r '.rate_limits.five_hour.resets_at // empty')

# Weekly rate limit (7-day window) — percentage and reset timestamp
week_pct=$(echo "$input" | jq -r '.rate_limits.seven_day.used_percentage // empty')
week_resets=$(echo "$input" | jq -r '.rate_limits.seven_day.resets_at // empty')


# Model-scoped weekly limit (e.g. "Week, Fable"). The status line JSON only
# carries the 5-hour and 7-day buckets, so this comes from the same OAuth usage
# endpoint /usage reads (limits[] entry with kind weekly_scoped). Cached in
# $XDG_CACHE_HOME/claude-statusline/usage.json for USAGE_TTL seconds and
# refreshed in the background so the status line never waits on the network.
USAGE_TTL=300
usage_cache_dir="${XDG_CACHE_HOME:-$HOME/.cache}/claude-statusline"
usage_cache="$usage_cache_dir/usage.json"
usage_lock="$usage_cache.lock"

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
    debug_log "usage endpoint answered 200 without a limits[] array; response kept at $tmp.bad"
    mv -f "$tmp" "$tmp.bad"
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
  if [ -n "${STATUSLINE_DEBUG:-}" ]; then
    # foreground, every time, messages on stderr
    refresh_usage_cache
    age=0
  elif [ "$age" -ge "$USAGE_TTL" ]; then
    # one refresher at a time; a lock older than 60 s is stale and ignored.
    # The lock is removed by the wrapper, whichever way the refresh returns.
    if [ ! -e "$usage_lock" ] || [ $(( now - $(file_mtime "$usage_lock") )) -gt 60 ]; then
      : > "$usage_lock"
      ( refresh_usage_cache; rm -f "$usage_lock" ) >/dev/null 2>&1 &
      disown 2>/dev/null
    fi
  fi
  # a cache older than an hour means refreshes have been failing (token?), hide rather than mislead
  if [ -r "$usage_cache" ] && [ "$age" -lt 3600 ]; then
    # tab-separated so a display_name with a space ("Fable 5.1") stays one field
    IFS=$'\t' read -r scoped_pct scoped_name scoped_resets < <(
      jq -r '[.limits[]? | select(.kind == "weekly_scoped" and .percent != null)][0]
             | select(. != null)
             | [ (.percent | tostring),
                 ((.scope.model.display_name // "model") | ascii_downcase),
                 (.resets_at // "") ]
             | @tsv' \
         "$usage_cache" 2>/dev/null)
    if [ -n "$scoped_resets" ]; then
      # ISO 8601 with fractional seconds -> epoch (GNU date, then BSD date)
      iso="${scoped_resets%%.*}"
      scoped_resets=$(date -u -d "$iso" +%s 2>/dev/null \
        || date -u -j -f '%Y-%m-%dT%H:%M:%S' "$iso" +%s 2>/dev/null || echo "")
    fi
  elif [ -n "${STATUSLINE_DEBUG:-}" ]; then
    debug_log "no usable cache at $usage_cache"
  fi
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
  colored=$(color_pct "$used_pct")
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

l1=$(join_parts "${line1[@]}")
l2=$(join_parts "${line2[@]}")

if [ -n "$l1" ]; then printf '%s\n' "$l1"; fi
if [ -n "$l2" ]; then printf '%s\n' "$l2"; fi
