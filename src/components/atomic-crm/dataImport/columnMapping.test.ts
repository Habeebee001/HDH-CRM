import { describe, expect, it } from "vitest";

import { normalizeHeader, planColumns, sampleHeadersOf } from "./columnMapping";

describe("normalizeHeader", () => {
  it("ignores case, spacing, punctuation, accents and bracketed units", () => {
    expect(normalizeHeader("Deal Name")).toBe("deal_name");
    expect(normalizeHeader("  Amount (₦) ")).toBe("amount");
    expect(normalizeHeader("E-mail 1 - Value")).toBe("e_mail_1_value");
    expect(normalizeHeader("\uFEFFfirst_name")).toBe("first_name");
    expect(normalizeHeader("Téléphone")).toBe("telephone");
  });
});

describe("planColumns", () => {
  it("keeps the CRM's own column names", () => {
    const headers = sampleHeadersOf(
      "name,company,categories,stage,amount,expected_closing_date,description\nx",
    );
    const plan = planColumns("deals", headers);
    expect(plan.problem).toBeUndefined();
    expect(plan.names).toEqual(headers);
  });

  it("recognises everyday deal headers", () => {
    const plan = planColumns("deals", [
      "Deal Name",
      "Client",
      "Value (NGN)",
      "Status",
      "Close Date",
      "Phone",
    ]);
    expect(plan.problem).toBeUndefined();
    expect(plan.names.slice(0, 5)).toEqual([
      "name",
      "company",
      "amount",
      "stage",
      "expected_closing_date",
    ]);
    // Unknown columns get a name no field uses
    expect(plan.names[5]).toMatch(/^__unused_5_/);
  });

  it("accepts a deals file without a deal name when it names the client", () => {
    const plan = planColumns("deals", ["Customer", "Amount"]);
    expect(plan.problem).toBeUndefined();
    expect(plan.matched).toEqual({ company: "Customer", amount: "Amount" });
  });

  it("refuses a list of people imported as deals, and says so", () => {
    const plan = planColumns("deals", ["Full Name", "Phone Number", "Email"]);
    expect(plan.problem?.messageKey).toBe(
      "crm.data_import.problem.looks_like_contacts",
    );
    expect(plan.problem?.messageArgs.found).toContain("“Phone Number”");
  });

  it("refuses a contact list with a Name column imported as deals", () => {
    // Without this check, every person would become a deal
    const plan = planColumns("deals", ["Name", "Phone", "Email", "Company"]);
    expect(plan.problem?.messageKey).toBe(
      "crm.data_import.problem.looks_like_contacts",
    );
  });

  it("accepts a deals file that also lists a phone number", () => {
    const plan = planColumns("deals", ["Name", "Phone", "Amount"]);
    expect(plan.problem).toBeUndefined();
  });

  it("refuses a list of people imported as companies", () => {
    const plan = planColumns("companies", [
      "First Name",
      "Last Name",
      "Company",
    ]);
    expect(plan.problem?.messageKey).toBe(
      "crm.data_import.problem.looks_like_contacts",
    );
  });

  it("refuses a deals file without a deal name or client", () => {
    const plan = planColumns("deals", ["Amount", "Stage"]);
    expect(plan.problem?.messageKey).toBe(
      "crm.data_import.problem.no_deal_name",
    );
  });

  it("refuses a file whose columns are all unknown, e.g. an Excel file", () => {
    const plan = planColumns("contacts", ["PK\u0003\u0004\u0014", "x"], ["a"]);
    expect(plan.problem?.messageKey).toBe("crm.data_import.problem.no_columns");
  });

  it("maps a Google Contacts export", () => {
    const plan = planColumns("contacts", [
      "First Name",
      "Last Name",
      "Organization Name",
      "Organization Title",
      "E-mail 1 - Value",
      "Phone 1 - Value",
      "Phone 2 - Value",
      "Labels",
      "Notes",
    ]);
    expect(plan.problem).toBeUndefined();
    expect(plan.names).toEqual([
      "first_name",
      "last_name",
      "company",
      "title",
      "email_work",
      "phone_work",
      "phone_home",
      "tags",
      "background",
    ]);
  });

  it("maps a simple customer list with a single name column", () => {
    const plan = planColumns("contacts", [
      "Customer Name",
      "Phone No",
      "Address",
    ]);
    expect(plan.problem).toBeUndefined();
    expect(plan.matched).toEqual({
      name: "Customer Name",
      phone_work: "Phone No",
    });
  });

  it("refuses a contacts file with no name, email or phone column", () => {
    const plan = planColumns("contacts", ["Company", "Job Title"]);
    expect(plan.problem?.messageKey).toBe(
      "crm.data_import.problem.no_contact_columns",
    );
  });

  it("refuses a companies file without a company name", () => {
    const plan = planColumns("companies", ["Website", "Phone"]);
    expect(plan.problem?.messageKey).toBe(
      "crm.data_import.problem.no_company_name",
    );
  });

  it("gives each column to one field only", () => {
    const plan = planColumns("deals", ["Name", "Deal Name"]);
    // "Deal Name" is the better deal name; "Name" stays unused
    expect(plan.names[1]).toBe("name");
    expect(plan.names[0]).toMatch(/^__unused_0_/);
  });
});
