import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { decodeText, readTableFile, TableFileError } from "./readTableFile";

/** 2026-12-25 as an Excel date serial number */
const CHRISTMAS_2026 = 46381;

const workbookFile = (
  sheets: Record<string, XLSX.WorkSheet>,
  bookType: XLSX.BookType,
  name: string,
) => {
  const workbook = XLSX.utils.book_new();
  for (const [sheetName, sheet] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  }
  const data = XLSX.write(workbook, { bookType, type: "array" });
  return new File([data], name);
};

const customersSheet = () => {
  const sheet = XLSX.utils.aoa_to_sheet([
    ["HDH CUSTOMERS 2026"],
    [],
    ["Customer Name", "Phone No", "Amount", "Since"],
    ["Chidi Eze", 8031234567, 4500000, null],
    ["Aisha Bello", "07012345678", 250000.5, null],
  ]);
  // Dates are numbers with a date format in spreadsheets
  sheet["D4"] = { t: "n", v: CHRISTMAS_2026, z: "dd/mm/yyyy" };
  sheet["D5"] = { t: "n", v: CHRISTMAS_2026 + 0.5, z: "m/d/yy h:mm" };
  return sheet;
};

describe("readTableFile", () => {
  it.each([
    ["xlsx", "customers.xlsx"],
    ["biff8", "customers.xls"],
    ["ods", "customers.ods"],
  ] as const)("reads a %s workbook into CSV", async (bookType, name) => {
    const { text, sheetName } = await readTableFile(
      workbookFile({ Customers: customersSheet() }, bookType, name),
    );
    expect(sheetName).toBe("Customers");
    const lines = text.split(/\r?\n/);
    expect(lines[0]).toBe("HDH CUSTOMERS 2026,,,");
    expect(lines[2]).toBe("Customer Name,Phone No,Amount,Since");
    // Raw numbers (no thousands separators) and unambiguous ISO dates
    expect(lines[3]).toBe("Chidi Eze,8031234567,4500000,2026-12-25");
    expect(lines[4]).toBe("Aisha Bello,07012345678,250000.5,2026-12-25 12:00");
  });

  it("picks the sheet where the most columns are recognised", async () => {
    const notes = XLSX.utils.aoa_to_sheet([["Notes"], ["call back"]]);
    const file = workbookFile(
      { Notes: notes, Customers: customersSheet() },
      "xlsx",
      "book.xlsx",
    );
    const score = (rows: string[][]) =>
      rows.some((row) => row.includes("Customer Name")) ? 2 : 0;
    const { sheetName } = await readTableFile(file, score);
    expect(sheetName).toBe("Customers");
  });

  it("recognises a spreadsheet whatever its file name", async () => {
    const file = workbookFile(
      { Customers: customersSheet() },
      "xlsx",
      "customers.csv",
    );
    const { text } = await readTableFile(file);
    expect(text).toContain("Chidi Eze");
  });

  it("reads text tables in their encoding", async () => {
    const utf8 = new File(["\uFEFFName,City\nAdé,Lagos\n"], "a.csv");
    expect((await readTableFile(utf8)).text).toBe("Name,City\nAdé,Lagos\n");

    // Excel's "CSV (Comma delimited)" on Windows: é is the single byte 0xE9
    const ansi = new File(
      [new Uint8Array([0x4e, 0x61, 0x6d, 0x65, 0x0a, 0x41, 0x64, 0xe9])],
      "b.csv",
    );
    expect((await readTableFile(ansi)).text).toBe("Name\nAdé");

    const tsv = new File(["Name\tPhone\nChidi\t0803\n"], "c.txt");
    expect((await readTableFile(tsv)).text).toBe("Name\tPhone\nChidi\t0803\n");
  });

  it("decodes UTF-16 text (Excel's Unicode Text)", () => {
    const bytes = new Uint8Array([
      0xff, 0xfe, 0x41, 0x00, 0x09, 0x00, 0x42, 0x00,
    ]);
    expect(decodeText(bytes)).toBe("A\tB");
  });

  it("refuses an empty file", async () => {
    await expect(readTableFile(new File([], "empty.csv"))).rejects.toEqual(
      new TableFileError("empty"),
    );
    await expect(
      readTableFile(new File(["  \n "], "blank.csv")),
    ).rejects.toMatchObject({ reason: "empty" });
  });

  it("refuses a damaged spreadsheet", async () => {
    // A download cut in the middle
    const complete = workbookFile(
      { Customers: customersSheet() },
      "xlsx",
      "customers.xlsx",
    );
    const bytes = new Uint8Array(await complete.arrayBuffer());
    const damaged = new File([bytes.slice(0, bytes.length / 2)], "broken.xlsx");
    await expect(readTableFile(damaged)).rejects.toMatchObject({
      reason: "unreadable",
    });
  });
});
