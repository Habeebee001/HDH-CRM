import { ArrowDownRight, ArrowUpRight, BarChart3 } from "lucide-react";
import { useMemo } from "react";
import { cn } from "@/lib/utils";

import { useConfigurationContext } from "../root/ConfigurationContext";
import { ComboChart } from "./charts";
import { DashboardPanel } from "./DashboardPanel";
import { useDashboardDeals, useMoney } from "./dashboardData";
import {
  monthlyRevenue,
  wonByPeriod,
  type PeriodFigure,
} from "./dashboardMetrics";

/** Won revenue by month, new pipeline as a line, and this day / week tiles */
export const RevenueAnalytics = () => {
  const money = useMoney();
  const { dealPipelineStatuses } = useConfigurationContext();
  const { data: deals = [] } = useDashboardDeals();
  const months = useMemo(
    () => monthlyRevenue(deals, dealPipelineStatuses),
    [deals, dealPipelineStatuses],
  );
  const periods = useMemo(
    () => wonByPeriod(deals, dealPipelineStatuses),
    [deals, dealPipelineStatuses],
  );
  const yearTotal = months.reduce((total, month) => total + month.won, 0);

  return (
    <DashboardPanel
      title="Revenue analytics"
      eyebrow={`Last 12 months · ${money.full(yearTotal)} won`}
      icon={BarChart3}
      action={
        <div className="hidden items-center gap-4 text-xs text-muted-foreground sm:flex">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-brand" />
            Won revenue
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded bg-foreground/80" />
            New pipeline
          </span>
        </div>
      }
    >
      <ComboChart
        data={months.map((month) => ({
          label: month.label,
          bar: month.won,
          line: month.pipeline,
        }))}
        formatValue={money.full}
        formatTick={money.compact}
        barLabel="Won revenue"
        lineLabel="New pipeline"
      />
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <PeriodTile
          label="Won today"
          figure={periods.today}
          reference="yesterday"
          format={money.full}
        />
        <PeriodTile
          label="Won this week"
          figure={periods.thisWeek}
          reference="last week"
          format={money.full}
          highlight
        />
        <PeriodTile
          label="Won last week"
          figure={periods.lastWeek}
          reference="the week before"
          format={money.full}
        />
      </div>
    </DashboardPanel>
  );
};

const PeriodTile = ({
  label,
  figure,
  reference,
  format,
  highlight,
}: {
  label: string;
  figure: PeriodFigure;
  reference: string;
  format: (value: number) => string;
  highlight?: boolean;
}) => {
  const up = (figure.change ?? 0) >= 0;
  return (
    <div
      className={cn(
        "glass-tile rounded-xl p-4",
        highlight && "ring-1 ring-brand/40",
      )}
    >
      <p
        className={cn(
          "font-display text-2xl leading-tight tabular-nums",
          highlight && "text-brand",
        )}
      >
        {format(figure.amount)}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 flex items-center gap-1 text-xs font-medium",
          figure.change == null
            ? "text-muted-foreground"
            : up
              ? "text-[#4F7A45] dark:text-[#9CC08E]"
              : "text-destructive",
        )}
      >
        {figure.change == null ? (
          `No sales ${reference}`
        ) : (
          <>
            {up ? (
              <ArrowUpRight className="size-3.5" />
            ) : (
              <ArrowDownRight className="size-3.5" />
            )}
            {Math.abs(figure.change).toFixed(figure.change % 1 ? 1 : 0)}% vs{" "}
            {reference}
          </>
        )}
      </p>
    </div>
  );
};
