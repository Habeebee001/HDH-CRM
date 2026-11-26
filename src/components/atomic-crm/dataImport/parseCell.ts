import type { LabeledValue } from "../types";
import type { ImportCell } from "./types";

/** Trimmed cell content, or undefined when the cell is empty. */
export const toText = (cell: ImportCell): string | undefined => {
  if (cell == null) return undefined;
  const text = String(cell).trim();
  return text === "" ? undefined : text;
};

/** Cell content as a number, or undefined when it is empty or not numeric. */
export const toNumber = (cell: ImportCell): number | undefined => {
  const text = toText(cell);
  if (text === undefined) return undefined;
  const value = Number(text);
  return Number.isFinite(value) ? value : undefined;
};

/**
 * Cell content as a whole number, for the integer columns of the database: an
 * amount of `4500.50` would make PostgREST reject the whole row with
 * `invalid input syntax for type bigint`.
 */
export const toInteger = (cell: ImportCell): number | undefined => {
  const value = toNumber(cell);
  return value === undefined ? undefined : Math.round(value);
};

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

const monthOf = (word: string) => {
  const index = MONTHS.indexOf(word.slice(0, 3).toLowerCase());
  return index === -1 ? undefined : index + 1;
};

const fullYear = (year: string) =>
  year.length === 2 ? 2000 + Number(year) : Number(year);

/**
 * UTC midnight of the given day, or undefined for an impossible one: Date.UTC
 * rolls "February 31" over to March 3, so the result must name the day back.
 */
const utcDate = (year: number, month: number, day: number) => {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? date.toISOString()
    : undefined;
};

/**
 * Cell content as an ISO 8601 date (UTC midnight), or undefined when it is empty
 * or not a date. Accepted formats:
 * - `2026-09-30` (the sample's format), `2026/09/30`, or an ISO timestamp;
 * - `30/09/2026`, `30-09-2026` or `30.09.2026`: day first, as written in
 *   Nigeria, unless the day cannot come first (`09/30/2026`);
 * - `30 Sep 2026`, `30-Sep-2026`, `Sep 30, 2026`, `September 30 2026`.
 *
 * Dates are never read with `new Date(text)`, which uses local midnight: in a
 * timezone ahead of UTC, `2026-09-30` would become `2026-09-29T22:00:00Z`, which
 * a `date` column truncates to the day before.
 */
export const toIsoDate = (cell: ImportCell): string | undefined => {
  const text = toText(cell);
  if (text === undefined) return undefined;
  let match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/.exec(text);
  if (match) return utcDate(+match[1], +match[2], +match[3]);

  match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})$/.exec(text);
  if (match) {
    const [first, second, year] = [+match[1], +match[2], fullYear(match[3])];
    return first > 12 || second <= 12
      ? utcDate(year, second, first)
      : utcDate(year, first, second);
  }

  match =
    /^(\d{1,2})(?:st|nd|rd|th)?[\s-]+([a-z]{3,})\.?,?[\s-]+(\d{4}|\d{2})$/i.exec(
      text,
    );
  if (match) {
    const month = monthOf(match[2]);
    return month ? utcDate(fullYear(match[3]), month, +match[1]) : undefined;
  }

  match =
    /^([a-z]{3,})\.?[\s-]+(\d{1,2})(?:st|nd|rd|th)?,?[\s-]+(\d{4}|\d{2})$/i.exec(
      text,
    );
  if (match) {
    const month = monthOf(match[1]);
    return month ? utcDate(fullYear(match[3]), month, +match[2]) : undefined;
  }
  return undefined;
};

/**
 * Like toIsoDate, but keeps the time of a full ISO timestamp such as the
 * contact export's `2024-07-01T11:54:49.95+00:00`.
 */
export const toIsoDateTime = (cell: ImportCell): string | undefined => {
  const text = toText(cell);
  if (text === undefined) return undefined;
  if (/^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}/.test(text)) {
    const time = Date.parse(text.replace(" ", "T"));
    if (!Number.isNaN(time)) return new Date(time).toISOString();
  }
  return toIsoDate(text);
};

/**
 * Money as a whole number of naira (or of any currency), the way people type
 * it: `4500000`, `4,500,000.00`, `₦4,500,000`, `N4,500,000`, `NGN 4.5m`, `250k`.
 * Undefined when the cell is empty or holds no amount.
 */
