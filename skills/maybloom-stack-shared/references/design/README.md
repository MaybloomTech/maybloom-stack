# Design references

How an interface on the stack gets designed, as opposed to built. The
stack's interface work (contract, hooks, primitives, tests) is covered
elsewhere; these files cover the part before it: what a screen should look
and feel like, how a direction is chosen, and how it is checked.

| File | What it is | Read by |
| --- | --- | --- |
| [loop.md](./loop.md) | The loop end to end, from the design brief to the take | designer, critic, architect |
| [design-md.md](./design-md.md) | The `design.md` convention: one locked file per project | designer, critic, architect |
| [rubric-app.md](./rubric-app.md) | Rules for screens someone works in | designer, critic |
| [rubric-reading.md](./rubric-reading.md) | Rules for pages someone reads | designer, critic |
| [critique.md](./critique.md) | The critic's procedure and output | critic |
| [inspiration/](./inspiration/README.md) | Sources to draw a register or a vocabulary from, tagged by screen kind | designer |
| [../paths/client-expo/design.md](../paths/client-expo/design.md) | The React Native translation: tokens, the pass folder, the take, gotchas | designer, builder |

Order of reading:

- **The architect** writing a design brief reads `loop.md` (what the
  brief must contain) and `design-md.md` (whether the project has one).
- **The designer** reads `loop.md`, then `design-md.md`, then the rubric
  for the surface, then the inspiration entries that fit, then the path's
  `design.md` before writing any code.
- **The critic** reads `critique.md` first, then the project's `design.md`
  and the rubric it names. It does not need `loop.md` past its own step.
- **The builder** doing the take reads the path's `design.md`.

The framework-independent files describe decisions; each client path says
how they land in its framework. Only `client-expo` has a translation.

The loop is adapted from Hallmark (MIT); see the repository's `NOTICE`.
