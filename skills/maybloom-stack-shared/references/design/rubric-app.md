# Rubric: app screens

For a screen someone works in: a list, a form, a dashboard, a settings
page, an admin. The bar is earned familiarity: the tool disappears into the
task, and someone fluent in the category trusts it at once.

Each item is marked **probe** where the capture script checks it
mechanically (its output in `probes.json`), and **judged** where a person
or the critic decides from the shots. A passing probe means the mechanical
failure is absent, not that the rule is met.

## Colour and type

1. **Restrained colour.** The accent marks the primary action and the
   current selection, nothing else; a second neutral carries sidebars,
   toolbars and panels. **judged**
2. **Text contrast** of at least 4.5:1 (3:1 for large text, 24px or
   18.66px bold) against its background, in every state the board shows.
   **probe** (contrast)
3. **One family**, often a system face or a familiar sans; a fixed scale at
   a ratio of about 1.125 to 1.2; no display face on labels, buttons or
   data. **judged**
4. **No eyebrow labels**, and no tracked capitals on a table head: heads are
   sentence case. **judged**
5. **Figures in tabular numerals** where they align in a column. **judged**

## Density and controls

6. **Controls are 32 to 40 high** with a hit target of 44 (hit slop on
   native, padding on the web). A phone is not a reason to enlarge every
   control to 56. **judged**
7. **Tables before cards.** Rows of the same shape are a table or a dense
   list, not a grid of cards. On a phone, the column that names the row and
   the one that acts on it stay in view; the rest restack as labelled
   lines. **judged**
8. **One container recipe.** One radius per kind of box, borders or shadows
   but not both, no card inside a card. **judged**
9. **No horizontal overflow** at 390, 768 and 1280. **probe** (overflow)
10. **No interactive element inside another** (a button in a row that is
    itself a button). **probe** (nested)

## States

11. **Four states for every region that loads data:**
    - loading, in the shape of what is coming (rows, not a spinner on an
      empty page);
    - empty, naming what belongs here and offering the one action that
      fills it, never a bare "No results";
    - error, saying what broke and what to do, with a retry where one helps;
    - full.

    A design that draws only the full state has drawn a quarter of the
    screen. **judged**
12. **Eight states on controls:** default, hover, focus, active, disabled,
    loading, error, success. A disabled control near the user's attention
    says why. **judged**
13. **A keyboard-only focus ring** on every tab stop, absent after a
    pointer click. **probe** (focus)
14. **No console warnings or errors** while the views render. **probe**
    (console)

## Behaviour

15. **State lives in the URL:** filters, tabs, selection, pagination, so a
    reload or a shared link returns to the same view. **judged**
16. **Destructive actions are undone or confirmed.** A reversible one runs
    at once and offers Undo for several seconds; an irreversible one asks,
    and names the thing destroyed. **judged**
17. **Motion is state, never decoration.** Short transitions that say
    something changed; nothing orchestrated, nothing on load. **judged**

## Content and structure

18. **Figures are the product's own.** A stat is a figure and its label; no
    icon tile, no gradient, no trend arrow nobody measured, no invented
    number. Fixtures that stand in for data are plausible. **judged**
19. **The shell is earned.** A top bar by default; a sidebar only past about
    seven destinations, collapsing to a menu on a phone. Tabs, breadcrumbs
    and a command palette are preferred to anything invented; a modal is the
    last answer, after inline editing and disclosure. **judged**
20. **The signature object of the tool.** The one thing this product is
    known by (the ledger, the timeline, the queue) is on the main screen and
    given the room. A greeting above four stat cards is not one. **judged**

Adapted from Hallmark's app-screen rules (MIT); see `NOTICE`.
