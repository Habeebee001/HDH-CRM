import {
  Bell,
  Building,
  Building2,
  FileText,
  Handshake,
  Import,
  LayoutDashboard,
  type LucideIcon,
  Mail,
  Settings,
  User,
  Users,
} from "lucide-react";
import {
  CanAccess,
  useGetIdentity,
  useTranslate,
  useUserMenu,
} from "ra-core";
import { Link, matchPath, useLocation } from "react-router";
import { RefreshButton } from "@/components/admin/refresh-button";
import { ThemeModeToggle } from "@/components/admin/theme-mode-toggle";
import { UserMenu } from "@/components/admin/user-menu";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { useConfigurationContext } from "../root/ConfigurationContext";
import { ImportPage } from "../misc/ImportPage";
import { ChangelogPage } from "../misc/ChangelogPage";
import { GlobalSearchButton } from "../search/GlobalSearchButton";
import { splitBrandTitle } from "../misc/brand";
import { WorkspaceSwitcher } from "../workspaces/WorkspaceSwitcher";
import { useIsWideLayout } from "@/hooks/use-media-query";
import { roleLabel } from "../sales/roles";
import type { SalesRole } from "../types";
import { usePendingRequestCount } from "./usePendingRequests";

const Header = () => {
  // Wide screens get the sidebar (see Sidebar.tsx) and this glass top bar
  const wide = useIsWideLayout();
  return wide ? <TopBar /> : <InkHeader />;
};

const HeaderUserMenu = () => (
  <UserMenu>
    <ProfileMenu />
    <CanAccess resource="sales" action="list">
      <UsersMenu />
    </CanAccess>
    <CanAccess resource="workspaces" action="edit">
      <WorkspacesMenu />
    </CanAccess>
    <CanAccess resource="sales" action="list">
      <WeeklySummaryMenu />
    </CanAccess>
    <CanAccess resource="configuration" action="edit">
      <SettingsMenu />
    </CanAccess>
    <ImportFromJsonMenuItem />
    <ChangelogMenuItem />
  </UserMenu>
);

/** Glass top bar of the wide layout: search, account requests, tools, user */
const TopBar = () => {
  const { identity } = useGetIdentity();
  const pending = usePendingRequestCount();
  return (
    <header className="glass-bar sticky top-0 z-30">
      <div className="mx-auto flex h-16 max-w-screen-xl items-center gap-3 px-6">
        <GlobalSearchButton className="w-80 rounded-xl bg-background/60" />
        <div className="flex-1" />
        <div className="flex items-center gap-1 text-foreground/80">
          {pending > 0 ? (
            <Link
              to="/sales"
              className="relative flex size-9 items-center justify-center rounded-full hover:bg-foreground/5"
              title={`${pending} account request${pending === 1 ? "" : "s"} waiting`}
              aria-label={`${pending} account request${pending === 1 ? "" : "s"} waiting`}
            >
              <Bell className="size-[1.15rem]" />
              <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-brand text-[0.6rem] font-bold text-brand-foreground">
                {pending}
              </span>
            </Link>
          ) : null}
          <ThemeModeToggle />
          <RefreshButton />
          {identity ? (
            <div className="ml-2 hidden flex-col items-end leading-tight xl:flex">
              <span className="text-sm font-medium text-foreground">
                {identity.fullName}
              </span>
              <span className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-brand">
                {roleLabel((identity.role as SalesRole) ?? "manager")}
              </span>
            </div>
          ) : null}
          <HeaderUserMenu />
        </div>
      </div>
    </header>
  );
};

const InkHeader = () => {
  const { darkModeLogo, title } = useConfigurationContext();
  const location = useLocation();
  const translate = useTranslate();
  const { brand, suffix } = splitBrandTitle(title);

  let currentPath: string | boolean = "/";
  if (matchPath("/", location.pathname)) {
    currentPath = "/";
  } else if (matchPath("/contacts/*", location.pathname)) {
    currentPath = "/contacts";
  } else if (matchPath("/companies/*", location.pathname)) {
    currentPath = "/companies";
  } else if (matchPath("/deals/*", location.pathname)) {
    currentPath = "/deals";
  } else {
    currentPath = false;
  }

  return (
    <nav className="grow sticky top-0 z-40">
      {/* The app bar is always ink-dark: the `dark` class scopes the dark
          palette to it, so buttons and menus inside it adapt automatically. */}
      <header className="dark bg-header text-foreground border-b border-white/[0.06] shadow-[0_8px_24px_-16px_rgba(0,0,0,0.6)]">
        <div className="max-w-screen-xl mx-auto px-6">
          <div className="flex h-16 items-center justify-between gap-3">
            <Link
              to="/"
              aria-label={title}
              className="flex shrink-0 items-center gap-3 text-foreground no-underline"
            >
              <img
                className="h-9 w-auto"
                src={darkModeLogo}
                alt=""
                aria-hidden
              />
              <span className="hidden flex-col leading-none xl:flex">
                <span className="font-display text-[1.4rem] tracking-[0.04em]">
                  {brand}
                </span>
                {suffix ? (
                  <span className="eyebrow mt-1 text-[0.58rem] tracking-[0.42em]">
                    {suffix}
                  </span>
                ) : null}
              </span>
            </Link>
            <WorkspaceSwitcher />
            <nav className="flex h-full items-stretch">
              <NavigationTab
                label={translate("ra.page.dashboard")}
                to="/"
                icon={LayoutDashboard}
                isActive={currentPath === "/"}
              />
              <NavigationTab
                label={translate("resources.contacts.name", {
                  smart_count: 2,
                })}
                to="/contacts"
                icon={Users}
                isActive={currentPath === "/contacts"}
              />
              <NavigationTab
                label={translate("resources.companies.name", {
                  smart_count: 2,
                })}
                to="/companies"
                icon={Building2}
                isActive={currentPath === "/companies"}
              />
              <NavigationTab
                label={translate("resources.deals.name", {
                  smart_count: 2,
                })}
                to="/deals"
                icon={Handshake}
                isActive={currentPath === "/deals"}
              />
            </nav>
            <div className="flex items-center gap-1 text-foreground/80">
              <GlobalSearchButton variant="icon" />
              <ThemeModeToggle />
              <RefreshButton />
              <HeaderUserMenu />
            </div>
          </div>
        </div>
      </header>
    </nav>
  );
};

