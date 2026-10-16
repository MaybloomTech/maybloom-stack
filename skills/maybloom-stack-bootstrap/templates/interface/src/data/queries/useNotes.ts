import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { archiveNote, createNote, listNotes } from "../api/notes";

const NOTES_KEY = ["notes"] as const;

// The first page only: the example screen has no scroll-to-load. A screen that
// pages replaces this with useInfiniteQuery over listNotes(pageToken).
export function useNotes() {
  return useQuery({
    queryKey: NOTES_KEY,
    queryFn: () => listNotes(),
    select: (page) => page.notes,
  });
}

export function useCreateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createNote,
    onSuccess: () => qc.invalidateQueries({ queryKey: NOTES_KEY }),
  });
}

export function useArchiveNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: archiveNote,
    onSuccess: () => qc.invalidateQueries({ queryKey: NOTES_KEY }),
  });
}
