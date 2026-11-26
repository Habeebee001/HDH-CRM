import { describe, expect, it } from "vitest";

import type { Deal } from "../types";
import {
  headlineFigures,
  monthlyRevenue,
  pipelineByStage,
  topPerformers,
  wonByPeriod,
  wonDate,
} from "./dashboardMetrics";

const NOW = new Date(2026, 10, 25, 15, 0); // Wednesday 25 November 2026
const WON = ["won"];
const STAGES = [
  { value: "opportunity", label: "Opportunity" },
  { value: "proposal-sent", label: "Proposal Sent" },
  { value: "in-negociation", label: "In Negotiation" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
  { value: "delayed", label: "Delayed" },
];

let nextId = 1;
const deal = (fields: Partial<Deal>): Deal =>
  ({
    id: nextId++,
    name: "Deal",
    company_id: 1,
    contact_ids: [],
    categories: [],
    stage: "opportunity",
    description: "",
    amount: 0,
    created_at: new Date(2026, 10, 1).toISOString(),
    updated_at: new Date(2026, 10, 1).toISOString(),
    expected_closing_date: null,
    sales_id: 1,
    index: 0,
    ...fields,
  }) as Deal;

describe("wonDate", () => {
  it("is the expected closing date when the deal was updated after it", () => {
    expect(
      wonDate({
        expected_closing_date: new Date(2026, 9, 10).toISOString(),
        updated_at: new Date(2026, 10, 20).toISOString(),
      }),
    ).toEqual(new Date(2026, 9, 10));
  });

  it("is the last update for a deal won before its closing date", () => {
    expect(
      wonDate({
        expected_closing_date: new Date(2027, 0, 10).toISOString(),
        updated_at: new Date(2026, 10, 20).toISOString(),
      }),
    ).toEqual(new Date(2026, 10, 20));
  });

  it("is the last update without a closing date", () => {
    expect(
      wonDate({
        expected_closing_date: null,
        updated_at: new Date(2026, 10, 20).toISOString(),
      }),
    ).toEqual(new Date(2026, 10, 20));
  });
});

describe("monthlyRevenue", () => {
  it("gives twelve months ending with the current one", () => {
    const months = monthlyRevenue([], WON, NOW);
    expect(months).toHaveLength(12);
    expect(months[0].key).toBe("2025-12");
    expect(months[11]).toEqual({
      key: "2026-11",
      label: "Nov",
      won: 0,
      pipeline: 0,
    });
  });

  it("adds won deals to the month they were won, new deals to the month they were created", () => {
    const months = monthlyRevenue(
      [
        deal({
          stage: "won",
          amount: 300,
          created_at: new Date(2026, 8, 3).toISOString(),
          updated_at: new Date(2026, 10, 2).toISOString(),
        }),
        deal({ amount: 50, created_at: new Date(2026, 10, 4).toISOString() }),
        // too old for the chart
        deal({ amount: 999, created_at: new Date(2024, 1, 1).toISOString() }),
      ],
      WON,
      NOW,
    );
    expect(months.find((m) => m.key === "2026-09")?.pipeline).toBe(300);
    expect(months.find((m) => m.key === "2026-11")).toMatchObject({
      won: 300,
      pipeline: 50,
    });
    expect(months.reduce((total, m) => total + m.pipeline, 0)).toBe(350);
  });
});

describe("wonByPeriod", () => {
  it("splits won revenue into today, this week and last week", () => {
    const deals = [
      deal({ stage: "won", amount: 100, updated_at: new Date(2026, 10, 25, 9).toISOString() }),
      deal({ stage: "won", amount: 40, updated_at: new Date(2026, 10, 24, 9).toISOString() }),
      // Monday of this week
      deal({ stage: "won", amount: 10, updated_at: new Date(2026, 10, 23, 9).toISOString() }),
      // Sunday: last week
      deal({ stage: "won", amount: 200, updated_at: new Date(2026, 10, 22, 9).toISOString() }),
      deal({ stage: "won", amount: 100, updated_at: new Date(2026, 10, 12, 9).toISOString() }),
      deal({ stage: "lost", amount: 5000, updated_at: new Date(2026, 10, 25, 9).toISOString() }),
    ];
    const periods = wonByPeriod(deals, WON, NOW);
    expect(periods.today).toEqual({ amount: 100, change: 150 });
    expect(periods.thisWeek).toEqual({ amount: 150, change: -25 });
    expect(periods.lastWeek).toEqual({ amount: 200, change: 100 });
  });

  it("has no change without a previous period", () => {
    expect(wonByPeriod([], WON, NOW).today).toEqual({ amount: 0, change: null });
  });
});

describe("pipelineByStage", () => {
  it("sums the open deals by stage, in the stage order", () => {
    const slices = pipelineByStage(
      [
        deal({ stage: "in-negociation", amount: 500 }),
        deal({ stage: "opportunity", amount: 100 }),
        deal({ stage: "opportunity", amount: 50 }),
        deal({ stage: "won", amount: 1000 }),
        deal({ stage: "lost", amount: 1000 }),
        deal({ stage: "delayed", amount: 70, archived_at: "2026-11-01" }),
      ],
      STAGES,
      WON,
    );
    expect(slices).toEqual([
      { value: "opportunity", label: "Opportunity", amount: 150, count: 2 },
      { value: "in-negociation", label: "In Negotiation", amount: 500, count: 1 },
    ]);
  });
});

describe("headlineFigures", () => {
  it("computes the open pipeline, the revenue won this year and the win rate", () => {
    const figures = headlineFigures(
      [
        deal({ stage: "opportunity", amount: 600, expected_closing_date: new Date(2026, 10, 28).toISOString() }),
        deal({ stage: "proposal-sent", amount: 400, expected_closing_date: new Date(2027, 1, 1).toISOString() }),
        deal({ stage: "won", amount: 1000, updated_at: new Date(2026, 3, 1).toISOString() }),
        deal({ stage: "won", amount: 7, updated_at: new Date(2025, 3, 1).toISOString() }),
        deal({ stage: "lost", amount: 1 }),
      ],
      WON,
      NOW,
    );
    expect(figures).toEqual({
      openAmount: 1000,
      openCount: 2,
      closingShare: 0.6,
      wonThisYear: 1000,
      wonCountThisYear: 1,
      winRate: 2 / 3,
      decidedCount: 3,
    });
  });
});

describe("topPerformers", () => {
  it("ranks team members by revenue won this year", () => {
    const performers = topPerformers(
      [
        deal({ stage: "won", amount: 100, sales_id: 1, updated_at: new Date(2026, 5, 1).toISOString() }),
        deal({ stage: "won", amount: 300, sales_id: 2, updated_at: new Date(2026, 5, 1).toISOString() }),
        deal({ stage: "won", amount: 50, sales_id: 1, updated_at: new Date(2026, 6, 1).toISOString() }),
        deal({ stage: "won", amount: 900, sales_id: 3, updated_at: new Date(2025, 6, 1).toISOString() }),
        deal({ stage: "opportunity", amount: 5000, sales_id: 3 }),
      ],
      WON,
      NOW,
    );
    expect(performers).toEqual([
      { salesId: 2, amount: 300, count: 1 },
      { salesId: 1, amount: 150, count: 2 },
    ]);
  });
});
