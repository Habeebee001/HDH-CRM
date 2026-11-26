import { Trophy } from "lucide-react";
import { useGetIdentity, useGetMany } from "ra-core";
import { useMemo } from "react";

import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Sale } from "../types";
import { DashboardPanel } from "./DashboardPanel";
import { initialsOf, useDashboardDeals, useMoney } from "./dashboardData";
import { topPerformers } from "./dashboardMetrics";

/** Team leaderboard: revenue won this year (administrators and managers) */
export const TopPerformers = () => {
  const money = useMoney();
  const { identity } = useGetIdentity();
  const { dealPipelineStatuses } = useConfigurationContext();
  const { data: deals = [], isPending } = useDashboardDeals();
  const performers = useMemo(
    () => topPerformers(deals, dealPipelineStatuses),
    [deals, dealPipelineStatuses],
  );
  const { data: sales = [] } = useGetMany<Sale>(
    "sales",
    { ids: performers.map((performer) => performer.salesId) },
    { enabled: performers.length > 0 },
  );
  // Sales reps only see their own deals: a leaderboard would mislead them
  if (identity?.role === "sales_rep") return null;
  const best = performers[0]?.amount || 1;

  return (
    <DashboardPanel
      title="Top performers"
      eyebrow={`Won in ${new Date().getFullYear()}`}
      icon={Trophy}
    >
      {!isPending && performers.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          No deals won this year yet.
        </p>
      ) : (
        <ul className="space-y-4">
          {performers.map((performer, index) => {
            const sale = sales.find((item) => item?.id === performer.salesId);
            const name = sale ? `${sale.first_name} ${sale.last_name}` : "…";
            return (
              <li key={String(performer.salesId)} className="flex items-center gap-3">
                <span className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background">
                  {initialsOf(name)}
                  {index === 0 ? (
                    <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-brand text-[0.55rem] text-brand-foreground">
                      1
                    </span>
                  ) : null}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-medium">{name}</p>
                    <p className="text-sm font-semibold tabular-nums">
                      {money.compact(performer.amount)}
                    </p>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/[0.07]">
                      <div
                        className="h-full rounded-full bg-brand"
                        style={{ width: `${(performer.amount / best) * 100}%` }}
                      />
                    </div>
                    <span className="text-[0.65rem] text-muted-foreground">
                      {performer.count} deal{performer.count === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </DashboardPanel>
  );
};
