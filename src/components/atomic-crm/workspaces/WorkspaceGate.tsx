import type { ReactNode } from "react";
import { Building } from "lucide-react";
import { useTranslate } from "ra-core";

import { useWorkspaces } from "./WorkspaceContext";

/**
 * A user who may open no workspace sees why there is no data, instead of an
 * empty CRM.
 */
export const WorkspaceGate = ({ children }: { children: ReactNode }) => {
  const { supported, workspaces } = useWorkspaces();
  const translate = useTranslate();
  if (!supported || workspaces.length > 0) return children;
  return (
    <div className="mx-auto mt-16 flex max-w-md flex-col items-center gap-4 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand">
        <Building className="size-6" />
      </span>
      <h1 className="font-display text-2xl">
        {translate("crm.workspaces.none_title", {
          _: "No workspace yet",
        })}
      </h1>
      <p className="text-sm text-muted-foreground">
        {translate("crm.workspaces.none_text", {
          _: "You do not have access to any workspace yet. Ask an administrator to add you to one, then reload this page.",
        })}
      </p>
    </div>
  );
};
