/**
 * Reads any table file into CSV text for the importer:
 * - spreadsheets (Excel .xlsx/.xlsm/.xlsb/.xls, OpenDocument .ods, Apple
 *   Numbers) with SheetJS, loaded only when such a file is imported;
 * - text tables (.csv, .tsv, .txt, with commas, semicolons or tabs) decoded
 *   in their encoding: UTF-8, UTF-16 or the Windows-1252 Excel uses for
 *   "CSV (Comma delimited)" on Windows.
 */
import * as Papa from "papaparse";
// Types only: SheetJS itself is loaded on demand (import("xlsx") below)
import type * as SheetJSModule from "xlsx";

/** File types offered by the file picker (MIME type → extensions) */
export const ACCEPTED_TABLE_FILES: Record<string, string[]> = {
  "text/csv": [".csv"],
  "text/tab-separated-values": [".tsv"],
  "text/plain": [".txt"],
  // Windows reports Excel-made CSV files as application/vnd.ms-excel too
  "application/vnd.ms-excel": [".xls", ".csv"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
    ".xlsx",
  ],
  "application/vnd.ms-excel.sheet.macroEnabled.12": [".xlsm"],
  "application/vnd.ms-excel.sheet.binary.macroEnabled.12": [".xlsb"],
  "application/vnd.oasis.opendocument.spreadsheet": [".ods"],
  "application/vnd.apple.numbers": [".numbers"],
};

const SPREADSHEET_EXTENSIONS = /\.(xlsx|xlsm|xlsb|xls|ods|fods|numbers)$/i;

/** ZIP (xlsx, ods, numbers) or OLE2 (xls) container, whatever its name */
const looksLikeSpreadsheet = (bytes: Uint8Array) =>
  (bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04) ||
  (bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0);

/** A file the importer cannot read, and why */
export class TableFileError extends Error {
  constructor(readonly reason: "empty" | "unreadable" | "protected") {
    super(reason);
    this.name = "TableFileError";
  }
}

/** Text of a text table, whatever its encoding */
export const decodeText = (bytes: Uint8Array): string => {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes);
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes);
  }
  try {
    // A UTF-8 byte-order mark is dropped by the decoder
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
};

const pad = (value: number) => String(value).padStart(2, "0");

/**
 * A spreadsheet date as YYYY-MM-DD (and HH:MM when it has a time): a format
 * the importer reads without guessing whether the day or the month is first.
 */
const dateText = (y: number, m: number, d: number, H = 0, M = 0) =>
  `${y}-${pad(m)}-${pad(d)}${H || M ? ` ${pad(H)}:${pad(M)}` : ""}`;

type SheetJS = typeof SheetJSModule;
type Sheet = SheetJSModule.WorkSheet;
type Cell = SheetJSModule.CellObject;

const cellText = (XLSX: SheetJS, cell: Cell | undefined): string => {
  if (!cell || cell.v === undefined || cell.v === null) return "";
  switch (cell.t) {
    case "n": {
      const value = cell.v as number;
      if (cell.z && XLSX.SSF.is_date(cell.z)) {
        const date = XLSX.SSF.parse_date_code(value);
        if (date) {
          return value < 1
            ? `${pad(date.H)}:${pad(date.M)}`
            : dateText(date.y, date.m, date.d, date.H, date.M);
        }
      }
      // The raw number: "4500000", not the displayed "₦4,500,000.00"
      return String(value);
    }
    case "d": {
      const date = cell.v as Date;
      const utcMidnight =
        date.getUTCHours() === 0 &&
        date.getUTCMinutes() === 0 &&
        date.getUTCSeconds() === 0;
      return utcMidnight
        ? dateText(
            date.getUTCFullYear(),
            date.getUTCMonth() + 1,
            date.getUTCDate(),
          )
        : dateText(date.getFullYear(), date.getMonth() + 1, date.getDate());
    }
    case "b":
      return cell.v ? "TRUE" : "FALSE";
    case "e":
      return "";
    default:
      return String(cell.v).trim();
  }
};

const MAX_ROWS = 100_000;
const MAX_COLUMNS = 200;

/** The rows of a sheet, without the blank ones at the top or the bottom */
const sheetRows = (XLSX: SheetJS, sheet: Sheet | undefined): string[][] => {
  if (!sheet?.["!ref"]) return [];
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const lastRow = Math.min(range.e.r, range.s.r + MAX_ROWS - 1);
  const lastColumn = Math.min(range.e.c, range.s.c + MAX_COLUMNS - 1);
  const rows: string[][] = [];
  for (let r = range.s.r; r <= lastRow; r++) {
    const row: string[] = [];
    for (let c = range.s.c; c <= lastColumn; c++) {
      row.push(cellText(XLSX, sheet[XLSX.utils.encode_cell({ r, c })]));
    }
    rows.push(row);
  }
  const isBlank = (row: string[]) => row.every((cell) => cell === "");
  while (rows.length && isBlank(rows[0])) rows.shift();
  while (rows.length && isBlank(rows[rows.length - 1])) rows.pop();
  return rows;
};

export type TableFile = {
  /** The table as CSV text */
  text: string;
  /** The sheet that was read, for workbooks */
  sheetName?: string;
};

/**
 * Reads a table file. `scoreRows` rates the first rows of each sheet (how many
 * columns it recognises): a workbook's best-rated sheet is imported, the
 * first one on a tie.
 */
export const readTableFile = async (
  file: File,
  scoreRows?: (rows: string[][]) => number,
): Promise<TableFile> => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length === 0) throw new TableFileError("empty");
  if (!SPREADSHEET_EXTENSIONS.test(file.name) && !looksLikeSpreadsheet(bytes)) {
    const text = decodeText(bytes);
    if (!text.trim()) throw new TableFileError("empty");
    return { text };
  }

  const XLSX = await import("xlsx");
  let workbook: SheetJSModule.WorkBook;
  try {
    workbook = XLSX.read(bytes, {
      type: "array",
      cellNF: true,
      cellDates: false,
    });
  } catch (error) {
    console.error(error);
    // SheetJS: "File is password-protected", "ECMA-376 Encrypted file…",
    // "Unsupported ODS Encryption"… Anything else is a damaged file.
    throw new TableFileError(
      /password|ECMA-376 Encrypted|ODS Encryption|Encryption scheme/i.test(
        String((error as Error)?.message ?? error),
      )
        ? "protected"
        : "unreadable",
    );
  }

  const sheets = workbook.SheetNames.map((name) => ({
    name,
    rows: sheetRows(XLSX, workbook.Sheets[name]),
  })).filter(({ rows }) => rows.length > 0);
  if (!sheets.length) throw new TableFileError("empty");

  let best = sheets[0];
  if (scoreRows && sheets.length > 1) {
    let bestScore = scoreRows(best.rows.slice(0, 15));
    for (const sheet of sheets.slice(1)) {
      const score = scoreRows(sheet.rows.slice(0, 15));
      if (score > bestScore) {
        best = sheet;
        bestScore = score;
      }
    }
  }
  return { text: Papa.unparse(best.rows), sheetName: best.name };
};