export const toAmount = (cell: ImportCell): number | undefined => {
  if (typeof cell === "number") {
    return Number.isFinite(cell) ? Math.round(cell) : undefined;
  }
  const text = toText(cell)
    ?.toLowerCase()
    .replace(/ngn|naira|usd|eur|gbp|[₦$€£]/g, "")
    .replace(/^\s*n(?=\s*[\d.])/, "")
    .replace(/[\s,]/g, "");
  if (!text) return undefined;
  const match = /^(-?\d+(?:\.\d+)?)(k|m|bn|b)?$/.exec(text);
  if (!match) return undefined;
  const multiplier =
    { k: 1e3, m: 1e6, b: 1e9, bn: 1e9 }[match[2] as "k" | "m" | "b" | "bn"] ??
    1;
  return Math.round(Number(match[1]) * multiplier);
};

/** Yes/no cell as a boolean, or undefined when it is empty or unclear. */
export const toBoolean = (cell: ImportCell): boolean | undefined => {
  if (typeof cell === "boolean") return cell;
  const text = toText(cell)?.toLowerCase();
  if (text === undefined) return undefined;
  if (["true", "yes", "y", "1", "x", "on", "subscribed"].includes(text)) {
    return true;
  }
  if (["false", "no", "n", "0", "off", "unsubscribed"].includes(text)) {
    return false;
  }
  return undefined;
};

/** First whole number in the cell: "11-50" → 11, "1,200 staff" → 1200 */
export const toFirstNumber = (cell: ImportCell): number | undefined => {
  if (typeof cell === "number") return Number.isFinite(cell) ? cell : undefined;
  const match = /\d[\d,]*/.exec(toText(cell) ?? "");
  return match ? Number(match[0].replace(/,/g, "")) : undefined;
};

/**
 * Cell content matched against configured options, so a CSV may carry either the
 * stored value ("proposal-sent") or the label users see ("Proposal Sent").
 * Returns undefined when the cell is empty or matches no option.
 */
export const toConfiguredValue = (
  cell: ImportCell,
  options: LabeledValue[],
): string | undefined => {
  const text = toText(cell)?.toLowerCase();
  if (text === undefined) return undefined;
  return options.find(
    (option) =>
      option.value.toLowerCase() === text ||
      option.label.toLowerCase() === text,
  )?.value;
};

/**
 * Cell holding several configured options separated by "," or ";" (the
 * separator the CSV export uses for arrays). Unknown entries are dropped.
 */
export const toConfiguredValues = (
  cell: ImportCell,
  options: LabeledValue[],
): string[] =>
  (toText(cell)?.split(/[,;]/) ?? [])
    .map((entry) => toConfiguredValue(entry, options))
    .filter((value): value is string => value !== undefined);

/**
 * Everyday words for the default deal stages, so a spreadsheet's "Paid" or
 * "Pending" lands in the right column. Only used for stages the pipeline has.
 */
const STAGE_SYNONYMS: Record<string, string[]> = {
  opportunity: [
    "new",
    "lead",
    "open",
    "prospect",
    "prospecting",
    "qualified",
    "enquiry",
    "inquiry",
    "pending",
    "interested",
  ],
  "proposal-sent": [
    "proposal",
    "quote",
    "quoted",
    "quote sent",
    "quotation",
    "quotation sent",
    "invoice sent",
    "sent",
  ],
  "in-negociation": [
    "negotiation",
    "negotiating",
    "in negotiation",
    "discussion",
    "in discussion",
    "in progress",
    "follow up",
  ],
  won: [
    "closed won",
    "paid",
    "completed",
    "complete",
    "done",
    "closed",
    "sold",
    "success",
    "successful",
    "signed",
    "delivered",
    "confirmed",
  ],
  lost: [
    "closed lost",
    "cancelled",
    "canceled",
    "rejected",
    "declined",
    "dead",
    "failed",
    "not interested",
  ],
  delayed: ["on hold", "hold", "paused", "postponed", "stalled", "later"],
};

/** Deal stage from its value, its label, or an everyday word for it. */
export const toStage = (
  cell: ImportCell,
  stages: LabeledValue[],
): string | undefined => {
  const direct = toConfiguredValue(cell, stages);
  if (direct) return direct;
  const text = toText(cell)
    ?.toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
  if (!text) return undefined;
  return Object.entries(STAGE_SYNONYMS).find(
    ([value, words]) =>
      words.includes(text) && stages.some((stage) => stage.value === value),
  )?.[0];
};
