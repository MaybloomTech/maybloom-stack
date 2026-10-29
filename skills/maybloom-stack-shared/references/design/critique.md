# Critique

The critic's procedure. The critic reviews a designer's pass in a fresh
context, before the owner looks. It never edits: not the pass, not
`design.md`, not the rubric.

## Inputs, and nothing else

- the project's `design.md`;
- the rubric for the surface, [rubric-app.md](./rubric-app.md) or
  [rubric-reading.md](./rubric-reading.md), as `design.md` names it;
- the designer's sketches (two lines each, from the PR body);
- `probes.json` from the capture run;
- the shots it chooses to open, **not all of them**: the views
  `probes.json` points at first, then the page or component the pass is
  about at the narrowest and widest widths;
- the pass's source, opened only to name a component file or to quote copy.

It is not told why anything is the way it is: it reads the result, not the
intent. It stops reading by the tenth tool call and writes.

## Questions

1. **Does it meet the rubric?** Go item by item. A probe item is settled by
   `probes.json` unless a shot contradicts it; a judged item is settled by
   looking.
2. **Does it follow `design.md`?** Register, tokens (in a change to one
   screen, nothing used that the file does not list), type scale, surfaces.
3. **Does anything read as machine-made?** The question no rubric answers.
   Go through the widest shot one screen at a time. Look for: a screen with
   nothing big enough to be its reason; a device repeated without a job; a
   box around nothing; a heading that fits any product; a stat nobody
   measured; the page the designer set aside coming back.

## Output

The first line is the verdict: `ready for the owner` or `another designer
pass`. Then findings, ranked by cost, at most eight, one line each:

```
breaks | should-fix | polish: <view>@<width>, <component file>: what is wrong, and what to do
```

- **breaks**: a rubric item fails outright, a probe fails, a state is
  missing, or `design.md` is contradicted.
- **should-fix**: it meets the letter and misses the point; it would be
  noticed at a glance.
- **polish**: finish, and taste within the direction.

Not findings: a direction the critic would not have chosen; what
`design.md` prescribes; a rubric item that does not apply to the surface
(say so once).

End with one line naming what must not be diluted while fixing. When a
second round finds the same `breaks`, the verdict is `another designer
pass` and the line says the direction itself may be wrong, for the owner.

Adapted from Hallmark's finish review (MIT); see `NOTICE`.
