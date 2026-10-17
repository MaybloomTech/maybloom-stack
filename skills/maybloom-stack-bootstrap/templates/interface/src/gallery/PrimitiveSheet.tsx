import { useState } from "react";
import { Text, View } from "react-native";
import * as primitives from "../components/primitives";
import { Button, Card, TextField } from "../components/primitives";
import { sampleBody } from "../design/samples";
import { type SheetProps, type Specimen, Sheet, SpecimenSection } from "./layout";

const noop = () => {};

/** A field that keeps what is typed, as a screen would. */
function LiveField(props: { placeholder: string; multiline?: boolean }) {
  const [value, setValue] = useState("");
  return <TextField {...props} value={value} onChangeText={setValue} />;
}

// ---------------------------------------------------------------------------
// Coverage: keyed by every export of the primitives barrel, so a new
// primitive fails the typecheck until it has an entry here.

const entries: Record<keyof typeof primitives, Specimen[]> = {
  Button: [
    { label: "primary", node: <Button label="Save" onPress={noop} /> },
    {
      label: "secondary",
      node: <Button label="Cancel" variant="secondary" onPress={noop} />,
    },
    { label: "disabled", node: <Button label="Save" disabled onPress={noop} /> },
  ],
  Card: [
    { label: "with body text", node: <Card>{sampleBody}</Card> },
    {
      label: "holding controls",
      node: (
        <Card>
          <LiveField placeholder="Title" />
          <View style={{ alignItems: "flex-start" }}>
            <Button label="Save" onPress={noop} />
          </View>
        </Card>
      ),
    },
  ],
  TextField: [
    { label: "empty, with placeholder", node: <LiveField placeholder="Title" /> },
    {
      label: "multiline",
      node: <LiveField placeholder="Body" multiline />,
    },
    {
      label: "filled",
      node: (
        <TextField value="Call the plumber" onChangeText={noop} />
      ),
    },
  ],
};

export function PrimitiveSheet({ width }: SheetProps) {
  return (
    <Sheet width={width}>
      <Text>The building blocks, from src/components/primitives.</Text>
      {(Object.keys(entries) as (keyof typeof entries)[]).map((name) => (
        <SpecimenSection
          key={name}
          tab="primitives"
          title={name}
          specimens={entries[name]}
        />
      ))}
    </Sheet>
  );
}
