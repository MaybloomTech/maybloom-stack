import type { NamedExoticComponent, ReactNode } from "react";
import { Text } from "react-native";
import type * as noteForm from "../features/notes/NoteForm";
import { NoteForm } from "../features/notes/NoteForm";
import type * as noteRow from "../features/notes/NoteRow";
import { NoteRow } from "../features/notes/NoteRow";
import type * as notesScreen from "../features/notes/NotesScreen";
import { Play } from "./fake";
import { oneNote } from "./fixtures/notes";
import { type SheetProps, type Specimen, Sheet, SpecimenSection } from "./layout";

// ---------------------------------------------------------------------------
// Coverage: the sheet is keyed by every component the feature modules
// export, so a new one fails the typecheck until it has an entry. A module
// that is new altogether joins the imports and the union below;
// `pnpm check:gallery` fails until it does.

/** The exported components of a module: capitalised, and a function or a memo. */
type ComponentsOf<M> = {
  [K in keyof M]: K extends string
    ? K extends Capitalize<K>
      ? M[K] extends ((props: never) => ReactNode) | NamedExoticComponent<never>
        ? K
        : never
      : never
    : never;
}[keyof M];

type FeatureComponents =
  | ComponentsOf<typeof noteForm>
  | ComponentsOf<typeof noteRow>
  | ComponentsOf<typeof notesScreen>;

type Entry = {
  /** Where it lives under src/features. */
  path: string;
  note?: string;
} & (
  | { specimens: Specimen[] }
  /** Shown elsewhere on the board, and where. */
  | { seen: string }
);

const noop = () => {};
const resolved = async () => {};
const rejected = async () => {
  throw new Error("Could not save that.");
};

const entries: Record<FeatureComponents, Entry> = {
  NoteForm: {
    path: "notes/NoteForm",
    specimens: [
      { label: "empty", node: <NoteForm onSubmit={resolved} /> },
      {
        label: "a save that fails",
        node: (
          <Play steps={[{ fill: "Title", text: "Call the plumber" }, "Add note"]}>
            <NoteForm onSubmit={rejected} />
          </Play>
        ),
      },
    ],
  },
  NoteRow: {
    path: "notes/NoteRow",
    specimens: [
      { label: "with a body", node: <NoteRow note={oneNote()} onArchive={noop} /> },
      {
        label: "archiving",
        node: <NoteRow note={oneNote()} onArchive={noop} archiving />,
      },
    ],
  },
  NotesScreen: { path: "notes/NotesScreen", seen: "Pages" },
};

export function ComponentSheet({ width }: SheetProps) {
  return (
    <Sheet width={width}>
      <Text>Feature components, from src/features, on fixtures.</Text>
      {(Object.keys(entries) as FeatureComponents[]).map((name) => {
        const entry = entries[name];
        return (
          <SpecimenSection
            key={name}
            tab="components"
            title={name}
            note={
              "seen" in entry
                ? `${entry.path}: shown on ${entry.seen}.`
                : [entry.path, entry.note].filter(Boolean).join(". ")
            }
            specimens={"specimens" in entry ? entry.specimens : []}
          />
        );
      })}
    </Sheet>
  );
}
