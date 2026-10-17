import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { NotesScreen } from '../features/notes/NotesScreen';
import { PageFrame, Play, type PlayStep } from './fake';
import type { FakeOptions } from './fixtures/backend';
import {
  Sheet,
  type SheetProps,
  SpecimenSection,
  specimenInset,
} from './layout';

/** One page in one state: the route it is, and the backend it runs on. */
type PageState = { label: string; options: FakeOptions; steps?: PlayStep[] };

/** Every page, by route, in the states its backend can put it in. */
const pages: { route: string; Page: () => ReactNode; states: PageState[] }[] = [
  {
    route: '/ (NotesScreen)',
    Page: NotesScreen,
    states: [
      { label: 'notes', options: { scenario: 'notes' } },
      { label: 'empty', options: { scenario: 'empty' } },
      { label: 'a full page', options: { scenario: 'long' } },
      { label: 'loading', options: { scenario: 'loading' } },
      { label: 'error', options: { scenario: 'error' } },
      {
        label: 'adding a note fails',
        options: { scenario: 'notes', failing: ['createNote'] },
        steps: [
          { fill: 'Title', text: 'Call the plumber' },
          'Add note',
          { expect: 'Could not save the note.' },
        ],
      },
    ],
  },
];

export function PageSheet({ width }: SheetProps) {
  // The frame is the page at the board's width, so the sheet is wider by
  // the specimen box around it.
  return (
    <Sheet width={width + 2 * specimenInset}>
      <Text>
        Whole pages at the chosen width, each on its own fake backend.
      </Text>
      {pages.map(({ route, Page, states }) => (
        <SpecimenSection
          key={route}
          tab="pages"
          title={route}
          wide
          specimens={states.map((s) => {
            const page = (
              <PageFrame width={width} {...s.options}>
                <Page />
              </PageFrame>
            );
            return {
              label: s.label,
              node: s.steps ? <Play steps={s.steps}>{page}</Play> : page,
            };
          })}
        />
      ))}
    </Sheet>
  );
}
