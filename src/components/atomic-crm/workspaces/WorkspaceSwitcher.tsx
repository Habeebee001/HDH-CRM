import { Building, Check, ChevronsUpDown, Settings2 } from "lucide-react";
import { useCanAccess, useTranslate } from "ra-core";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { useWorkspaces } from "./WorkspaceContext";

/**
 * Shows the current workspace and opens another one. Administrators also get
 * a link to the Workspaces page, where workspaces are created and shared.
 */
export const WorkspaceSwitcher = ({
  variant = "default",
}: {
  /** "compact" for the mobile header: icon and a short name */
  variant?: "default" | "compact";
}) => {
  const { supported, workspaces, current, switchWorkspace } = useWorkspaces();
  const translate = useTranslate();
  const { canAccess: canManage } = useCanAccess({
    resource: "workspaces",
    action: "edit",
  });

  if (!supported || !current) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            aria-label={translate("crm.workspaces.switch", {
              _: "Switch workspace",
            })}
            className={cn(
              "h-9 gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm font-medium text-foreground hover:bg-white/[0.08]",
              variant === "compact" && "h-8 max-w-[45vw] px-2",
            )}
          />
        }
      >
        <Building className="size-4 shrink-0 text-brand" />
        <span
          className={cn(
            "truncate",
            variant === "compact" ? "max-w-[30vw]" : "max-w-[11rem]",
          )}
        >
          {current.name}
        </span>
        <ChevronsUpDown className="size-3.5 shrink-0 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            {translate("crm.workspaces.switch", { _: "Switch workspace" })}
          </DropdownMenuLabel>
          {workspaces.map((workspace) => (
            <DropdownMenuItem
              key={workspace.id}
              onClick={() =>
                workspace.id !== current.id && switchWorkspace(workspace.id)
              }
              className="flex items-center gap-2"
            >
              <Check
                className={cn(
                  "size-4 shrink-0",
                  workspace.id === current.id ? "opacity-100" : "opacity-0",
                )}
              />
              <span className="truncate">{workspace.name}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        {canManage ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              render={
                <Link to="/workspaces" className="flex items-center gap-2" />
              }
            >
              <Settings2 className="size-4" />
              {translate("crm.workspaces.manage", {
                _: "Manage workspaces",
              })}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
