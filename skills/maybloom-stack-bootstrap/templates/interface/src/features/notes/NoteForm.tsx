import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button, Card, TextField } from "../../components/primitives";
import { colors, spacing, typography } from "../../styles/tokens";

// The new-note form. It owns its fields and hands them to onSubmit, which
// rejects when the save fails; the form keeps what was typed and says so.
export function NoteForm({
  onSubmit,
}: {
  onSubmit: (input: { title: string; body: string }) => Promise<unknown>;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const submit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    setFailed(false);
    try {
      await onSubmit({ title, body });
      setTitle("");
      setBody("");
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <TextField placeholder="Title" value={title} onChangeText={setTitle} />
      <TextField
        placeholder="Body"
        value={body}
        onChangeText={setBody}
        multiline
      />
      {failed ? (
        <Text style={[typography.caption, styles.error]}>
          Could not save the note. Try again.
        </Text>
      ) : null}
      <View style={styles.actions}>
        <Button
          label={saving ? "Adding…" : "Add note"}
          disabled={saving || !title.trim()}
          onPress={submit}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  actions: { alignItems: "flex-start" },
  error: { color: colors.danger, marginTop: spacing.xs },
});
