# Plans

One file per piece of work that needs a plan before code:
`docs/plans/YYYY-MM-DD-<slug>.md`, dated the day it is written. A plan is
for this repository's readers only; it may name the work items it
covers and quote the decisions taken on them.

## Header

```markdown
# <Title>

**Date**: YYYY-MM-DD
**Status**: Draft | Decided | In progress | Built | Superseded
**Card(s)**: <the tracker ids this plan covers>
**Supersedes**: <an earlier plan's file, or "none">
```

Move the status forward as the work does; a superseded plan stays, with
the plan that replaced it named at the top.

## Sections

- **Why**: the problem, with the evidence.
- **Decisions**: each one decided, with who decided it and when, quoted
  where it came from a comment; an undecided point is an open question,
  not a decision.
- Then whatever the work needs: the change, by file or by area; the
  order; what is verified and how; what is out of scope.
