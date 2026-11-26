import {
  Building,
  Building2,
  Handshake,
  LayoutDashboard,
  type LucideIcon,
  Mail,
  Settings,
  ShieldCheck,
  Users,
  UsersRound,
} from "lucide-react";
import { CanAccess, useGetIdentity, useTranslate } from "ra-core";
import { Link, matchPath, useLocation } from "react-router";
import { cn } from "@/lib/utils";

import { splitBrandTitle } from "../misc/brand";
import { useConfigurationContext } from "../root/ConfigurationContext";
import { roleLabel } from "../sales/roles";
import type { SalesRole } from "../types";
import { WorkspaceSwitcher } from "../workspaces/WorkspaceSwitcher";
import { usePendingRequestCount } from "./usePendingRequests";

const isActive = (pathname: string, to: string) =>
  to === "/" ? !!matchPath("/", pathname) : !!matchPath(`${to}/*`, pathname);

/**
 * The ink sidebar of the wide desktop layout: brand, who is signed in, the
 * workspace, the main menu and, for administrators, the administration menu.
 */
export const Sidebar = () => {
  const { darkModeLogo, title } = useConfigurationContext();
  const { brand, suffix } = splitBrandTitle(title);
  const translate = useTranslate();
  const { pathname } = useLocation();
  const pending = usePendingRequestCount();

  return (
    <aside
      className="dark glass-ink fixed inset-y-0 left-0 z-40 flex w-64 flex-col gap-6 overflow-y-auto px-4 py-6 text-foreground"
      aria-label={translate("crm.sidebar.label", { _: "Navigation" })}
    >
      <Link
        to="/"
        className="flex items-center gap-3 px-2 text-foreground no-underline"
      >
        <img className="h-10 w-auto" src={darkModeLogo} alt="" aria-hidden />
        <span className="flex flex-col leading-none">
          <span className="font-display text-[1.5rem] tracking-[0.04em]">
            {brand}
          </span>
          {suffix ? (
            <span className="eyebrow mt-1 text-[0.58rem] tracking-[0.42em]">
              {suffix}
            </span>
          ) : null}
        </span>
      </Link>

      <IdentityCard />

      <WorkspaceSwitcher variant="sidebar" />

      <nav className="flex flex-col gap-1">
        <p className="eyebrow mb-2 px-3 text-[0.6rem]">
          {translate("crm.sidebar.main_menu", { _: "Main menu" })}
        </p>
        <SidebarLink
          to="/"
          icon={LayoutDashboard}
          label={translate("ra.page.dashboard")}
          active={isActive(pathname, "/")}
        />
        <SidebarLink
          to="/contacts"
          icon={Users}
          label={translate("resources.contacts.name", { smart_count: 2 })}
          active={isActive(pathname, "/contacts")}
        />
        <SidebarLink
          to="/companies"
          icon={Building2}
          label={translate("resources.companies.name", { smart_count: 2 })}
          active={isActive(pathname, "/companies")}
        />
        <SidebarLink
          to="/deals"
          icon={Handshake}
          label={translate("resources.deals.name", { smart_count: 2 })}
          active={isActive(pathname, "/deals")}
        />
      </nav>

      <CanAccess resource="sales" action="list">
        <nav className="flex flex-col gap-1">
          <p className="eyebrow mb-2 px-3 text-[0.6rem]">
            {translate("crm.sidebar.administration", { _: "Administration" })}
          </p>
          <SidebarLink
            to="/sales"
            icon={UsersRound}
            label={translate("resources.sales.name", { smart_count: 2 })}
            active={isActive(pathname, "/sales")}
            badge={pending}
            badgeLabel={`${pending} account request${pending === 1 ? "" : "s"} waiting`}
          />
          <SidebarLink
            to="/workspaces"
            icon={Building}
            label={translate("crm.workspaces.title", { _: "Workspaces" })}
            active={isActive(pathname, "/workspaces")}
          />
          <SidebarLink
            to="/weekly-summary"
            icon={Mail}
            label={translate("crm.weekly_summary.title", {
              _: "Weekly summary",
            })}
            active={isActive(pathname, "/weekly-summary")}
          />
          <SidebarLink
            to="/settings"
            icon={Settings}
            label={translate("crm.settings.title")}
            active={isActive(pathname, "/settings")}
          />
        </nav>
      </CanAccess>

      <div className="mt-auto rounded-2xl border border-white/[0.07] bg-white/[0.04] p-4">
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck className="size-4 text-brand" />
          <span className="eyebrow text-[0.58rem]">
            {translate("crm.sidebar.enterprise", { _: "Enterprise" })}
          </span>
        </div>
        <p className="font-display text-base leading-snug">
          {translate("crm.auth.tagline_line_1", { _: "Every relationship," })}{" "}
          <em className="text-brand">
            {translate("crm.auth.tagline_line_2", { _: "beautifully kept." })}
          </em>
        </p>
      </div>
    </aside>
  );
};

const IdentityCard = () => {
  const { identity } = useGetIdentity();
  if (!identity) return null;
  const name = identity.fullName ?? "";
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.04] p-3">
      {identity.avatar ? (
        <img
          src={identity.avatar}
          alt=""
          className="size-10 rounded-full object-cover ring-2 ring-brand/40"
        />
      ) : (
        <span className="flex size-10 items-center justify-center rounded-full bg-brand text-sm font-semibold text-brand-foreground">
          {initials}
        </span>
      )}
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {roleLabel((identity.role as SalesRole) ?? "manager")}
        </p>
      </div>
    </div>
  );
};

const SidebarLink = ({
  to,
  icon: Icon,
  label,
  active,
  badge = 0,
  badgeLabel,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
  active: boolean;
  badge?: number;
  badgeLabel?: string;
}) => (
  <Link
    to={to}
    aria-current={active ? "page" : undefined}
    className={cn(
      "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium tracking-wide transition-colors",
      active
        ? "bg-white/[0.08] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
        : "text-foreground/60 hover:bg-white/[0.05] hover:text-foreground",
    )}
  >
    <span
      className={cn(
        "absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-brand transition-opacity",
        active ? "opacity-100" : "opacity-0",
      )}
    />
    <Icon
      className={cn(
        "size-[1.1rem] transition-colors",
        active ? "text-brand" : "text-current",
      )}
    />
    <span className="flex-1">{label}</span>
    {badge > 0 ? (
      <span
        className="min-w-5 rounded-full bg-brand px-1.5 text-center text-[0.7rem] font-semibold leading-5 text-brand-foreground"
        title={badgeLabel}
      >
        {badge}
      </span>
    ) : null}
  </Link>
);
