/**
 * Recognises the columns of an imported spreadsheet.
 *
 * Files rarely use the CRM's own field names ("first_name",
 * "expected_closing_date"…): a spreadsheet says "First Name", "Deal Name" or
 * "Amount (₦)", and a Google Contacts export says "E-mail 1 - Value". Each field
 * therefore lists the headers it accepts, compared after normalisation: case,
 * accents, spaces, punctuation and bracketed units are ignored.
 *
 * The plan also refuses a file up front when it lacks the column a resource
 * cannot do without (a deal name, a company name…). Without it every row would
 * be refused by the database one by one, and the user would only see a count of
 * errors.
 */
import type { ImportableResourceName } from "./useImportableResources";

/** "Amount (₦)" → "amount", "E-mail 1 - Value" → "e_mail_1_value" */
export const normalizeHeader = (header: unknown): string =>
  String(header ?? "")
    .replace(/^\uFEFF/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

/**
 * Accepted headers per field, already normalised, by order of preference. When
 * two fields accept the same header, the field listed first gets it.
 */
const FIELDS: Record<ImportableResourceName, Record<string, string[]>> = {
  contacts: {
    first_name: [
      "first_name",
      "firstname",
      "first",
      "given_name",
      "forename",
      "other_names",
      "other_name",
    ],
    last_name: ["last_name", "lastname", "last", "surname", "family_name"],
    // A single "Name" column, split into first and last name on import
    name: [
      "full_name",
      "fullname",
      "name",
      "contact_name",
      "client_name",
      "customer_name",
      "display_name",
      "file_as",
    ],
    title: [
      "title",
      "job_title",
      "position",
      "role",
      "designation",
      "occupation",
      "organization_title",
      "organization_1_title",
    ],
    company: [
      "company",
      "company_name",
      "organization",
      "organisation",
      "organization_name",
      "organisation_name",
      "organization_1_name",
      "business",
      "business_name",
      "employer",
    ],
    email_work: [
      "email_work",
      "email",
      "e_mail",
      "email_address",
      "e_mail_address",
      "work_email",
      "business_email",
      "e_mail_1_value",
      "email_1_value",
      "email_1",
      "primary_email",
    ],
    email_home: [
      "email_home",
      "home_email",
      "personal_email",
      "e_mail_2_value",
      "email_2_value",
      "email_2",
      "e_mail_2_address",
      "secondary_email",
    ],
    email_other: [
      "email_other",
      "other_email",
      "e_mail_3_value",
      "email_3_value",
      "email_3",
      "e_mail_3_address",
    ],
    phone_work: [
      "phone_work",
      "phone",
      "phone_number",
      "phone_no",
      "mobile",
      "mobile_number",
      "mobile_phone",
      "mobile_no",
      "cell",
      "cell_phone",
      "telephone",
      "tel",
      "whatsapp",
      "whatsapp_number",
      "work_phone",
      "business_phone",
      "phone_1_value",
      "phone_1",
      "primary_phone",
      "contact_number",
      "contact_no",
      "gsm",
      "gsm_number",
    ],
    phone_home: [
      "phone_home",
      "home_phone",
      "phone_2_value",
      "phone_2",
      "personal_phone",
      "secondary_phone",
    ],
    phone_other: ["phone_other", "other_phone", "phone_3_value", "phone_3"],
    background: [
      "background",
      "notes",
      "note",
      "comments",
      "comment",
      "remarks",
      "description",
      "about",
      "details",
    ],
    linkedin_url: ["linkedin_url", "linkedin", "linkedin_profile"],
    tags: [
      "tags",
      "tag",
      "labels",
      "label",
      "group_membership",
      "groups",
      "group",
      "category",
    ],
    gender: ["gender", "sex"],
    status: ["status", "lead_status"],
    has_newsletter: ["has_newsletter", "newsletter", "subscribed"],
    first_seen: ["first_seen", "created_at", "created", "date_added"],
    last_seen: ["last_seen", "last_contacted", "last_contact", "last_activity"],
  },
  companies: {
    name: [
      "name",
      "company",
      "company_name",
      "organization",
      "organisation",
      "organization_name",
      "organisation_name",
      "business",
      "business_name",
      "client",
      "client_name",
      "customer",
      "customer_name",
      "account",
      "account_name",
      "brand",
    ],
    sector: ["sector", "industry", "business_sector", "category"],
    size: [
      "size",
      "employees",
      "number_of_employees",
      "no_of_employees",
      "staff",
      "staff_size",
      "headcount",
      "company_size",
    ],
    linkedin_url: ["linkedin_url", "linkedin", "linkedin_page"],
    website: [
      "website",
      "web_site",
      "website_url",
      "url",
      "site",
      "web",
      "homepage",
    ],
    phone_number: [
      "phone_number",
      "phone",
      "phone_no",
      "telephone",
      "tel",
      "mobile",
      "contact_number",
      "office_phone",
      "business_phone",
      "whatsapp",
      "gsm",
    ],
    address: [
      "address",
      "street",
      "street_address",
      "address_line_1",
      "address_1",
      "office_address",
      "business_address",
      "location",
    ],
    zipcode: [
      "zipcode",
      "zip",
      "zip_code",
      "postal_code",
      "postcode",
      "post_code",
    ],
    city: ["city", "town", "lga"],
    state_abbr: ["state_abbr", "state", "region", "province", "county"],
    country: ["country"],
    description: [
      "description",
      "notes",
      "note",
      "about",
      "comments",
      "details",
      "remarks",
    ],
    revenue: ["revenue", "turnover", "annual_revenue", "annual_turnover"],
    tax_identifier: [
      "tax_identifier",
      "tax_id",
      "tin",
      "tax_number",
      "vat_number",
      "vat",
    ],
  },
  deals: {
    name: [
      "deal_name",
      "deal",
      "name",
      "deal_title",
      "title",
      "opportunity",
      "opportunity_name",
      "project",
      "project_name",
      "subject",
      "job",
      "job_name",
    ],
    company: [
      "company",
      "company_name",
      "client",
      "client_name",
      "customer",
      "customer_name",
      "organization",
      "organisation",
      "organization_name",
      "account",
      "account_name",
      "business",
      "business_name",
    ],
    amount: [
      "amount",
      "deal_value",
      "value",
      "deal_amount",
      "price",
      "total",
      "total_amount",
      "budget",
      "worth",
      "contract_value",
      "sale_amount",
      "sales_amount",
      "invoice_amount",
      "revenue",
      "cost",
      "fee",
      "fees",
      "ngn",
    ],
    stage: [
      "stage",
      "deal_stage",
      "pipeline_stage",
      "status",
      "deal_status",
      "phase",
      "progress",
    ],
    expected_closing_date: [
      "expected_closing_date",
      "closing_date",
      "close_date",
      "expected_close_date",
      "expected_close",
      "expected_date",
      "target_date",
      "due_date",
      "deadline",
      "end_date",
      "date",
    ],
    categories: [
      "categories",
      "category",
      "deal_type",
      "type",
      "service",
      "services",
      "product",
      "products",
    ],
    description: [
      "description",
      "notes",
      "note",
      "details",
      "comments",
      "comment",
      "remarks",
      "summary",
    ],
  },
};

/** Header examples shown in the import dialog, in the user's words. */
export const HEADER_EXAMPLES: Record<ImportableResourceName, string> = {
  contacts: "“Name”, “Phone”, “Email”, “Company” or a Google Contacts export",
  companies: "“Company Name”, “Phone”, “Address”, “Industry”",
  deals: "“Deal Name”, “Client”, “Value”, “Status”, “Close Date”",
};

const CONTACT_IDENTITY = [
  "first_name",
  "last_name",
  "name",
  "email_work",
  "email_home",
  "email_other",
  "phone_work",
  "phone_home",
  "phone_other",
];

export type ImportProblem = {
  messageKey: string;
  messageArgs: Record<string, string>;
};

export type ColumnPlan = {
  /**
   * New name of each column, by position: the field it feeds, or a name no
   * field uses for the columns the CRM does not know.
   */
  names: string[];
  /** Field → header of the column that feeds it */
  matched: Record<string, string>;
  /** Set when the file cannot be imported into this resource */
  problem?: ImportProblem;
};

const describeHeaders = (headers: string[]) => {
  const shown = headers
    .map((header) => String(header ?? "").trim())
    .filter((header) => header !== "");
  if (!shown.length) return "no column names";
  const list = shown
    .slice(0, 8)
    .map((header) => `“${header.slice(0, 40)}”`)
    .join(", ");
  return shown.length > 8 ? `${list}…` : list;
};

const matchFields = (
  resource: ImportableResourceName,
  headers: string[],
): Omit<ColumnPlan, "problem"> => {
  const normalized = headers.map(normalizeHeader);
  const taken = new Set<number>();
  const fieldOf = new Map<number, string>();
  const matched: Record<string, string> = {};

  for (const [field, aliases] of Object.entries(FIELDS[resource])) {
    for (const alias of aliases) {
      const index = normalized.findIndex(
        (header, position) => header === alias && !taken.has(position),
      );
      if (index === -1) continue;
      taken.add(index);
      fieldOf.set(index, field);
      matched[field] = String(headers[index]).trim();
      break;
    }
  }

  return {
    names: headers.map(
      (_, index) =>
        fieldOf.get(index) ?? `__unused_${index}_${normalized[index]}`,
    ),
    matched,
  };
};

const noColumns = (found: string, sampleHeaders: string[]): ImportProblem => ({
  messageKey: "crm.data_import.problem.no_columns",
  messageArgs: {
    found,
    expected: sampleHeaders.join(", "),
    _: `None of the columns of this file were recognised (found: ${found}). The first row must hold the column names, for example: ${sampleHeaders.join(", ")}. An Excel file must be saved as CSV first.`,
  },
});

/** Columns that only a list of people has (a deal file has a "Name" too) */
const PERSON_ONLY = [
  "first_name",
  "last_name",
  "email_work",
  "email_home",
  "email_other",
  "phone_work",
  "phone_home",
  "phone_other",
];

/** Name headers that can only mean a deal */
const DEAL_NAME_HEADERS = [
  "deal_name",
  "deal",
  "deal_title",
  "opportunity",
  "opportunity_name",
  "project",
  "project_name",
];

const looksLikePeople = (found: string): ImportProblem => ({
  messageKey: "crm.data_import.problem.looks_like_contacts",
  messageArgs: {
    found,
    _: `This file looks like a list of people (found: ${found}). To import people, open Contacts and use Import there.`,
  },
});

/** Maps a file's header row onto the fields of a resource, or refuses it. */
export const planColumns = (
  resource: ImportableResourceName,
  headers: string[],
  sampleHeaders: string[] = [],
): ColumnPlan => {
  const plan = matchFields(resource, headers);
  const found = describeHeaders(headers);
  const has = (...fields: string[]) =>
    fields.some((field) => field in plan.matched);
  const people =
    resource === "contacts"
      ? plan.matched
      : matchFields("contacts", headers).matched;
  const hasPersonColumns = PERSON_ONLY.some((field) => field in people);

  if (resource === "deals") {
    // A contact list imported as deals would turn every person into a deal:
    // without any deal column (amount, stage…) it is refused.
    const hasDealColumns =
      has("amount", "stage", "expected_closing_date", "categories") ||
      DEAL_NAME_HEADERS.includes(normalizeHeader(plan.matched.name));
    if (hasPersonColumns && !hasDealColumns) {
      return { ...plan, problem: looksLikePeople(found) };
    }
    if (!has("name", "company")) {
      return {
        ...plan,
        problem:
          Object.keys(plan.matched).length === 0
            ? noColumns(found, sampleHeaders)
            : {
                messageKey: "crm.data_import.problem.no_deal_name",
                messageArgs: {
                  found,
                  _: `This file has no column for the deal name (found: ${found}). Name that column “name” or “Deal Name” (a “Client” or “Company” column works too), or download the sample.`,
                },
              },
      };
    }
    return plan;
  }

  // First and last names only appear in lists of people
  if (
    resource === "companies" &&
    ("first_name" in people || "last_name" in people)
  ) {
    return { ...plan, problem: looksLikePeople(found) };
  }

  if (Object.keys(plan.matched).length === 0) {
    return { ...plan, problem: noColumns(found, sampleHeaders) };
  }

  if (resource === "contacts" && !has(...CONTACT_IDENTITY)) {
    return {
      ...plan,
      problem: {
        messageKey: "crm.data_import.problem.no_contact_columns",
        messageArgs: {
          found,
          _: `This file has no column for the contact's name, email or phone (found: ${found}). Add a column such as “Name”, “Email” or “Phone”, or download the sample.`,
        },
      },
    };
  }

  if (resource === "companies" && !has("name")) {
    return {
      ...plan,
      problem: {
        messageKey: "crm.data_import.problem.no_company_name",
        messageArgs: {
          found,
          _: `This file has no column for the company name (found: ${found}). Name that column “name” or “Company Name”, or download the sample.`,
        },
      },
    };
  }

  return plan;
};

/** The header row of a sample CSV, e.g. ["name", "company", …] */
export const sampleHeadersOf = (sampleCsv: string) =>
  (sampleCsv.split(/\r?\n/, 1)[0] ?? "")
    .split(",")
    .map((header) => header.trim())
    .filter(Boolean);
