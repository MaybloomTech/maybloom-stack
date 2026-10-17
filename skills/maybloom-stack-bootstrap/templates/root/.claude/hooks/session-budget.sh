#!/usr/bin/env bash
# UserPromptSubmit hook: the session budget (maybloom-stack-delegate, Session
# budget). Hooks do not receive context usage, so this reads the numbers the
# maybloom status line writes for this session to
# ${XDG_CACHE_HOME:-~/.cache}/claude-statusline/sessions/<session_id>.json and,
# once per threshold crossed, adds a line to the model's context:
#
#   - context at the budget (MAYBLOOM_CTX_BUDGET_PCT, default 30), then at every
#     MAYBLOOM_CTX_STEP_PCT (default 10) above it: write the hand-off, propose
#     stopping. Silenced for the session by <cache>/claude-budget/<session_id>.ok,
#     which the model touches when the project owner says to continue.
#   - the 5-hour window at MAYBLOOM_5H_WARN_PCT (default 80) or the weekly at
#     MAYBLOOM_WEEK_WARN_PCT (default 90): finish, hand off, start nothing new.
#     Once per window (keyed by its reset time); the .ok file does not silence it.
#
# When context falls back under the budget (a compaction), the mark is cleared,
# so crossing the budget again warns again.
#
# No status line, no sidecar, no jq: the hook prints nothing and exits 0. It
# never blocks a prompt.
set -u

command -v jq >/dev/null 2>&1 || exit 0
input=$(cat)
sid=$(printf '%s' "$input" | jq -r '.session_id // empty' 2>/dev/null)
[[ "$sid" =~ ^[A-Za-z0-9_-]+$ ]] || exit 0

cache="${XDG_CACHE_HOME:-$HOME/.cache}"
sidecar="$cache/claude-statusline/sessions/$sid.json"
[ -r "$sidecar" ] || exit 0
state_dir="$cache/claude-budget"
state="$state_dir/$sid.state"
ok="$state_dir/$sid.ok"
mkdir -p "$state_dir" 2>/dev/null || exit 0

int_or() { [[ "${1:-}" =~ ^[0-9]+$ ]] && printf '%s' "$1" || printf '%s' "$2"; }
budget=$(int_or "${MAYBLOOM_CTX_BUDGET_PCT:-}" 30)
step=$(int_or "${MAYBLOOM_CTX_STEP_PCT:-}" 10)
[ "$step" -gt 0 ] || step=10
five_warn=$(int_or "${MAYBLOOM_5H_WARN_PCT:-}" 80)
week_warn=$(int_or "${MAYBLOOM_WEEK_WARN_PCT:-}" 90)

# Integer parts of the numbers; empty when the status line had none.
read -r ctx five five_resets week week_resets < <(jq -r '
  def i: if type == "number" then floor | tostring else "-" end;
  [ (.ctx_pct | i), (.five_hour.pct | i), (.five_hour.resets_at | i),
    (.seven_day.pct | i), (.seven_day.resets_at | i) ] | join(" ")' "$sidecar" 2>/dev/null)
[ "${ctx:-}" = - ] && ctx=""; [ "${five:-}" = - ] && five=""; [ "${week:-}" = - ] && week=""

# State: what already fired this session. ctx_level=<pct>, five=<reset>, week=<reset>.
ctx_level=0; five_fired=""; week_fired=""
if [ -r "$state" ]; then
  while IFS='=' read -r k v; do
    case "$k" in
      ctx_level) ctx_level=$(int_or "$v" 0) ;;
      five) five_fired="$v" ;;
      week) week_fired="$v" ;;
    esac
  done < "$state"
fi

msgs=()
dirty=""
# Context fell below the budget after a warning (a compaction, /clear): clear
# the mark, so crossing the budget again warns again.
if [ -n "$ctx" ] && [ "$ctx" -lt "$budget" ] && [ "$ctx_level" -gt 0 ]; then
  ctx_level=0
  dirty=1
fi
if [ -n "$ctx" ] && [ ! -e "$ok" ] && [ "$ctx" -ge "$budget" ]; then
  level=$(( budget + (ctx - budget) / step * step ))
  if [ "$level" -gt "$ctx_level" ]; then
    ctx_level=$level
    msgs+=("Session budget: context is at ${ctx}% (budget ${budget}%, next warning at $(( level + step ))%). Post the hand-off on the run's item now, in the HANDOFF format of the maybloom-stack-delegate skill (branch and head, open findings, what was verified with the exact commands, known limits, next step), and propose stopping. Never stop mid-fix: finish the current edit and its re-verification first. Go on past the budget only if the project owner says so in this session; if they do, run \`touch ${ok}\` and these context warnings stop.")
  fi
fi
if [ -n "$five" ] && [ "$five" -ge "$five_warn" ] && [ "$five_fired" != "${five_resets:--}" ]; then
  five_fired="${five_resets:--}"
  msgs+=("Usage: the 5-hour window is at ${five}% (warning from ${five_warn}%). Finish the current step, post the hand-off on the run's item, and start nothing new.")
fi
if [ -n "$week" ] && [ "$week" -ge "$week_warn" ] && [ "$week_fired" != "${week_resets:--}" ]; then
  week_fired="${week_resets:--}"
  msgs+=("Usage: the weekly window is at ${week}% (warning from ${week_warn}%). Finish the current step, post the hand-off on the run's item, and start nothing new.")
fi

[ "${#msgs[@]}" -gt 0 ] || [ -n "$dirty" ] || exit 0
printf 'ctx_level=%s\nfive=%s\nweek=%s\n' "$ctx_level" "$five_fired" "$week_fired" > "$state.$$" \
  && mv -f "$state.$$" "$state"
find "$state_dir" -type f -mtime +7 -delete 2>/dev/null
[ "${#msgs[@]}" -gt 0 ] || exit 0
jq -n --arg ctx "$(printf '%s\n\n' "${msgs[@]}")" \
  '{hookSpecificOutput: {hookEventName: "UserPromptSubmit", additionalContext: ($ctx | rtrimstr("\n\n"))}}'
exit 0
