import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import { Fake } from '../../gallery/fake';
import { NotesScreen } from './NotesScreen';

// The screen as a user sees it, over the design board's fake backend: the
// same fixtures and scenarios the board shows, answered through the real
// Connect client, so these tests need no server and no mocks.
describe('NotesScreen', () => {
  it('shows the notes the backend has', async () => {
    render(
      <Fake scenario="notes">
        <NotesScreen />
      </Fake>,
    );

    expect(await screen.findByText('Call the plumber')).toBeOnTheScreen();
    expect(screen.getByText('Reading list')).toBeOnTheScreen();
    expect(screen.getByText('Untitled idea')).toBeOnTheScreen();
  });

  it('says so when there are no notes', async () => {
    render(
      <Fake scenario="empty">
        <NotesScreen />
      </Fake>,
    );

    expect(
      await screen.findByText('No notes yet. Add the first one above.'),
    ).toBeOnTheScreen();
  });

  it('shows the error when the backend fails', async () => {
    render(
      <Fake scenario="error">
        <NotesScreen />
      </Fake>,
    );

    expect(await screen.findByText(/Something went wrong/)).toBeOnTheScreen();
    expect(screen.queryByText(/No notes yet/)).not.toBeOnTheScreen();
  });
});
