import { Handshake } from "lucide-react";
import { useGetMany } from "ra-core";
import { useMemo } from "react";
import { Link, useNavigate } from "react-router";

import { findDealLabel } from "../deals/dealUtils";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Company, Sale } from "../types";
import { DashboardPanel } from "./DashboardPanel";
import {
  initialsOf,
  stageColor,
  useDashboardDeals,
  useMoney,
} from "./dashboardData";
import { shortDate } from "./dashboardMetrics";

/** The deals that moved last, with their stage as a pill */
export const LatestDeals = () => {
  const money = useMoney();
  const navigate = useNavigate();
  const { dealStages } = useConfigurationContext();
  const { data: deals = [], isPending } = useDashboardDeals();
  const latest = useMemo(
    () => deals.filter((deal) => !deal.archived_at).slice(0, 6),
    [deals],
  );
  const { data: companies = [] } = useGetMany<Company>(
    "companies",
    { ids: [...new Set(latest.map((deal) => deal.company_id).filter(Boolean))] },
    { enabled: latest.length > 0 },
  );
  const { data: sales = [] } = useGetMany<Sale>(
    "sales",
    { ids: [...new Set(latest.map((deal) => deal.sales_id).filter(Boolean))] },
    { enabled: latest.length > 0 },
  );
  const companyName = (id: unknown) =>
    companies.find((company) => company?.id === id)?.name;
  const owner = (id: unknown) => sales.find((sale) => sale?.id === id);

  return (
    <DashboardPanel
      title="Latest deals"
      eyebrow="Recently updated"
      icon={Handshake}
      bodyClassName="p-0"
      action={
        <Link
          to="/deals"
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
        >
          View all →
        </Link>
      }
    >
      {!isPending && latest.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">
          No deals yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="text-left text-[0.65rem] uppercase tracking-[0.16em] text-muted-foreground">
                <th className="px-5 py-3 font-semibold">Deal</th>
                <th className="px-3 py-3 font-semibold">Stage</th>
                <th className="px-3 py-3 text-right font-semibold">Amount</th>
                <th className="px-3 py-3 font-semibold">Owner</th>
                <th className="px-5 py-3 text-right font-semibold">Updated</th>
              </tr>
            </thead>
            <tbody>
              {latest.map((deal) => {
                const color = stageColor(
                  deal.stage,
                  dealStages.findIndex((stage) => stage.value === deal.stage),
                );
                const manager = owner(deal.sales_id);
                const managerName = manager
                  ? `${manager.first_name} ${manager.last_name}`
                  : "";
                return (
                  <tr
                    key={deal.id}
                    onClick={() => navigate(`/deals/${deal.id}/show`)}
                    className="cursor-pointer border-t border-foreground/[0.06] transition-colors hover:bg-foreground/[0.03]"
                  >
                    <td className="px-5 py-3">
                      <p className="max-w-[16rem] truncate font-medium">
                        {deal.name}
                      </p>
                      <p className="max-w-[16rem] truncate text-xs text-muted-foreground">
                        {companyName(deal.company_id) ?? "—"}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium"
                        style={{
                          background: `color-mix(in oklch, ${color} 18%, transparent)`,
                          color: `color-mix(in oklch, ${color} 70%, var(--foreground))`,
                        }}
                      >
                        <span
                          className="size-1.5 rounded-full"
                          style={{ background: color }}
                        />
                        {findDealLabel(dealStages, deal.stage) ?? deal.stage}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right font-medium tabular-nums">
                      {money.full(deal.amount)}
                    </td>
                    <td className="px-3 py-3">
                      {manager ? (
                        <span className="flex items-center gap-2">
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground text-[0.65rem] font-semibold text-background">
                            {initialsOf(managerName)}
                          </span>
                          <span className="max-w-[8rem] truncate text-xs">
                            {managerName}
                          </span>
                        </span>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-right text-xs text-muted-foreground">
                      {shortDate(deal.updated_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </DashboardPanel>
  );
};
