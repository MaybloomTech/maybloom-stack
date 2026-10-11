#!/usr/bin/env bash
# Claude Code status line script
# Shows: cwd | git branch | model | 5-hour usage+reset | weekly usage+reset | model-scoped week (e.g. Fable) | context usage

input=$(cat)

# ANSI color helpers (using printf-safe sequences)
c_reset='\033[0m'
c_dim='\033[2m'
c_cyan='\033[36m'
c_magenta='\033[35m'
c_yellow='\033[33m'
c_green='\033[32m'
c_orange='\033[33m'   # bold yellow approximates orange in most terminals
c_red='\033[31m'
c_bold='\033[1m'

# Color a usage percentage by threshold: green <50, yellow 50-79, red >=80
color_pct() {
  local pct_raw="$1"
  local pct
  pct=$(printf '%.0f' "$pct_raw")
  if [ "$pct" -ge 80 ]; then
    printf '%b%s%%%b' "$c_red" "$pct" "$c_reset"
  elif [ "$pct" -ge 50 ]; then
    printf '%b%s%%%b' "$c_orange" "$pct" "$c_reset"
  else
    printf '%b%s%%%b' "$c_green" "$pct" "$c_reset"
  fi
}

# Format seconds-until-reset. Modes: "hm" (default, Xh Ym) or "dhm" (Xd Yh Zm)
format_reset() {
  local resets_at="$1"
  local mode="${2:-hm}"
  local now
  now=$(date +%s)
  local secs=$(( resets_at - now ))
  if [ "$secs" -le 0 ]; then
    echo ""
    return
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

# Current working directory (shortened: replace $HOME with ~)
cwd=$(echo "$input" | jq -r '.workspace.current_dir // .cwd // ""')
cwd="${cwd/#$HOME/\~}"   # \~ : a bare ~ in the replacement is tilde-expanded back to $HOME

# Git branch (skip optional locks to avoid blocking)
git_branch=""
if [ -n "$cwd" ]; then
  expanded_cwd="${cwd/#\~/$HOME}"
  git_branch=$(git -C "$expanded_cwd" --no-optional-locks symbolic-ref --short HEAD 2>/dev/null)
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

refresh_usage_cache() {
  local tok tmp
  tok=$(oauth_token)
  [ -n "$tok" ] || return
  tmp="$usage_cache.tmp.$$"
  if curl -sS -m 8 -H "Authorization: Bearer $tok" -H 'anthropic-beta: oauth-2025-04-20' \
       https://api.anthropic.com/api/oauth/usage -o "$tmp" 2>/dev/null \
     && jq -e '.limits' "$tmp" >/dev/null 2>&1; then
    mv -f "$tmp" "$usage_cache"
  else
    rm -f "$tmp"
  fi
  rm -f "$usage_cache.lock"
}

scoped_pct=""; scoped_name=""; scoped_resets=""
if command -v curl >/dev/null 2>&1; then
  mkdir -p "$usage_cache_dir" 2>/dev/null
  now=$(date +%s)
  age=$(( now - $(file_mtime "$usage_cache") ))
  if [ "$age" -ge "$USAGE_TTL" ]; then
    # one refresher at a time; a lock older than 60 s is stale and ignored
    if [ ! -e "$usage_cache.lock" ] || [ $(( now - $(file_mtime "$usage_cache.lock") )) -gt 60 ]; then
      : > "$usage_cache.lock"
      ( refresh_usage_cache ) >/dev/null 2>&1 &
      disown 2>/dev/null
    fi
  fi
  # a cache older than an hour means refreshes have been failing (token?), hide rather than mislead
  if [ -r "$usage_cache" ] && [ "$age" -lt 3600 ]; then
    read -r scoped_pct scoped_name scoped_resets < <(
      jq -r '[.limits[]? | select(.kind == "weekly_scoped")][0]
             | select(. != null)
             | "\(.percent) \(.scope.model.display_name // "model" | ascii_downcase) \(.resets_at // "")"' \
         "$usage_cache" 2>/dev/null)
    if [ -n "$scoped_resets" ]; then
      # ISO 8601 with fractional seconds -> epoch (GNU date, then BSD date)
      iso="${scoped_resets%%.*}"
      scoped_resets=$(date -u -d "$iso" +%s 2>/dev/null \
        || date -u -j -f '%Y-%m-%dT%H:%M:%S' "$iso" +%s 2>/dev/null || echo "")
    fi
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

# Line 2: 5-hour, weekly, scoped week (fable), context
line2=()
if [ -n "$five_pct" ]; then
  colored_pct=$(color_pct "$five_pct")
  reset_str=""
  if [ -n "$five_resets" ]; then
    reset_str=$(format_reset "$five_resets")
  fi
  if [ -n "$reset_str" ]; then
    line2+=("$(printf '5h:%s %b(%s)%b' "$colored_pct" "$c_dim" "$reset_str" "$c_reset")")
  else
    line2+=("$(printf '5h:%s' "$colored_pct")")
  fi
fi
if [ -n "$week_pct" ]; then
  colored_pct=$(color_pct "$week_pct")
  reset_str=""
  if [ -n "$week_resets" ]; then
    reset_str=$(format_reset "$week_resets" dhm)
  fi
  if [ -n "$reset_str" ]; then
    line2+=("$(printf 'weekly:%s %b(%s)%b' "$colored_pct" "$c_dim" "$reset_str" "$c_reset")")
  else
    line2+=("$(printf 'weekly:%s' "$colored_pct")")
  fi
fi
if [ -n "$scoped_pct" ]; then
  colored_pct=$(color_pct "$scoped_pct")
  reset_str=""
  if [ -n "$scoped_resets" ]; then
    reset_str=$(format_reset "$scoped_resets" dhm)
  fi
  if [ -n "$reset_str" ]; then
    line2+=("$(printf '%s:%s %b(%s)%b' "$scoped_name" "$colored_pct" "$c_dim" "$reset_str" "$c_reset")")
  else
    line2+=("$(printf '%s:%s' "$scoped_name" "$colored_pct")")
  fi
fi
if [ -n "$used_pct" ]; then
  line2+=("$(printf 'ctx:%s' "$(color_pct "$used_pct")")")
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
