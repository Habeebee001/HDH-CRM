/**
 * Plain-language reason for a row the import could not create, from the error
 * the importer or the database (through PostgREST) returned.
 */
const FIELD_LABELS: Record<string, string> = {
  name: "name",
  stage: "stage",
  amount: "amount",
  expected_closing_date: "closing date",
};

const messageOf = (error: unknown): string => {
  if (error instanceof Error) {
    const body = (error as { body?: { message?: unknown } }).body;
    return typeof body?.message === "string" && body.message
      ? body.message
      : error.message;
  }
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
};

export const describeImportError = (error: unknown): string => {
  if (error instanceof Error && error.name === "ImportRowError") {
    return error.message;
  }
  const message = messageOf(error);
  let match = /null value in column "([^"]+)"/.exec(message);
  if (match) return `a row has no ${FIELD_LABELS[match[1]] ?? match[1]}`;
  match = /invalid input syntax for type (\w+)/.exec(message);
  if (match) {
    return /^(date|time)/.test(match[1])
      ? "a date is not in a recognised format"
      : "a number column contains text";
  }
  if (/violates check constraint/.test(message)) {
    return "a value is outside the allowed range";
  }
  if (/value too long|out of range/.test(message)) {
    return "a value is too long or too large";
  }
  if (
    /JWT|permission denied|row-level security|not authori[sz]ed/i.test(message)
  ) {
    return "your session has expired: sign in again, then retry";
  }
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(message)) {
    return "the connection was lost: check your internet, then retry";
  }
  return message.length > 160 ? `${message.slice(0, 157)}…` : message;
};
