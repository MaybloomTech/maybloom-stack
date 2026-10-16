import type { Timestamp } from "@bufbuild/protobuf/wkt";
import { timestampDate, timestampFromDate } from "@bufbuild/protobuf/wkt";

export function toTimestamp(value?: Date | null): Timestamp | undefined {
  if (!value) {
    return undefined;
  }
  return timestampFromDate(value);
}

export function toDate(value?: Timestamp): Date | undefined {
  if (!value) {
    return undefined;
  }
  return timestampDate(value);
}
