import { startOfDay, startOfMonth, subDays } from "date-fns";
import {
  CheckSquare,
  CircleDollarSign,
  type LucideIcon,
  TrendingUp,
  Users,
} from "lucide-react";
import { useGetList } from "ra-core";
import { useMemo, type ReactNode } from "react";
import { cn } from "@/lib/utils";

import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Contact, Task } from "../types";
import { Ring } from "./charts";
import { useDashboardDeals, useMoney } from "./dashboardData";
import { headlineFigures } from "./dashboardMetrics";

const percent = (value: number) => `${Math.round(value * 100)}%`;

/**
 * The four headline cards, with rings (after the CRMi reference). `compact`
 * gives small tiles without rings, two per row, for phones.
 */
export const KpiCards = ({ compact = false }: { compact?: boolean }) => {
  const money = useMoney();
  const { dealPipelineStatuses } = useConfigurationContext();
  const { data: deals = [] } = useDashboardDeals();
  const figures = useMemo(
    () => headlineFigures(deals, dealPipelineStatuses),
    [deals, dealPipelineStatuses],
  );

  // Dates are rounded so that the queries stay the same between renders
  const { monthStart, thirtyDaysAgo, today } = useMemo(() => {
    const now = new Date();
    return {
      monthStart: startOfMonth(now).toISOString(),
      thirtyDaysAgo: startOfDay(subDays(now, 30)).toISOString(),
      today: startOfDay(now).toISOString(),
    };
  }, []);
  const one = { page: 1, perPage: 1 };
  const { total: contacts = 0 } = useGetList<Contact>("contacts", {
    pagination: one,
  });
  const { total: newContacts = 0 } = useGetList<Contact>("contacts", {
    pagination: one,
    filter: { "first_seen@gte": monthStart },
  });
  const { total: activeContacts = 0 } = useGetList<Contact>("contacts", {
    pagination: one,
    filter: { "last_seen@gte": thirtyDaysAgo },
  });
  const { total: tasks = 0 } = useGetList<Task>("tasks", { pagination: one });
  const { total: openTasks = 0 } = useGetList<Task>("tasks", {
    pagination: one,
    filter: { "done_date@is": null },
  });
  const { total: overdueTasks = 0 } = useGetList<Task>("tasks", {
    pagination: one,
    filter: { "done_date@is": null, "due_date@lt": today },
  });

  if (compact) {
    return (
      <div className="grid grid-cols-2 gap-3">
        <CompactTile
          icon={CircleDollarSign}
          label="Open pipeline"
          value={money.compact(figures.openAmount)}
          tone="ink"
        />
        <CompactTile
          icon={TrendingUp}
          label={`Won in ${new Date().getFullYear()}`}
          value={money.compact(figures.wonThisYear)}
          tone="sage"
        />
        <CompactTile
          icon={Users}
          label="Contacts"
          value={contacts.toLocaleString("en-US")}
        />
        <CompactTile
          icon={CheckSquare}
          label={overdueTasks ? `Open tasks · ${overdueTasks} overdue` : "Open tasks"}
          value={openTasks.toLocaleString("en-US")}
          tone="terracotta"
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        icon={Users}
        label="Contacts"
        value={contacts.toLocaleString("en-US")}
        detail={`+${newContacts.toLocaleString("en-US")} this month`}
        ring={contacts ? activeContacts / contacts : 0}
        ringCaption="active 30d"
        ringLabel="Share of contacts reached in the last 30 days"
      />
      <KpiCard
        icon={CircleDollarSign}
        label="Open pipeline"
        value={money.compact(figures.openAmount)}
        detail={`${figures.openCount} open deal${figures.openCount === 1 ? "" : "s"}`}
        ring={figures.closingShare}
        ringCaption="closing this month"
        ringLabel="Share of the open pipeline expected to close this month"
        tone="ink"
      />
      <KpiCard
        icon={TrendingUp}
        label={`Won in ${new Date().getFullYear()}`}
        value={money.compact(figures.wonThisYear)}
        detail={`${figures.wonCountThisYear} deal${figures.wonCountThisYear === 1 ? "" : "s"} won`}
        ring={figures.winRate}
        ringCaption="win rate"
        ringLabel="Won deals among won and lost deals"
        tone="sage"
      />
      <KpiCard
        icon={CheckSquare}
        label="Open tasks"
        value={openTasks.toLocaleString("en-US")}
        detail={
          overdueTasks ? (
            <span className="text-destructive">{overdueTasks} overdue</span>
          ) : (
            "Nothing overdue"
          )
        }
        ring={tasks ? (tasks - openTasks) / tasks : 0}
        ringCaption="done"
        ringLabel="Share of tasks done"
        tone="terracotta"
      />
    </div>
  );
};

const TONES = {
  gold: { tile: "bg-brand text-brand-foreground", ring: "var(--brand)" },
  ink: { tile: "bg-foreground text-background", ring: "var(--foreground)" },
  sage: { tile: "bg-[#6E8B5E] text-white", ring: "#6E8B5E" },
  terracotta: { tile: "bg-[#A4453F] text-white", ring: "#A4453F" },
};

const KpiCard = ({
  icon: Icon,
  label,
  value,
  detail,
  ring,
  ringCaption,
  ringLabel,
  tone = "gold",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: ReactNode;
  ring: number;
  ringCaption: string;
  ringLabel: string;
  tone?: keyof typeof TONES;
}) => (
  <div className="glass-card flex items-center justify-between gap-3 rounded-2xl p-5">
    <div className="min-w-0">
      <span
        className={cn(
          "mb-4 flex size-11 items-center justify-center rounded-xl shadow-sm",
          TONES[tone].tile,
        )}
      >
        <Icon className="size-5" />
      </span>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="font-display text-[1.7rem] leading-tight tabular-nums">
        {value}
      </p>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">{detail}</p>
    </div>
    <Ring value={ring} color={TONES[tone].ring} label={`${ringLabel}: ${percent(ring)}`}>
      <span className="text-sm font-semibold tabular-nums">{percent(ring)}</span>
      <span className="max-w-14 text-[0.58rem] leading-tight text-muted-foreground">
        {ringCaption}
      </span>
    </Ring>
  </div>
);

const CompactTile = ({
  icon: Icon,
  label,
  value,
  tone = "gold",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone?: keyof typeof TONES;
}) => (
  <div className="glass-card rounded-2xl p-3.5">
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-lg",
          TONES[tone].tile,
        )}
      >
        <Icon className="size-3.5" />
      </span>
      <p className="truncate text-xs text-muted-foreground">{label}</p>
    </div>
    <p className="font-display mt-2 text-2xl leading-tight tabular-nums">
      {value}
    </p>
  </div>
);
