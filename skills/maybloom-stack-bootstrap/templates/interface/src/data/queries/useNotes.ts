import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useClient } from '../api/client';
import { archiveNote, createNote, listNotes } from '../api/notes';

const NOTES_KEY = ['notes'] as const;

// The first page only: the example screen has no scroll-to-load. A screen that
// pages replaces this with useInfiniteQuery over listNotes(client, pageToken).
export function useNotes() {
  const client = useClient();
  return useQuery({
    queryKey: NOTES_KEY,
    queryFn: () => listNotes(client),
    select: (page) => page.notes,
  });
}

export function useCreateNote() {
  const client = useClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { title: string; body: string }) =>
      createNote(client, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: NOTES_KEY }),
  });
}

export function useArchiveNote() {
  const client = useClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => archiveNote(client, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: NOTES_KEY }),
  });
}
