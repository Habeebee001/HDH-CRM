import * as Papa from "papaparse";
import { useCallback, useMemo, useRef, useState } from "react";

import { findHeaderRow } from "../dataImport/columnMapping";
import { describeImportError } from "../dataImport/describeImportError";
import { readTableFile, TableFileError } from "../dataImport/readTableFile";

/**
 * What a batch reports: the number of records created, or that number with the
 * errors of the rows that were refused, whose first reason is shown to the user.
 */
export type ImportBatchResult = number | { created: number; errors: unknown[] };

/** A file refused before any row is imported, with the message explaining why. */
export class ImportFileError extends Error {
  constructor(
    readonly messageKey: string,
    readonly messageArgs: Record<string, string>,
  ) {
    super(messageArgs._ ?? messageKey);
    this.name = "ImportFileError";
  }
}

/** Column names derived from the header row, or the reason to refuse the file */
type ColumnPlan = {
  names: string[];
  matched?: Record<string, string>;
  problem?: { messageKey: string; messageArgs: Record<string, string> };
};

/** The first rows of a table, blank ones included (indexes are row numbers) */
const firstRows = (text: string, count: number): string[][] =>
  Papa.parse<string[]>(text, {
    preview: count,
    skipEmptyLines: false,
  }).data.map((row) => row.map((cell) => String(cell ?? "")));

/**
 * The table from its header row on: title rows above it are not records.
 * Whole rows are dropped and the rest written back as CSV, which is exact
 * whatever the line endings or the line breaks inside quoted cells (Papa
 * Parse's cursor can stop one row too far with Windows line endings).
 */
const fromRow = (text: string, row: number) => {
  if (row <= 0) return text;
  const rows = Papa.parse<string[]>(text, { skipEmptyLines: false }).data;
  return Papa.unparse(rows.slice(row));
};

const FILE_PROBLEMS = {
  empty: [
    "crm.data_import.problem.empty",
    "This file is empty: there is no table to import.",
  ],
  unreadable: [
    "crm.data_import.problem.unreadable",
    "This file could not be read. Make sure it is an Excel, OpenDocument, Numbers or CSV file, then try again.",
  ],
  protected: [
    "crm.data_import.problem.protected",
    "This file is protected by a password. Open it, remove the password (in Excel: File → Info → Protect Workbook), save it and try again.",
  ],
} as const;

export type ImportState =
  | {
      state: "idle";
    }
  | {
      state: "parsing";
    }
  | {
      state: "running" | "complete";

      rowCount: number;
      importCount: number;
      errorCount: number;

      // The remaining time in milliseconds
      remainingTime: number | null;

      // Why the first refused row was not imported, in plain language
      firstError: string | null;
    }
  | {
      state: "error";

      error: Error;
    };

type usePapaParseProps<T> = {
  // The import batch size
  batchSize?: number;

  // Columns to keep as text, because a leading zero is meaningful there
  textColumns?: string[];

  // Renames the columns from the header row, or refuses the file
  planColumns?: (headers: string[]) => ColumnPlan;

  // processBatch returns the number of imported items
  processBatch(batch: T[]): Promise<ImportBatchResult>;
};

