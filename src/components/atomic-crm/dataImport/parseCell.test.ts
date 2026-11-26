import { describe, expect, it } from "vitest";

import {
  isNaira,
  NAIRA_PER_DOLLAR,
  toDollars,
  toAmount,
  toBoolean,
  toConfiguredValue,
  toConfiguredValues,
  toFirstNumber,
  toInteger,
  toIsoDate,
  toIsoDateTime,
  toNumber,
  toPhone,
  toStage,
  toText,
} from "./parseCell";

const stages = [
  { value: "opportunity", label: "Opportunity" },
  { value: "proposal-sent", label: "Proposal Sent" },
];

describe("toText", () => {
  it("trims the cell content", () => {
    expect(toText("  Acme  ")).toBe("Acme");
  });

  it("returns undefined for an empty or blank cell", () => {
    expect(toText(null)).toBeUndefined();
    expect(toText("")).toBeUndefined();
    expect(toText("   ")).toBeUndefined();
  });

  it("stringifies cells Papa Parse already converted", () => {
    expect(toText(10001)).toBe("10001");
  });
});

describe("toNumber", () => {
  it("converts a numeric cell", () => {
    expect(toNumber("12000")).toBe(12000);
    expect(toNumber(250)).toBe(250);
  });

  it("returns undefined for an empty or non-numeric cell", () => {
    expect(toNumber(null)).toBeUndefined();
    expect(toNumber("a lot")).toBeUndefined();
  });
});

describe("toInteger", () => {
  it("rounds a fractional cell, which an integer column would reject", () => {
    expect(toInteger("4500.50")).toBe(4501);
    expect(toInteger(12000)).toBe(12000);
  });

  it("returns undefined for an empty or non-numeric cell", () => {
    expect(toInteger(null)).toBeUndefined();
    expect(toInteger("a lot")).toBeUndefined();
  });
});

describe("toIsoDate", () => {
  it("converts a date cell to an ISO string", () => {
    expect(toIsoDate("2026-09-30")).toBe("2026-09-30T00:00:00.000Z");
  });

  it("reads the date as UTC, whatever the timezone of the browser", () => {
    // A local-midnight date shifts to the previous day in any timezone ahead
    // of UTC, and a date column then stores the wrong day
    expect(toIsoDate("2026-01-01")).toBe("2026-01-01T00:00:00.000Z");
    expect(toIsoDate("2026-12-31")).toBe("2026-12-31T00:00:00.000Z");
  });

  it("reads day-first dates, as written in Nigeria", () => {
    expect(toIsoDate("30/09/2026")).toBe("2026-09-30T00:00:00.000Z");
    expect(toIsoDate("30-09-2026")).toBe("2026-09-30T00:00:00.000Z");
    expect(toIsoDate("30.09.2026")).toBe("2026-09-30T00:00:00.000Z");
    expect(toIsoDate("5/1/26")).toBe("2026-01-05T00:00:00.000Z");
    // Ambiguous: day first
    expect(toIsoDate("03/04/2026")).toBe("2026-04-03T00:00:00.000Z");
  });

  it("falls back to month-first when the day cannot come first", () => {
    expect(toIsoDate("09/30/2026")).toBe("2026-09-30T00:00:00.000Z");
  });

  it("reads dates with month names", () => {
    expect(toIsoDate("30 Sep 2026")).toBe("2026-09-30T00:00:00.000Z");
    expect(toIsoDate("30-Sep-2026")).toBe("2026-09-30T00:00:00.000Z");
    expect(toIsoDate("Sep 30, 2026")).toBe("2026-09-30T00:00:00.000Z");
    expect(toIsoDate("September 30 2026")).toBe("2026-09-30T00:00:00.000Z");
    expect(toIsoDate("1st December 2026")).toBe("2026-12-01T00:00:00.000Z");
  });

  it("keeps only the day of a timestamp", () => {
    expect(toIsoDate("2026-09-30T15:20:00+01:00")).toBe(
      "2026-09-30T00:00:00.000Z",
    );
  });

  it("returns undefined for a cell that is not a date", () => {
    expect(toIsoDate(null)).toBeUndefined();
    expect(toIsoDate(undefined)).toBeUndefined();
    expect(toIsoDate("next quarter")).toBeUndefined();
    expect(toIsoDate("32/01/2026")).toBeUndefined();
    expect(toIsoDate("13/13/2026")).toBeUndefined();
    expect(toIsoDate("30 Foo 2026")).toBeUndefined();
    // An impossible day rolls over to the next month rather than failing
    expect(toIsoDate("2026-02-31")).toBeUndefined();
    expect(toIsoDate("2026-13-01")).toBeUndefined();
  });
});

describe("toIsoDateTime", () => {
  it("keeps the time of a full timestamp", () => {
    expect(toIsoDateTime("2024-07-01T11:54:49.95+00:00")).toBe(
      "2024-07-01T11:54:49.950Z",
    );
  });

  it("reads plain dates like toIsoDate, and never throws", () => {
    expect(toIsoDateTime("01/07/2024")).toBe("2024-07-01T00:00:00.000Z");
    expect(toIsoDateTime("yesterday")).toBeUndefined();
    expect(toIsoDateTime(null)).toBeUndefined();
  });
});

