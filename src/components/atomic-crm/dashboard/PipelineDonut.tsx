import { PieChart } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";

import { useConfigurationContext } from "../root/ConfigurationContext";
import { Donut } from "./charts";
import { DashboardPanel } from "./DashboardPanel";
import { stageColor, useDashboardDeals, useMoney } from "./dashboardData";
import { pipelineByStage } from "./dashboardMetrics";

/** Open deals by stage (the "Sales Analytics" donut of the reference) */
export const PipelineDonut = () => {
  const money = useMoney();
  const { dealStages, dealPipelineStatuses } = useConfigurationContext();
  const { data: deals = [], isPending } = useDashboardDeals();
  const [active, setActive] = useState<number | null>(null);
  const slices = useMemo(
    () => pipelineByStage(deals, dealStages, dealPipelineStatuses),
    [deals, dealStages, dealPipelineStatuses],
  );
  const total = slices.reduce((sum, slice) => sum + slice.amount, 0);
  const count = slices.reduce((sum, slice) => sum + slice.count, 0);
  const colorOf = (value: string) =>
    stageColor(
      value,
      dealStages.findIndex((stage) => stage.value === value),
    );
  const shown = active != null ? slices[active] : null;

  return (
    <DashboardPanel title="Pipeline by stage" eyebrow="Open deals" icon={PieChart}>
      {!isPending && slices.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted-foreground">
          <p>No open deals right now.</p>
          <Link
            to="/deals/create"
            className="mt-2 inline-block font-medium text-foreground underline underline-offset-4 hover:text-brand"
          >
            Add a deal
          </Link>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-5">
          <Donut
            segments={slices.map((slice) => ({
              label: slice.label,
              value: slice.amount || slice.count,
              color: colorOf(slice.value),
            }))}
            active={active}
            onActiveChange={setActive}
          >
            <span className="text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {shown ? shown.label : "Total"}
            </span>
            <span className="font-display text-2xl tabular-nums">
              {money.compact(shown ? shown.amount : total)}
            </span>
            <span className="text-xs text-muted-foreground">
              {shown ? shown.count : count} deal
              {(shown ? shown.count : count) === 1 ? "" : "s"}
            </span>
          </Donut>
          <ul className="w-full space-y-1.5">
            {slices.map((slice, index) => (
              <li
                key={slice.value}
                onMouseEnter={() => setActive(index)}
                onMouseLeave={() => setActive(null)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors",
                  active === index && "bg-foreground/[0.05]",
                )}
              >
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: colorOf(slice.value) }}
                />
                <span className="flex-1 truncate">{slice.label}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {total ? Math.round((slice.amount / total) * 100) : 0}%
                </span>
                <span className="w-20 text-right font-medium tabular-nums">
                  {money.compact(slice.amount)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </DashboardPanel>
  );
};
