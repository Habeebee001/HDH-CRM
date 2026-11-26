import { Clock } from "lucide-react";
import { useTranslate } from "ra-core";
import { useIsMobile } from "@/hooks/use-mobile";

import { ActivityLog } from "../activity/ActivityLog";

export function DashboardActivityLog() {
  const isMobile = useIsMobile();
  const translate = useTranslate();
  if (isMobile) {
    return (
      <div className="flex flex-col">
        <div className="flex items-center mb-4 md:mb-2">
          <div className="mr-3 flex">
            <Clock className="text-brand w-5 h-5" />
          </div>
          <h2 className="font-display text-2xl text-foreground">
            {translate("crm.dashboard.latest_activity", {
              _: "Latest Activity",
            })}
          </h2>
        </div>
        <ActivityLog pageSize={10} />
      </div>
    );
  }
  // A glass panel with its title inside (the entries stay two levels above
  // the title, which the end-to-end tests rely on)
  return (
    <div className="glass-card flex flex-col rounded-2xl">
      <div className="flex items-center gap-3 border-b border-foreground/[0.06] px-5 py-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
          <Clock className="size-[1.05rem]" />
        </div>
        <h2 className="font-display text-xl leading-tight text-foreground">
          {translate("crm.dashboard.latest_activity", {
            _: "Latest Activity",
          })}
        </h2>
      </div>
      <div className="p-5">
        <ActivityLog pageSize={10} />
      </div>
    </div>
  );
}
