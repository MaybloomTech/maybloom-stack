# affectUI

[affectui.com](https://affectui.com); source at
[github.com/flohoeller/affectui](https://github.com/flohoeller/affectui).
Interface patterns for tools people use alongside agents.

**Lends to:** app screens, agent-facing tools in particular (a queue of
things an agent wants decided, a run in progress). Both a register and a
vocabulary.

## Register

- Inter at 13px: small, even, tabular where it counts.
- Hairlines at about 6% black; separation by rule, not by shadow.
- Radii of 6 to 10px.
- One blue accent, for the primary action and the selection.
- A sidebar shell with a right pane for the selected item: list on the
  left, detail on the right, the URL carrying the selection. On a phone
  the pane becomes its own screen.

The register suits a dense, quiet tool; it is wrong for a page that should
persuade.

## Vocabulary and licence

Each item with its licence status:

- **Decision Inbox**: a queue of things waiting on a person, each with the
  choice offered inline. open (MIT)
- **Tool Call Card**: one card per call an agent made, with its input,
  result and state. open (MIT)
- **Agent Inbox**: closed (Pro)
- **Agent Lanes**: one lane per step of a run. closed (Pro)
- **Agent Tree**: a run and the runs it started, nested. closed (Pro)
- **Agent Steering**: a way to redirect a run in progress. closed (Pro)
- **Decision Tree**: closed (Pro)
- **Agent Run screen**: one run, its status and its output. closed (Pro)

The rule: nothing that is not marked open is copied, and everything is
built from the public docs. Even the open items are a source of shape, not
of code: no affectUI code is copied into a project, and a pass writes its
own React Native components. (A component in a project that is modelled on
Agent Lanes is the project's own, under its own name.)
