import type { ImportBatchResult } from "../misc/usePapaParse";
import type { ColumnPlan } from "./columnMapping";
import type { ImportableResourceName } from "./useImportableResources";

/**
 * A single parsed CSV cell. Papa Parse runs with `dynamicTyping`, so numeric and
 * boolean cells are already converted, an empty cell is null, and everything
 * else is a string. A column the file does not have reads as undefined.
 */
export type ImportCell = string | number | boolean | null | undefined;

/** One parsed CSV row, keyed by column header. */
export type ImportRow = Record<string, ImportCell>;

/**
 * Creates the records of one batch of parsed CSV rows, and returns how many of
 * them were created — with the reasons of the refused rows, which are the
 * batch's errors.
 */
export type ProcessImportBatch = (
  batch: ImportRow[],
) => Promise<ImportBatchResult>;

/** A resource the import dialog can import a CSV file into. */
export type ImportableResource = {
  /** Resource name, as registered in the Admin (e.g. "companies") */
  name: ImportableResourceName;
  /** CSV content offered as a downloadable template for this resource */
  sampleCsv: string;
  /**
   * Columns Papa Parse must leave as text, because a leading zero carries
   * meaning there: a `02134` zipcode would otherwise be stored as `2134`.
   */
  textColumns?: string[];
  /** Maps the file's header row onto the resource fields, or refuses the file */
  planColumns(headers: string[]): ColumnPlan;
  processBatch: ProcessImportBatch;
};
