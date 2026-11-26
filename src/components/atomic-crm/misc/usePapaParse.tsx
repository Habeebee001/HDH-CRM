import * as Papa from "papaparse";
import { useCallback, useMemo, useRef, useState } from "react";

import { describeImportError } from "../dataImport/describeImportError";

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
  problem?: { messageKey: string; messageArgs: Record<string, string> };
};

const readHeaderRow = (file: File) =>
  new Promise<string[]>((resolve, reject) => {
    Papa.parse<string[]>(file, {
      preview: 1,
      skipEmptyLines: "greedy",
      complete: (results) => resolve((results.data[0] ?? []).map(String)),
      error: reject,
    });
  });

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

      // Read the header row first: a file missing a required column is refused
      // with an explanation instead of failing on every row.
      let columnNames: string[] | undefined;
      if (planColumns) {
        try {
          const plan = planColumns(await readHeaderRow(file));
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

      Papa.parse<T>(file, {
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
        error(error) {
          console.error(error);
          setImporter({
            state: "error",
            error,
          });
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
