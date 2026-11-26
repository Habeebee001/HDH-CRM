import { useMutation } from "@tanstack/react-query";
import {
  CanAccess,
  Navigate,
  useDataProvider,
  useNotify,
  useRedirect,
  useTranslate,
} from "ra-core";
import type { SubmitHandler } from "react-hook-form";
import { SimpleForm } from "@/components/admin/simple-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import type { CrmDataProvider } from "../providers/types";
import type { SalesFormData } from "../types";
import { getSalesErrorNotification } from "./salesErrorNotification";
import { SalesInputs } from "./SalesInputs";
import { setPendingInvite } from "./pendingInvite";
import { useWorkspaces } from "../workspaces/WorkspaceContext";

export function SalesCreate() {
  const dataProvider = useDataProvider<CrmDataProvider>();
  const notify = useNotify();
  const translate = useTranslate();
  const redirect = useRedirect();
  const { current: workspace, workspaces } = useWorkspaces();

  const { mutate } = useMutation({
    mutationKey: ["signup"],
    mutationFn: async (data: SalesFormData) => {
      return dataProvider.salesCreate(data);
    },
    onSuccess: (sale) => {
      if (sale?.invite_link && !sale.email_sent) {
        // No email server: the Users list shows the link to share instead.
        setPendingInvite({
          link: sale.invite_link,
          name: `${sale.first_name} ${sale.last_name}`.trim(),
        });
        notify("resources.sales.create.success_link", {
          messageArgs: {
            _: "User created. Share their invitation link so they can set their password.",
          },
        });
      } else {
        notify("resources.sales.create.success", {
          messageArgs: {
            _: "User created. They will soon receive an email to set their password.",
          },
        });
      }
      redirect("/sales");
    },
    onError: (error) => {
      const { message, args } = getSalesErrorNotification(
        error,
        error.message ||
          translate("resources.sales.create.error", {
            _: "An error occurred while creating the user.",
          }),
      );
      notify(message, { type: "error", messageArgs: args });
    },
  });
  const onSubmit: SubmitHandler<SalesFormData> = async (data) => {
    mutate(data);
  };

  return (
    <CanAccess
      resource="sales"
      action="create"
      accessDenied={<Navigate to="/access-denied" />}
    >
      <div className="max-w-lg w-full mx-auto mt-8">
        <Card>
          <CardHeader>
            <CardTitle>
              {translate("resources.sales.create.title", {
                _: "Create a new user",
              })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {workspace && workspaces.length > 1 ? (
              <p className="mb-4 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                {translate("resources.sales.create.workspace_hint", {
                  name: workspace.name,
                  _: `They will be able to open the workspace “${workspace.name}”. Give them access to other workspaces on the Workspaces page.`,
                })}
              </p>
            ) : null}
            <SimpleForm onSubmit={onSubmit as SubmitHandler<any>}>
              <SalesInputs />
            </SimpleForm>
          </CardContent>
        </Card>
      </div>
    </CanAccess>
  );
}
