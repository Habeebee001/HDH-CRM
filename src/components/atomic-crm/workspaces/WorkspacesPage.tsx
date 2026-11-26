import { useState } from "react";
import {
  Building,
  Building2,
  Handshake,
  Pencil,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import {
  CanAccess,
  Navigate,
  useDataProvider,
  useGetList,
  useNotify,
  useTranslate,
} from "ra-core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { CrmDataProvider } from "../providers/types";
import type { Sale } from "../types";
import { useWorkspaces } from "./WorkspaceContext";
import type { Workspace } from "./types";

/**
 * Administrators create, rename, share and delete workspaces here. Each
 * workspace (a branch, a business…) has its own contacts, companies, deals,
 * notes and tasks.
 */
export const WorkspacesPage = () => (
  <CanAccess
    resource="workspaces"
    action="edit"
    accessDenied={<Navigate to="/" />}
  >
    <WorkspacesPageContent />
  </CanAccess>
);

WorkspacesPage.path = "/workspaces";

const WorkspacesPageContent = () => {
  const translate = useTranslate();
  const { workspaces, current, switchWorkspace, isPending } = useWorkspaces();
  const { data: sales = [] } = useGetList<Sale>("sales", {
    pagination: { page: 1, perPage: 500 },
    sort: { field: "first_name", order: "ASC" },
  });
  const [editing, setEditing] = useState<Workspace | "new" | null>(null);
  const [deleting, setDeleting] = useState<Workspace | null>(null);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 flex flex-col gap-4 border-b border-border pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="eyebrow">
            {translate("crm.workspaces.eyebrow", { _: "Administration" })}
          </p>
          <h1 className="font-display mt-2 text-3xl">
            {translate("crm.workspaces.title", { _: "Workspaces" })}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {translate("crm.workspaces.description", {
              _: "Separate branches or businesses. Each workspace has its own contacts, companies, deals, notes and tasks. Administrators can open every workspace; other users only the ones you give them.",
            })}
          </p>
        </div>
        <Button onClick={() => setEditing("new")} className="h-10 px-4">
          <Plus />
          {translate("crm.workspaces.new", { _: "New workspace" })}
        </Button>
      </div>

      {isPending ? null : (
        <div className="grid gap-4 md:grid-cols-2">
          {workspaces.map((workspace) => (
            <WorkspaceCard
              key={workspace.id}
              workspace={workspace}
              sales={sales}
              isCurrent={workspace.id === current?.id}
              isLast={workspaces.length <= 1}
              onOpen={() => switchWorkspace(workspace.id)}
              onEdit={() => setEditing(workspace)}
              onDelete={() => setDeleting(workspace)}
            />
          ))}
        </div>
      )}

      {editing ? (
        <WorkspaceDialog
          workspace={editing === "new" ? undefined : editing}
          sales={sales}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {deleting ? (
        <DeleteWorkspaceDialog
          workspace={deleting}
          onClose={() => setDeleting(null)}
        />
      ) : null}
    </div>
  );
};

const fullName = (sale: Sale) =>
  `${sale.first_name} ${sale.last_name}`.trim() || sale.email;

const WorkspaceCard = ({
  workspace,
  sales,
  isCurrent,
  isLast,
  onOpen,
  onEdit,
  onDelete,
}: {
  workspace: Workspace;
  sales: Sale[];
  isCurrent: boolean;
  isLast: boolean;
  onOpen(): void;
  onEdit(): void;
  onDelete(): void;
}) => {
  const translate = useTranslate();
  const members = sales.filter(
    (sale) => !sale.administrator && workspace.member_ids.includes(+sale.id),
  );
  const isEmpty =
    workspace.nb_contacts + workspace.nb_companies + workspace.nb_deals === 0;

  return (
    <Card className={isCurrent ? "ring-1 ring-brand/60" : undefined}>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand">
              <Building className="size-5" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-medium">{workspace.name}</h2>
              {isCurrent ? (
                <Badge variant="outline" className="mt-1">
                  {translate("crm.workspaces.current", { _: "Current" })}
                </Badge>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label={translate("crm.workspaces.edit", { _: "Edit" })}
              title={translate("crm.workspaces.edit", { _: "Edit" })}
              onClick={onEdit}
            >
              <Pencil />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={translate("crm.workspaces.delete", { _: "Delete" })}
              title={
                isLast
                  ? translate("crm.workspaces.delete_last", {
                      _: "The last workspace cannot be deleted",
                    })
                  : !isEmpty
                    ? translate("crm.workspaces.delete_not_empty", {
                        _: "Only an empty workspace can be deleted",
                      })
                    : translate("crm.workspaces.delete", { _: "Delete" })
              }
              disabled={isLast || !isEmpty}
              onClick={onDelete}
            >
              <Trash2 />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-sm">
          <Stat
            icon={Users}
            value={workspace.nb_contacts}
            label={translate("resources.contacts.name", { smart_count: 2 })}
          />
          <Stat
            icon={Building2}
            value={workspace.nb_companies}
            label={translate("resources.companies.name", { smart_count: 2 })}
          />
          <Stat
            icon={Handshake}
            value={workspace.nb_deals}
            label={translate("resources.deals.name", { smart_count: 2 })}
          />
        </div>

        <p className="text-sm text-muted-foreground">
          {members.length
            ? translate("crm.workspaces.members_list", {
                names: members.map(fullName).join(", "),
                _: `Members: ${members.map(fullName).join(", ")}`,
              })
            : translate("crm.workspaces.admins_only", {
                _: "Only administrators can open it.",
              })}
        </p>

        {!isCurrent ? (
          <Button variant="outline" onClick={onOpen} className="self-start">
            {translate("crm.workspaces.open", { _: "Open this workspace" })}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
};

const Stat = ({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Users;
  value: number;
  label: string;
}) => (
  <div className="rounded-md border border-border px-3 py-2">
    <div className="flex items-center gap-1.5 text-muted-foreground">
      <Icon className="size-3.5" />
      <span className="truncate text-xs">{label}</span>
    </div>
    <div className="mt-1 text-lg font-medium tabular-nums">{value}</div>
  </div>
);

/** Error code of a failed request (PostgREST error body), if any */
const errorCode = (error: unknown): string | undefined => {
  const body = (error as { body?: { code?: unknown } })?.body;
  return typeof body?.code === "string" ? body.code : undefined;
};

const WorkspaceDialog = ({
  workspace,
  sales,
  onClose,
}: {
  /** The workspace to edit, or undefined to create one */
  workspace?: Workspace;
  sales: Sale[];
  onClose(): void;
}) => {
  const translate = useTranslate();
  const notify = useNotify();
  const dataProvider = useDataProvider<CrmDataProvider>();
  const { refetch, switchWorkspace } = useWorkspaces();
  const [name, setName] = useState(workspace?.name ?? "");
  const [memberIds, setMemberIds] = useState<number[]>(
    workspace?.member_ids ?? [],
  );
  const [saving, setSaving] = useState(false);
  const staff = sales.filter((sale) => !sale.administrator && !sale.disabled);
  const trimmed = name.trim();

  const toggle = (id: number, checked: boolean) =>
    setMemberIds((ids) =>
      checked
        ? [...new Set([...ids, id])]
        : ids.filter((other) => other !== id),
    );

  const save = async (openAfterwards: boolean) => {
    if (!trimmed) return;
    setSaving(true);
    try {
      let id = workspace?.id;
      if (workspace) {
        if (trimmed !== workspace.name) {
          await dataProvider.update("workspaces", {
            id: workspace.id,
            data: { name: trimmed },
            previousData: workspace,
          });
        }
      } else {
        const { data } = await dataProvider.create("workspaces", {
          data: { name: trimmed },
        });
        id = Number(data.id);
      }
      // Administrators keep their membership rows (they open everything anyway)
      const adminIds = (workspace?.member_ids ?? []).filter((memberId) =>
        sales.some((sale) => +sale.id === memberId && sale.administrator),
      );
      await dataProvider.setWorkspaceMembers(id!, [
        ...new Set([...adminIds, ...memberIds]),
      ]);
      notify(workspace ? "crm.workspaces.saved" : "crm.workspaces.created", {
        type: "success",
        messageArgs: {
          _: workspace ? "Workspace saved" : "Workspace created",
        },
      });
      if (openAfterwards) {
        switchWorkspace(id!);
        return;
      }
      refetch();
      onClose();
    } catch (error) {
      console.error(error);
      notify("crm.workspaces.save_error", {
        type: "error",
        messageArgs: { _: "The workspace could not be saved. Please retry." },
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {workspace
              ? translate("crm.workspaces.edit_title", { _: "Edit workspace" })
              : translate("crm.workspaces.new", { _: "New workspace" })}
          </DialogTitle>
          <DialogDescription>
            {translate("crm.workspaces.form_hint", {
              _: "For example a branch (HDH Abuja) or another business.",
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="workspace-name">
              {translate("crm.workspaces.name", { _: "Name" })}
            </Label>
            <Input
              id="workspace-name"
              value={name}
              maxLength={80}
              autoFocus
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && trimmed && !saving) {
                  void save(false);
                }
              }}
            />
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">
              {translate("crm.workspaces.who", {
                _: "Who can open it",
              })}
            </span>
            <p className="text-xs text-muted-foreground">
              {translate("crm.workspaces.admins_note", {
                _: "Administrators can always open every workspace.",
              })}
            </p>
            {staff.length ? (
              <div className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-md border border-border p-2">
                {staff.map((sale) => (
                  <label
                    key={sale.id}
                    className="flex cursor-pointer items-center gap-3 rounded px-2 py-1.5 text-sm hover:bg-muted"
                  >
                    <Checkbox
                      checked={memberIds.includes(+sale.id)}
                      onCheckedChange={(checked) => toggle(+sale.id, checked)}
                    />
                    <span className="truncate">{fullName(sale)}</span>
                    <span className="ml-auto truncate text-xs text-muted-foreground">
                      {sale.email}
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
                {translate("crm.workspaces.no_staff", {
                  _: "No other users yet. Add your team under Users, then choose here who can open this workspace.",
                })}
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {translate("ra.action.cancel")}
          </Button>
          {workspace ? null : (
            <Button
              variant="outline"
              onClick={() => save(true)}
              disabled={!trimmed || saving}
            >
              {translate("crm.workspaces.create_and_open", {
                _: "Create and open",
              })}
            </Button>
          )}
          <Button onClick={() => save(false)} disabled={!trimmed || saving}>
            {workspace
              ? translate("ra.action.save")
              : translate("crm.workspaces.create", { _: "Create" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const DeleteWorkspaceDialog = ({
  workspace,
  onClose,
}: {
  workspace: Workspace;
  onClose(): void;
}) => {
  const translate = useTranslate();
  const notify = useNotify();
  const dataProvider = useDataProvider<CrmDataProvider>();
  const { refetch, current, workspaces, switchWorkspace } = useWorkspaces();
  const [deleting, setDeleting] = useState(false);

  const confirm = async () => {
    setDeleting(true);
    try {
      await dataProvider.delete("workspaces", {
        id: workspace.id,
        previousData: workspace,
      });
      notify("crm.workspaces.deleted", {
        type: "info",
        messageArgs: { _: "Workspace deleted" },
      });
      if (workspace.id === current?.id) {
        const next = workspaces.find(({ id }) => id !== workspace.id);
        if (next) switchWorkspace(next.id);
        return;
      }
      refetch();
      onClose();
    } catch (error) {
      const code = errorCode(error);
      notify(
        code === "23503"
          ? "crm.workspaces.delete_not_empty"
          : code === "23514"
            ? "crm.workspaces.delete_last"
            : "crm.workspaces.delete_error",
        {
          type: "error",
          messageArgs: {
            _:
              code === "23503"
                ? "Only an empty workspace can be deleted"
                : code === "23514"
                  ? "The last workspace cannot be deleted"
                  : "The workspace could not be deleted. Please retry.",
          },
        },
      );
      setDeleting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {translate("crm.workspaces.delete_title", {
              name: workspace.name,
              _: `Delete “${workspace.name}”?`,
            })}
          </DialogTitle>
          <DialogDescription>
            {translate("crm.workspaces.delete_hint", {
              _: "The workspace is empty. Its tags and member list will be deleted too.",
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={deleting}>
            {translate("ra.action.cancel")}
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={deleting}>
            {translate("crm.workspaces.delete", { _: "Delete" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
