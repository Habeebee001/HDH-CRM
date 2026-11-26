import { useGetList } from "ra-core";
import { useMemo } from "react";

import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Deal } from "../types";

/**
 * Every deal of the workspace that the user may see (sales reps: their own),
 * shared by the dashboard panels: identical queries are fetched once.
 */
export const useDashboardDeals = () =>
  useGetList<Deal>("deals", {
    pagination: { page: 1, perPage: 2000 },
    sort: { field: "updated_at", order: "DESC" },
  });

/** Formats amounts in the CRM currency (US dollars) */
export const useMoney = () => {
  const { currency } = useConfigurationContext();
  return useMemo(() => {
    const full = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      maximumFractionDigits: 0,
    });
    const compact = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      notation: "compact",
      maximumFractionDigits: 1,
    });
    return {
      currency,
      full: (value: number) => full.format(value || 0),
      compact: (value: number) =>
        Math.abs(value) < 10_000 ? full.format(value || 0) : compact.format(value),
    };
  }, [currency]);
};

const STAGE_COLORS: Record<string, string> = {
  opportunity: "#8A94A6",
  "proposal-sent": "#E0CB98",
  "in-negociation": "#C6A15B",
  delayed: "#B9B3A6",
  won: "#6E8B5E",
  lost: "#A4453F",
};

const FALLBACK_COLORS = ["#C6A15B", "#2E2E34", "#E0CB98", "#7C8C6E", "#8A94A6", "#A4453F"];

/** A stable colour per deal stage */
export const stageColor = (stage: string, index = 0) =>
  STAGE_COLORS[stage] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length];

export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";