const NavigationTab = ({
  label,
  to,
  icon: Icon,
  isActive,
}: {
  label: string;
  to: string;
  icon: LucideIcon;
  isActive: boolean;
}) => (
  <Link
    to={to}
    aria-current={isActive ? "page" : undefined}
    className={cn(
      "group relative flex items-center gap-2 px-3 text-sm font-medium tracking-wide transition-colors",
      isActive ? "text-foreground" : "text-foreground/55 hover:text-foreground",
    )}
  >
    <Icon
      className={cn(
        "hidden size-4 transition-colors xl:block",
        isActive ? "text-brand" : "text-current",
      )}
    />
    {label}
    <span
      className={cn(
        "absolute inset-x-3 bottom-0 h-[2px] rounded-full bg-brand transition-all duration-300",
        isActive
          ? "opacity-100 scale-x-100"
          : "opacity-0 scale-x-50 group-hover:opacity-40 group-hover:scale-x-75",
      )}
    />
  </Link>
);

const UsersMenu = () => {
  const translate = useTranslate();
  const userMenuContext = useUserMenu();
  if (!userMenuContext) {
    throw new Error("<UsersMenu> must be used inside <UserMenu?");
  }
  return (
    <DropdownMenuItem
      onClick={userMenuContext.onClose}
      render={<Link to="/sales" className="flex items-center gap-2" />}
    >
      <Users />
      {translate("resources.sales.name", { smart_count: 2 })}
    </DropdownMenuItem>
  );
};

const ProfileMenu = () => {
  const translate = useTranslate();
  const userMenuContext = useUserMenu();
  if (!userMenuContext) {
    throw new Error("<ProfileMenu> must be used inside <UserMenu?");
  }
  return (
    <DropdownMenuItem
      onClick={userMenuContext.onClose}
      render={<Link to="/profile" className="flex items-center gap-2" />}
    >
      <User />
      {translate("crm.profile.title")}
    </DropdownMenuItem>
  );
};

const WorkspacesMenu = () => {
  const translate = useTranslate();
  const userMenuContext = useUserMenu();
  if (!userMenuContext) {
    throw new Error("<WorkspacesMenu> must be used inside <UserMenu>");
  }
  return (
    <DropdownMenuItem
      onClick={userMenuContext.onClose}
      render={<Link to="/workspaces" className="flex items-center gap-2" />}
    >
      <Building />
      {translate("crm.workspaces.title", { _: "Workspaces" })}
    </DropdownMenuItem>
  );
};

const WeeklySummaryMenu = () => {
  const translate = useTranslate();
  const userMenuContext = useUserMenu();
  if (!userMenuContext) {
    throw new Error("<WeeklySummaryMenu> must be used inside <UserMenu>");
  }
  return (
    <DropdownMenuItem
      onClick={userMenuContext.onClose}
      render={
        <Link to="/weekly-summary" className="flex items-center gap-2" />
      }
    >
      <Mail />
      {translate("crm.weekly_summary.title", { _: "Weekly summary" })}
    </DropdownMenuItem>
  );
};

const SettingsMenu = () => {
  const translate = useTranslate();
  const userMenuContext = useUserMenu();
  if (!userMenuContext) {
    throw new Error("<SettingsMenu> must be used inside <UserMenu>");
  }
  return (
    <DropdownMenuItem
      onClick={userMenuContext.onClose}
      render={<Link to="/settings" className="flex items-center gap-2" />}
    >
      <Settings />
      {translate("crm.settings.title")}
    </DropdownMenuItem>
  );
};

const ImportFromJsonMenuItem = () => {
  const translate = useTranslate();
  const userMenuContext = useUserMenu();
  if (!userMenuContext) {
    throw new Error("<ImportFromJsonMenuItem> must be used inside <UserMenu>");
  }
  return (
    <DropdownMenuItem
      onClick={userMenuContext.onClose}
      render={<Link to={ImportPage.path} className="flex items-center gap-2" />}
    >
      <Import />
      {translate("crm.header.import_data")}
    </DropdownMenuItem>
  );
};

const ChangelogMenuItem = () => {
  const translate = useTranslate();
  const userMenuContext = useUserMenu();
  if (!userMenuContext) {
    throw new Error("<ChangelogMenuItem> must be used inside <UserMenu>");
  }
  return (
    <DropdownMenuItem
      onClick={userMenuContext.onClose}
      render={
        <Link to={ChangelogPage.path} className="flex items-center gap-2" />
      }
    >
      <FileText />
      {translate("crm.changelog.title")}
    </DropdownMenuItem>
  );
};
export default Header;
