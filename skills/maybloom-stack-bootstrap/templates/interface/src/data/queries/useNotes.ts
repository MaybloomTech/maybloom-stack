import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createNote,
  deleteNote,
  listNotes,
} from "../api/notes";

const NOTES_KEY = ["notes"] as const;

export function useNotes() {
  return useQuery({
    queryKey: NOTES_KEY,
    queryFn: listNotes,
  });
}

export function useCreateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createNote,
    onSuccess: () => qc.invalidateQueries({ queryKey: NOTES_KEY }),
  });
}

export function useDeleteNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteNote,
    onSuccess: () => qc.invalidateQueries({ queryKey: NOTES_KEY }),
  });
}
