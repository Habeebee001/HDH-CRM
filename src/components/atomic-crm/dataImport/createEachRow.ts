import type { ImportBatchResult } from "../misc/usePapaParse";

/**
 * A row the importer refuses before sending it, e.g. a deal without a name: the
 * message is shown to the user as the reason the row was not imported.
 */
export class ImportRowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportRowError";
  }
}

/** A create that fails at once, for a row the importer refuses. */
export const refuseRow = (reason: string): Promise<never> =>
  Promise.reject(new ImportRowError(reason));

/**
 * Creates one record per row and reports how many actually landed, with the
 * reasons of the rows that did not.
 *
 * `Promise.all` would reject on the first row the database refuses while the
 * other creates have already fired, so `usePapaParse` counted a whole batch as
 * failed even though most of its records existed — users then fixed the file
 * and re-imported, duplicating everything that had gone through. Settling every
 * create instead keeps the report in line with what was written.
 */
export const createEachRow = async (
  creates: Promise<unknown>[],
): Promise<Exclude<ImportBatchResult, number>> => {
  const results = await Promise.allSettled(creates);
  const errors = results
    .filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    )
    .map(({ reason }) => reason as unknown);
  for (const reason of errors) {
    if (!(reason instanceof ImportRowError)) {
      console.error("Failed to import a row", reason);
    }
  }
  return { created: results.length - errors.length, errors };
};