describe("toAmount", () => {
  it("reads amounts the way people type them", () => {
    expect(toAmount(4500000)).toBe(4500000);
    expect(toAmount("4500000")).toBe(4500000);
    expect(toAmount("4,500,000")).toBe(4500000);
    expect(toAmount("4,500,000.60")).toBe(4500001);
    expect(toAmount("₦4,500,000")).toBe(4500000);
    expect(toAmount("N4,500,000")).toBe(4500000);
    expect(toAmount("NGN 4,500,000")).toBe(4500000);
    expect(toAmount("4.5m")).toBe(4500000);
    expect(toAmount("2.5M")).toBe(2500000);
    expect(toAmount("250k")).toBe(250000);
    expect(toAmount("$1,200")).toBe(1200);
  });

  it("returns undefined for an empty cell or one without an amount", () => {
    expect(toAmount(null)).toBeUndefined();
    expect(toAmount("")).toBeUndefined();
    expect(toAmount("to be agreed")).toBeUndefined();
    expect(toAmount("Nil")).toBeUndefined();
  });
});

describe("toBoolean", () => {
  it("reads yes/no answers", () => {
    expect(toBoolean(true)).toBe(true);
    expect(toBoolean("Yes")).toBe(true);
    expect(toBoolean("TRUE")).toBe(true);
    expect(toBoolean(1)).toBe(true);
    expect(toBoolean("no")).toBe(false);
    expect(toBoolean("0")).toBe(false);
    expect(toBoolean("")).toBeUndefined();
    expect(toBoolean("maybe")).toBeUndefined();
  });
});

describe("toFirstNumber", () => {
  it("reads the first whole number of the cell", () => {
    expect(toFirstNumber(50)).toBe(50);
    expect(toFirstNumber("11-50")).toBe(11);
    expect(toFirstNumber("1,200 staff")).toBe(1200);
    expect(toFirstNumber("none")).toBeUndefined();
  });
});

describe("toStage", () => {
  const pipeline = [
    { value: "opportunity", label: "Opportunity" },
    { value: "proposal-sent", label: "Proposal Sent" },
    { value: "won", label: "Won" },
    { value: "lost", label: "Lost" },
  ];

  it("matches the stage value or label", () => {
    expect(toStage("proposal-sent", pipeline)).toBe("proposal-sent");
    expect(toStage("Proposal Sent", pipeline)).toBe("proposal-sent");
  });

  it("understands everyday words for the default stages", () => {
    expect(toStage("Paid", pipeline)).toBe("won");
    expect(toStage("closed-won", pipeline)).toBe("won");
    expect(toStage("Pending", pipeline)).toBe("opportunity");
    expect(toStage("Quote sent", pipeline)).toBe("proposal-sent");
    expect(toStage("Cancelled", pipeline)).toBe("lost");
  });

  it("ignores words for stages the pipeline does not have", () => {
    expect(toStage("On hold", pipeline)).toBeUndefined();
    expect(toStage("whatever", pipeline)).toBeUndefined();
  });
});

describe("toConfiguredValue", () => {
  it("matches a configured value", () => {
    expect(toConfiguredValue("proposal-sent", stages)).toBe("proposal-sent");
  });

  it("matches a configured label, whatever its case", () => {
    expect(toConfiguredValue("Proposal Sent", stages)).toBe("proposal-sent");
    expect(toConfiguredValue("proposal sent", stages)).toBe("proposal-sent");
  });

  it("returns undefined when no option matches", () => {
    expect(toConfiguredValue("Archived", stages)).toBeUndefined();
    expect(toConfiguredValue(null, stages)).toBeUndefined();
  });
});

describe("toConfiguredValues", () => {
  it("matches each comma or semicolon separated entry", () => {
    expect(toConfiguredValues("Proposal Sent; opportunity", stages)).toEqual([
      "proposal-sent",
      "opportunity",
    ]);
    expect(toConfiguredValues("opportunity,Proposal Sent", stages)).toEqual([
      "opportunity",
      "proposal-sent",
    ]);
  });

  it("drops unknown entries and returns [] for an empty cell", () => {
    expect(toConfiguredValues("opportunity, Archived", stages)).toEqual([
      "opportunity",
    ]);
    expect(toConfiguredValues(null, stages)).toEqual([]);
  });
});

describe("toPhone", () => {
  it("puts back the 0 Excel drops from Nigerian mobile numbers", () => {
    expect(toPhone("8031234567")).toBe("08031234567");
    expect(toPhone(8031234567)).toBe("08031234567");
    expect(toPhone("9012345678")).toBe("09012345678");
    expect(toPhone("2348031234567")).toBe("+2348031234567");
  });

  it("keeps other numbers as typed", () => {
    expect(toPhone("08031234567")).toBe("08031234567");
    expect(toPhone("+234 803 123 4567")).toBe("+234 803 123 4567");
    expect(toPhone("012345678")).toBe("012345678");
    expect(toPhone("5551234567")).toBe("5551234567");
    expect(toPhone("")).toBeUndefined();
  });
});

describe("toDollars", () => {
  it("keeps dollar amounts and converts naira at the CRM rate", () => {
    expect(toDollars("$1,200")).toBe(1200);
    expect(toDollars(2500)).toBe(2500);
    expect(toDollars("₦1,550,000")).toBe(1000);
    expect(toDollars("N 3.1m")).toBe(2000);
    // a naira column: plain numbers are naira too
    expect(toDollars(155000, true)).toBe(100);
    expect(toDollars("", true)).toBeUndefined();
  });

  it("recognises naira in cells and headers", () => {
    expect(isNaira("Amount (₦)")).toBe(true);
    expect(isNaira("Value (NGN)")).toBe(true);
    expect(isNaira("Amount ($)")).toBe(false);
    expect(isNaira("Name")).toBe(false);
    expect(NAIRA_PER_DOLLAR).toBe(1550);
  });
});
