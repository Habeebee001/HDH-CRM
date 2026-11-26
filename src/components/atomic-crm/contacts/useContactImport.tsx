import { useDataProvider, useGetIdentity } from "ra-core";
import { useCallback, useMemo } from "react";

import type { Tag } from "../types";
import { createEachRow, refuseRow } from "../dataImport/createEachRow";
import { fetchRecordsWithCache } from "../dataImport/fetchRecordsWithCache";
import {
  toBoolean,
  toConfiguredValue,
  toIsoDateTime,
  toText,
} from "../dataImport/parseCell";
import type { ImportCell } from "../dataImport/types";
import { useCompanyResolver } from "../dataImport/useCompanyResolver";
import { useConfigurationContext } from "../root/ConfigurationContext";

/**
 * The columns a contact CSV can hold, once the import dialog has recognised
 * the headers (see columnMapping.ts): "Phone Number" arrives as `phone_work`, a
 * single "Name" column as `name`.
 */
export type ContactImportSchema = Partial<
  Record<
    | "first_name"
    | "last_name"
    | "name"
    | "gender"
    | "title"
    | "company"
    | "email_work"
    | "email_home"
    | "email_other"
    | "phone_work"
    | "phone_home"
    | "phone_other"
    | "background"
    | "avatar"
    | "first_seen"
    | "last_seen"
    | "has_newsletter"
    | "status"
    | "tags"
    | "linkedin_url",
    ImportCell
  >
>;

export function useContactImport() {
  const today = new Date().toISOString();
  const user = useGetIdentity();
  const dataProvider = useDataProvider();
  const { noteStatuses } = useConfigurationContext();

  const getCompanies = useCompanyResolver();

  // Tags cache to avoid creating the same tag multiple times and costly roundtrips
  // Cache is dependent of dataProvider, so it's safe to use it as a dependency
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const tagsCache = useMemo(() => new Map<string, Tag>(), [dataProvider]);
  const getTags = useCallback(
    async (names: string[]) =>
      fetchRecordsWithCache<Tag>(
        "tags",
        tagsCache,
        names,
        (name) => ({
          name,
          color: "#f9f9f9",
        }),
        dataProvider,
      ),
    [tagsCache, dataProvider],
  );

  const processBatch = useCallback(
    async (batch: ContactImportSchema[]) => {
      const rows = batch.map((row) => ({
        row,
        ...splitName(row),
        companyName: toText(row.company),
      }));
      const [companies, tags] = await Promise.all([
        getCompanies(
          rows
            .map(({ companyName }) => companyName)
            .filter((name): name is string => name !== undefined),
        ),
        getTags(batch.flatMap((row) => parseTags(row.tags))),
      ]);

      return createEachRow(
        rows.map(({ row, first_name, last_name, companyName }) => {
          const email_jsonb = [
            { email: toText(row.email_work), type: "Work" },
            { email: toText(row.email_home), type: "Home" },
            { email: toText(row.email_other), type: "Other" },
          ].filter(({ email }) => email);
          const phone_jsonb = [
            { number: toText(row.phone_work), type: "Work" },
            { number: toText(row.phone_home), type: "Home" },
            { number: toText(row.phone_other), type: "Other" },
          ].filter(({ number }) => number);
          if (
            !first_name &&
            !last_name &&
            !email_jsonb.length &&
            !phone_jsonb.length
          ) {
            return refuseRow("a row has no name, email or phone number");
          }
          const company = companyName ? companies.get(companyName) : undefined;
          const tagList = parseTags(row.tags)
            .map((name) => tags.get(name))
            .filter((tag): tag is Tag => !!tag);

          return dataProvider.create("contacts", {
            data: {
              first_name,
              last_name,
              gender: toGender(row.gender),
              title: toText(row.title),
              email_jsonb,
              phone_jsonb,
              background: toText(row.background),
              // An unreadable date must not fail the row (new Date("…") of an
              // unknown format throws on toISOString): fall back to today.
              first_seen: toIsoDateTime(row.first_seen) ?? today,
              last_seen: toIsoDateTime(row.last_seen) ?? today,
              has_newsletter: toBoolean(row.has_newsletter),
              status: toConfiguredValue(row.status, noteStatuses),
              company_id: company?.id,
              tags: tagList.map((tag) => tag.id),
              sales_id: user?.identity?.id,
              linkedin_url: toText(row.linkedin_url),
            },
          });
        }),
      );
    },
    [
      dataProvider,
      getCompanies,
      getTags,
      noteStatuses,
      user?.identity?.id,
      today,
    ],
  );

  return processBatch;
}

/**
 * First and last name, from their own columns or from a single "Name" column:
 * "Adaeze Okafor" → Adaeze / Okafor, "Okafor, Adaeze" → Adaeze / Okafor.
 */
const splitName = (row: ContactImportSchema) => {
  const first_name = toText(row.first_name);
  const last_name = toText(row.last_name);
  if (first_name || last_name) return { first_name, last_name };
  const full = toText(row.name);
  if (!full) return { first_name: undefined, last_name: undefined };
  if (full.includes(",")) {
    const [last, ...rest] = full.split(",");
    return {
      first_name: toText(rest.join(",")),
      last_name: toText(last),
    };
  }
  const [first, ...rest] = full.split(/\s+/);
  return { first_name: first, last_name: toText(rest.join(" ")) };
};

const GENDERS: Record<string, string> = {
  m: "male",
  male: "male",
  man: "male",
  mr: "male",
  f: "female",
  female: "female",
  woman: "female",
  mrs: "female",
  ms: "female",
  miss: "female",
  nonbinary: "nonbinary",
  "non-binary": "nonbinary",
  "non binary": "nonbinary",
};

const toGender = (cell: ImportCell) =>
  GENDERS[toText(cell)?.toLowerCase().replace(/\.$/, "") ?? ""];

/**
 * Tag names from a cell: "VIP, Lagos" or "VIP; Lagos", or Google Contacts
 * labels ("* myContacts ::: Clients"), whose "*" entries are system labels.
 */
const parseTags = (tags: ImportCell) =>
  (toText(tags)?.split(/:::|[,;]/) ?? [])
    .map((tag) => tag.trim())
    .filter((tag) => tag && !tag.startsWith("*"));