export function usePapaParse<T>({
  batchSize = 10,
  textColumns,
  planColumns,
  processBatch,
}: usePapaParseProps<T>) {
  const importIdRef = useRef<number>(0);

  const [importer, setImporter] = useState<ImportState>({
    state: "idle",
  });

  const reset = useCallback(() => {
    setImporter({
      state: "idle",
    });
    importIdRef.current += 1;
  }, []);

  const parseCsv = useCallback(
    async (file: File) => {
      setImporter({
        state: "parsing",
      });

      const importId = importIdRef.current;

      // Any table file (Excel, OpenDocument, Numbers, CSV…) becomes CSV text.
      // In a workbook, the sheet where the most columns are recognised wins.
      let text: string;
      try {
        ({ text } = await readTableFile(
          file,
          planColumns
            ? (rows) =>
                Object.keys(
                  planColumns(rows[findHeaderRow(rows, planColumns)] ?? [])
                    .matched ?? {},
                ).length
            : undefined,
        ));
      } catch (error) {
        console.error(error);
        if (importIdRef.current !== importId) return;
        const [key, message] =
          FILE_PROBLEMS[
            error instanceof TableFileError ? error.reason : "unreadable"
          ];
        setImporter({
          state: "error",
          error: new ImportFileError(key, { _: message }),
        });
        return;
      }
      if (importIdRef.current !== importId) return;

      // Read the header row first: a file missing a required column is refused
      // with an explanation instead of failing on every row.
      let columnNames: string[] | undefined;
      let headerRow = 0;
      if (planColumns) {
        try {
          const rows = firstRows(text, 15);
          headerRow = findHeaderRow(rows, planColumns);
          const plan = planColumns(rows[headerRow] ?? []);
          if (importIdRef.current !== importId) return;
          if (plan.problem) {
            setImporter({
              state: "error",
              error: new ImportFileError(
                plan.problem.messageKey,
                plan.problem.messageArgs,
              ),
            });
            return;
          }
          columnNames = plan.names;
        } catch (error) {
          console.error(error);
          setImporter({ state: "error", error: error as Error });
          return;
        }
      }

      Papa.parse<T>(fromRow(text, headerRow), {
        header: true,
        // Rows holding only separators (",,,,") are left over by spreadsheets
        skipEmptyLines: "greedy",
        transformHeader: columnNames
          ? (header, index) => columnNames[index] ?? header
          : undefined,
        async complete(results) {
          if (importIdRef.current !== importId) {
            return;
          }

          // Papa Parse reports rows with missing or extra cells, but still
          // returns them: they are imported, so they are not errors.
          setImporter({
            state: "running",
            rowCount: results.data.length,
            errorCount: 0,
            importCount: 0,
            remainingTime: null,
            firstError: null,
          });

          let totalTime = 0;
          for (let i = 0; i < results.data.length; i += batchSize) {
            if (importIdRef.current !== importId) {
              return;
            }

            const batch = results.data.slice(i, i + batchSize);
            try {
              const start = Date.now();
              // A batch reports how many of its rows the backend accepted, so
              // the rows it refused count as errors while the records that did
              // land are not reported as failures.
              const result = await processBatch(batch);
              const created =
                typeof result === "number" ? result : result.created;
              const refusal =
                typeof result === "number" ? undefined : result.errors[0];
              totalTime += Date.now() - start;

              const meanTime = totalTime / (i + batch.length);
              setImporter((previous) => {
                if (previous.state === "running") {
                  const importCount = previous.importCount + created;
                  const errorCount =
                    previous.errorCount + (batch.length - created);
                  return {
                    ...previous,
                    importCount,
                    errorCount,
                    firstError:
                      previous.firstError ??
                      (refusal === undefined
                        ? created < batch.length
                          ? "the server refused some rows"
                          : null
                        : describeImportError(refusal)),
                    remainingTime:
                      meanTime *
                      (results.data.length - importCount - errorCount),
                  };
                }
                return previous;
              });
            } catch (error) {
              console.error("Failed to import batch", error);
              setImporter((previous) =>
                previous.state === "running"
                  ? {
                      ...previous,
                      errorCount: previous.errorCount + batch.length,
                      firstError:
                        previous.firstError ?? describeImportError(error),
                    }
                  : previous,
              );
            }
          }

          setImporter((previous) =>
            previous.state === "running"
              ? {
                  ...previous,
                  state: "complete",
                  remainingTime: null,
                }
              : previous,
          );
        },
        // Numeric-looking cells are converted, except where a leading zero
        // carries meaning: a "02134" zipcode would be stored as 2134.
        dynamicTyping: (field) => !textColumns?.includes(String(field)),
      });
    },
    [batchSize, planColumns, processBatch, textColumns],
  );

  return useMemo(
    () => ({
      importer,
      parseCsv,
      reset,
    }),
    [importer, parseCsv, reset],
  );
}
