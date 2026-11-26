import {
  addDays,
  addMonths,
  addWeeks,
  format,
  isSameDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from "date-fns";

import type { Deal } from "../types";

/** The figures of the dashboard, computed from the deals of the workspace. */

type Stage = { value: string; label: string };

export const isWon = (deal: Pick<Deal, "stage">, wonStages: string[]) =>
  wonStages.includes(deal.stage);

export const isLost = (deal: Pick<Deal, "stage">) => deal.stage === "lost";

export const isOpen = (
  deal: Pick<Deal, "stage" | "archived_at">,
  wonStages: string[],
) => !isWon(deal, wonStages) && !isLost(deal) && !deal.archived_at;

/**
 * When a won deal was won. Deals have no "won at" date: the expected closing
 * date is what people enter, but a deal won early is won by its last update
 * at the latest. Without a closing date, the last update.
 */
export const wonDate = (
  deal: Pick<Deal, "expected_closing_date" | "updated_at">,
): Date => {
  const updated = new Date(deal.updated_at);
  if (!deal.expected_closing_date) return updated;
  const closing = new Date(deal.expected_closing_date);
  if (Number.isNaN(closing.getTime())) return updated;
  return closing < updated ? closing : updated;
};

const amountOf = (deal: Pick<Deal, "amount">) => Number(deal.amount) || 0;

const sum = (deals: Pick<Deal, "amount">[]) =>
  deals.reduce((total, deal) => total + amountOf(deal), 0);

export type MonthPoint = {
  key: string;
  label: string;
  /** Won revenue of the month */
  won: number;
  /** Amount of the deals created in the month */
  pipeline: number;
};

/** The last `months` months, oldest first */
export const monthlyRevenue = (
  deals: Deal[],
  wonStages: string[],
  now = new Date(),
  months = 12,
): MonthPoint[] => {
  const first = startOfMonth(addMonths(now, -(months - 1)));
  const points: MonthPoint[] = Array.from({ length: months }, (_, index) => {
    const month = addMonths(first, index);
    return {
      key: format(month, "yyyy-MM"),
      label: format(month, "MMM"),
      won: 0,
      pipeline: 0,
    };
  });
  const byKey = new Map(points.map((point) => [point.key, point]));
  for (const deal of deals) {
    const created = byKey.get(format(new Date(deal.created_at), "yyyy-MM"));
    if (created) created.pipeline += amountOf(deal);
    if (isWon(deal, wonStages)) {
      const won = byKey.get(format(wonDate(deal), "yyyy-MM"));
      if (won) won.won += amountOf(deal);
    }
  }
  return points;
};

export type PeriodFigure = {
  amount: number;
  /** Change against the period before, in percent; null without a reference */
  change: number | null;
};

const change = (current: number, previous: number) =>
  previous > 0 ? ((current - previous) / previous) * 100 : null;

/** Won revenue today, this week and last week (weeks start on Monday) */
export const wonByPeriod = (
  deals: Deal[],
  wonStages: string[],
  now = new Date(),
) => {
  const won = deals
    .filter((deal) => isWon(deal, wonStages))
    .map((deal) => ({ amount: amountOf(deal), date: wonDate(deal) }));
  const between = (from: Date, to: Date) =>
    won
      .filter(({ date }) => date >= from && date < to)
      .reduce((total, { amount }) => total + amount, 0);
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  const yesterday = addDays(today, -1);
  const thisWeek = startOfWeek(now, { weekStartsOn: 1 });
  const nextWeek = addWeeks(thisWeek, 1);
  const lastWeek = addWeeks(thisWeek, -1);
  const weekBefore = addWeeks(thisWeek, -2);

  const todayAmount = between(today, tomorrow);
  const thisWeekAmount = between(thisWeek, nextWeek);
  const lastWeekAmount = between(lastWeek, thisWeek);
  return {
    today: {
      amount: todayAmount,
      change: change(todayAmount, between(yesterday, today)),
    },
    thisWeek: {
      amount: thisWeekAmount,
      change: change(thisWeekAmount, lastWeekAmount),
    },
    lastWeek: {
      amount: lastWeekAmount,
      change: change(lastWeekAmount, between(weekBefore, lastWeek)),
    },
  } satisfies Record<string, PeriodFigure>;
};

export type StageSlice = {
  value: string;
  label: string;
  amount: number;
  count: number;
};

/** Open deals by stage, in the order of the configured stages */
export const pipelineByStage = (
  deals: Deal[],
  stages: Stage[],
  wonStages: string[],
): StageSlice[] => {
  const open = deals.filter((deal) => isOpen(deal, wonStages));
  return stages
    .filter((stage) => !wonStages.includes(stage.value) && stage.value !== "lost")
    .map((stage) => {
      const inStage = open.filter((deal) => deal.stage === stage.value);
      return {
        value: stage.value,
        label: stage.label,
        amount: sum(inStage),
        count: inStage.length,
      };
    })
    .filter((slice) => slice.count > 0);
};

/** The four headline figures */
export const headlineFigures = (
  deals: Deal[],
  wonStages: string[],
  now = new Date(),
) => {
  const open = deals.filter((deal) => isOpen(deal, wonStages));
  const won = deals.filter((deal) => isWon(deal, wonStages));
  const lost = deals.filter(isLost);
  const yearStart = startOfYear(now);
  const wonThisYear = won.filter((deal) => wonDate(deal) >= yearStart);
  const monthEnd = addMonths(startOfMonth(now), 1);
  const openAmount = sum(open);
  const closingThisMonth = sum(
    open.filter(
      (deal) =>
        deal.expected_closing_date &&
        new Date(deal.expected_closing_date) < monthEnd,
    ),
  );
  return {
    openAmount,
    openCount: open.length,
    /** Share of the open pipeline expected to close by the end of the month */
    closingShare: openAmount > 0 ? closingThisMonth / openAmount : 0,
    wonThisYear: sum(wonThisYear),
    wonCountThisYear: wonThisYear.length,
    /** Won deals among the decided ones (won or lost) */
    winRate: won.length + lost.length > 0 ? won.length / (won.length + lost.length) : 0,
    decidedCount: won.length + lost.length,
  };
};

export type Performer = {
  salesId: Deal["sales_id"];
  amount: number;
  count: number;
};

/** Who won the most this year */
export const topPerformers = (
  deals: Deal[],
  wonStages: string[],
  now = new Date(),
  limit = 5,
): Performer[] => {
  const yearStart = startOfYear(now);
  const bySales = new Map<Deal["sales_id"], Performer>();
  for (const deal of deals) {
    if (!isWon(deal, wonStages) || wonDate(deal) < yearStart) continue;
    const entry = bySales.get(deal.sales_id) ?? {
      salesId: deal.sales_id,
      amount: 0,
      count: 0,
    };
    entry.amount += amountOf(deal);
    entry.count += 1;
    bySales.set(deal.sales_id, entry);
  }
  return [...bySales.values()]
    .sort((a, b) => b.amount - a.amount || b.count - a.count)
    .slice(0, limit);
};

/** "today", "yesterday" or a short date */
export const shortDate = (value: string | Date, now = new Date()) => {
  const date = new Date(value);
  if (isSameDay(date, now)) return "Today";
  if (isSameDay(date, addDays(now, -1))) return "Yesterday";
  return format(date, date.getFullYear() === now.getFullYear() ? "d MMM" : "d MMM yyyy");
};
