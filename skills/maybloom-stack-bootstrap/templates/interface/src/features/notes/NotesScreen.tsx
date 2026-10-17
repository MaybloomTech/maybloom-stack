import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, spacing, typography } from '../../styles/tokens';
import { useViewport } from '../../styles/viewport';
import { NoteForm } from './NoteForm';
import { NoteRow } from './NoteRow';
import {
  errorMessage,
  useArchiveNote,
  useCreateNote,
  useNotes,
} from './useNotes';

// The notes page: the form, then the first page of notes. The route
// (app/index.tsx) renders it, and so does the gallery's Pages tab, against
// a fake backend.
export function NotesScreen() {
  const { data: notes, isLoading, error: loadError } = useNotes();
  const createNote = useCreateNote();
  const archiveNote = useArchiveNote();
  const error = loadError ?? archiveNote.error;
  const { width } = useViewport();
  // One column, centred and capped on a wide window.
  const column = Math.min(width, 640);

  return (
    <View style={styles.container}>
      <View style={[styles.column, { width: column }]}>
        <NoteForm onSubmit={createNote.mutateAsync} />
        {error ? (
          <Text style={[typography.body, styles.error]}>
            Something went wrong: {errorMessage(error)}
          </Text>
        ) : null}
        {isLoading ? (
          <ActivityIndicator />
        ) : (
          <FlatList
            data={notes}
            keyExtractor={(n) => n.id}
            ListEmptyComponent={
              error ? null : (
                <Text style={[typography.body, styles.empty]}>
                  No notes yet. Add the first one above.
                </Text>
              )
            }
            renderItem={({ item }) => (
              <NoteRow
                note={item}
                archiving={
                  archiveNote.isPending && archiveNote.variables === item.id
                }
                onArchive={() => archiveNote.mutate(item.id)}
              />
            )}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.screen,
  },
  column: { flex: 1, padding: spacing.lg, gap: spacing.lg },
  error: { color: colors.danger },
  empty: { color: colors.textSecondary, paddingVertical: spacing.lg },
});
