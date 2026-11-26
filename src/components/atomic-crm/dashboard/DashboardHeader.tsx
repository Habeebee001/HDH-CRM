import { Plus, UserPlus } from "lucide-react";
import { useGetIdentity, useLocaleState, useTranslate } from "ra-core";
import { Link } from "react-router";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { useWorkspaces } from "../workspaces/WorkspaceContext";

const getGreetingKey = (hour: number) =>
  hour < 12
    ? (["crm.dashboard.greeting.morning", "Good morning"] as const)
    : hour < 18
      ? (["crm.dashboard.greeting.afternoon", "Good afternoon"] as const)
      : (["crm.dashboard.greeting.evening", "Good evening"] as const);

/**
 * Personal greeting + quick actions shown at the top of the desktop dashboard.
 */
export const DashboardHeader = () => {
  const { identity } = useGetIdentity();
  const { current: workspace, workspaces } = useWorkspaces();
  const translate = useTranslate();
  const [locale = "en"] = useLocaleState();
  const now = new Date();
  const [greetingKey, greetingDefault] = getGreetingKey(now.getHours());
  const firstName = identity?.fullName?.split(" ")[0];
  const today = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now);

  return (
    <div className="mb-8 flex flex-col gap-5 border-b border-border pb-8 md:flex-row md:items-end md:justify-between">
      <div>
        <p className="eyebrow">
          {today}
          {/* With several workspaces, say which one this dashboard is about */}
          {workspace && workspaces.length > 1 ? (
            <span className="text-brand"> · {workspace.name}</span>
          ) : null}
        </p>
        <h1 className="font-display mt-3 text-4xl leading-tight">
          {translate(greetingKey, { _: greetingDefault })}
          {firstName ? (
            <>
              , <em className="text-brand">{firstName}</em>
            </>
          ) : null}
          .
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {translate("crm.dashboard.subtitle", {
            _: "Here is what is happening with your clients today.",
          })}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Link
          to="/contacts/create"
          className={cn(buttonVariants({ variant: "outline" }), "h-10 px-4")}
        >
          <UserPlus />
          {translate("resources.contacts.action.new", { _: "New contact" })}
        </Link>
        <Link to="/deals/create" className={cn(buttonVariants(), "h-10 px-4")}>
          <Plus />
          {translate("resources.deals.action.new", { _: "New deal" })}
        </Link>
      </div>
    </div>
  );
};
