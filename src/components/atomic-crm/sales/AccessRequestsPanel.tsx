import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, UserPlus, X } from "lucide-react";
import {
  useDataProvider,
  useGetList,
  useNotify,
  useRefresh,
  type Identifier,
} from "ra-core";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

import type { CrmDataProvider } from "../providers/types";
import type { Sale, SalesRole } from "../types";
import { useWorkspaces } from "../workspaces/WorkspaceContext";
import { ROLE_CHOICES } from "./roles";

/**
 * People who asked for an account on the sign-in page. An administrator
 * approves them (with a role and workspaces) or declines them.
 */
export const AccessRequestsPanel = () => {
  const { data: requests = [] } = useGetList<Sale>("sales", {
    filter: { pending_approval: true },
    pagination: { page: 1, perPage: 50 },
    sort: { field: "id", order: "ASC" },
  });
  const [reviewing, setReviewing] = useState<Sale | null>(null);

  if (!requests.length) return null;

  return (
    <section
      className="glass-card mb-4 rounded-2xl p-4 sm:p-5"
      data-testid="access-requests"
    >
      <div className="mb-3 flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-full bg-brand-soft text-brand">
          <UserPlus className="size-4" />
        </span>
        <div>
          <p className="eyebrow">Waiting for you</p>
          <h2 className="font-display text-lg leading-tight">
            Account requests ({requests.length})
          </h2>
        </div>
      </div>
      <ul className="divide-y divide-border/60">
        {requests.map((request) => (
          <AccessRequestRow
            key={request.id}
            request={request}
            onApprove={() => setReviewing(request)}
          />
        ))}
      </ul>
      {reviewing ? (
        <ApproveDialog
          request={reviewing}
          onClose={() => setReviewing(null)}
        />
      ) : null}
    </section>
  );
};

const AccessRequestRow = ({
  request,
  onApprove,
}: {
  request: Sale;
  onApprove: () => void;
}) => {
  const dataProvider = useDataProvider<CrmDataProvider>();
  const notify = useNotify();
  const refresh = useRefresh();
  const [confirming, setConfirming] = useState(false);
  const decline = useMutation({
    mutationFn: () =>
      dataProvider.reviewAccessRequest(request.id, { action: "decline" }),
    onSuccess: () => {
      notify(`Request from ${request.email} declined`);
      refresh();
    },
    onError: (error: Error) => notify(error.message, { type: "error" }),
  });
  const name = `${request.first_name} ${request.last_name}`.trim();
  const initials =
    `${request.first_name?.[0] ?? ""}${request.last_name?.[0] ?? ""}`.toUpperCase() ||
    request.email[0].toUpperCase();

  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background">
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{name || request.email}</p>
        <p className="truncate text-sm text-muted-foreground">
          {request.email}
        </p>
      </div>
      <div className="flex gap-2">
        {confirming ? (
          <>
            <Button
              size="sm"
              variant="destructive"
              disabled={decline.isPending}
              onClick={() => decline.mutate()}
            >
              {decline.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              Yes, decline
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirming(false)}
            >
              Keep
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
              <X className="size-4" />
              Decline
            </Button>
            <Button size="sm" onClick={onApprove}>
              <Check className="size-4" />
              Approve…
            </Button>
          </>
        )}
      </div>
    </li>
  );
};

const ApproveDialog = ({
  request,
  onClose,
}: {
  request: Sale;
  onClose: () => void;
}) => {
  const dataProvider = useDataProvider<CrmDataProvider>();
  const queryClient = useQueryClient();
  const notify = useNotify();
  const refresh = useRefresh();
  const { workspaces, current, supported } = useWorkspaces();
  const [role, setRole] = useState<SalesRole>("sales_rep");
  const [workspaceIds, setWorkspaceIds] = useState<Identifier[]>(
    current ? [current.id] : [],
  );
  const name = `${request.first_name} ${request.last_name}`.trim() || request.email;
  const needsWorkspace = role !== "admin" && supported;

  const approve = useMutation({
    mutationFn: () =>
      dataProvider.reviewAccessRequest(request.id, {
        action: "approve",
        role,
        workspace_ids: role === "admin" ? [] : workspaceIds,
      }),
    onSuccess: ({ email_sent }) => {
      notify(
        email_sent
          ? `${name} is approved and has been told by email.`
          : `${name} is approved. Let them know they can sign in now.`,
        { type: "success" },
      );
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      refresh();
      onClose();
    },
    onError: (error: Error) => notify(error.message, { type: "error" }),
  });

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            Approve {name}
          </DialogTitle>
          <DialogDescription>{request.email}</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="space-y-2">
            <Label>Role</Label>
            <RadioGroup
              value={role}
              onValueChange={(value) => setRole(value as SalesRole)}
              className="gap-2"
            >
              {ROLE_CHOICES.map((choice) => (
                <label
                  key={choice.id}
                  htmlFor={`role-${choice.id}`}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/70 p-3 has-[[data-checked]]:border-brand has-[[data-checked]]:bg-brand-soft/40"
                >
                  <RadioGroupItem
                    id={`role-${choice.id}`}
                    value={choice.id}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block text-sm font-medium">
                      {choice.name}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {choice.description}
                    </span>
                  </span>
                </label>
              ))}
            </RadioGroup>
          </div>
          {needsWorkspace ? (
            <div className="space-y-2">
              <Label>Workspaces they can open</Label>
              <div className="space-y-2 rounded-xl border border-border/70 p-3">
                {workspaces.map((workspace) => {
                  const checked = workspaceIds.includes(workspace.id);
                  return (
                    <label
                      key={workspace.id}
                      className="flex cursor-pointer items-center gap-3 text-sm"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) =>
                          setWorkspaceIds((ids) =>
                            value
                              ? [...ids, workspace.id]
                              : ids.filter((id) => id !== workspace.id),
                          )
                        }
                        aria-label={workspace.name}
                      />
                      {workspace.name}
                    </label>
                  );
                })}
              </div>
            </div>
          ) : role === "admin" ? (
            <p className="text-sm text-muted-foreground">
              Admins open every workspace.
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => approve.mutate()}
            disabled={
              approve.isPending || (needsWorkspace && workspaceIds.length === 0)
            }
          >
            {approve.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
