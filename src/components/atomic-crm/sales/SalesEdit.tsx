import { useMutation } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import { useState } from "react";
import {
  useDataProvider,
  useEditController,
  useNotify,
  useRecordContext,
  useRedirect,
  useTranslate,
} from "ra-core";
import type { SubmitHandler } from "react-hook-form";
import { SimpleForm } from "@/components/admin/simple-form";
import { CancelButton } from "@/components/admin/cancel-button";
import { SaveButton } from "@/components/admin/form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import type { CrmDataProvider } from "../providers/types";
import type { Sale, SalesFormData } from "../types";
import { getSalesErrorNotification } from "./salesErrorNotification";
import { config } from "../root/config";
import { SalesInputs } from "./SalesInputs";
import { ShareLinkDialog } from "./ShareLinkDialog";

function EditToolbar() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <PasswordLinkButton />
      <div className="flex gap-4 ml-auto">
        <CancelButton />
        <SaveButton />
      </div>
    </div>
  );
}

/**
 * Creates a one-time link for the user to choose a new password (or finish
 * their invitation), emailed when the server has email set up.
 */
function PasswordLinkButton() {
  const record = useRecordContext<Sale>();
  const dataProvider = useDataProvider<CrmDataProvider>();
  const notify = useNotify();
  const translate = useTranslate();
  const [link, setLink] = useState<string | null>(null);

  const { mutate, isPending } = useMutation({
    mutationKey: ["salesPasswordLink"],
    mutationFn: async () => {
      if (!record) throw new Error("Record not found");
      return dataProvider.salesPasswordLink(record.id, !!config.emailEnabled);
    },
    onSuccess: (result) => {
      if (result.email_sent) {
        notify("resources.sales.password_link.sent", {
          messageArgs: {
            email: record?.email,
            _: "A link to choose a new password was emailed to %{email}.",
          },
        });
      }
      if (result.link) setLink(result.link);
    },
    onError: () => {
      notify("resources.sales.password_link.error", {
        type: "error",
        messageArgs: { _: "Could not create the password link." },
      });
    },
  });

  if (!record) return null;
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        onClick={() => mutate()}
        disabled={isPending}
        className="text-muted-foreground"
      >
        <KeyRound className="text-brand" />
        {translate("resources.sales.password_link.action", {
          _: "Password link",
        })}
      </Button>
      {link ? (
        <ShareLinkDialog
          open
          onClose={() => setLink(null)}
          title={translate("resources.sales.password_link.title", {
            name: `${record.first_name} ${record.last_name}`,
            _: "Password link for %{name}",
          })}
          description={translate("resources.sales.password_link.description", {
            _: "Send this link so they can choose a new password. Older links stop working.",
          })}
          link={link}
          shareMessage={translate("resources.sales.password_link.message", {
            _: "Here is your link to choose a new HDH CRM password:",
          })}
        />
      ) : null}
    </>
  );
}

export function SalesEdit() {
  const { record } = useEditController();

  const dataProvider = useDataProvider<CrmDataProvider>();
  const notify = useNotify();
  const redirect = useRedirect();
  const translate = useTranslate();

  const { mutate } = useMutation({
    mutationKey: ["signup"],
    mutationFn: async (data: SalesFormData) => {
      if (!record) {
        throw new Error(
          translate("resources.sales.edit.record_not_found", {
            _: "Record not found",
          }),
        );
      }
      return dataProvider.salesUpdate(record.id, data);
    },
    onSuccess: () => {
      redirect("/sales");
      notify("resources.sales.edit.success", {
        messageArgs: {
          _: "User updated successfully",
        },
      });
    },
    onError: (error) => {
      const { message, args } = getSalesErrorNotification(
        error,
        "resources.sales.edit.error",
      );
      notify(message, {
        type: "error",
        messageArgs: { ...args, _: "An error occurred. Please try again." },
      });
    },
  });

  const onSubmit: SubmitHandler<SalesFormData> = async (data) => {
    mutate(data);
  };

  return (
    <div className="max-w-lg w-full mx-auto mt-8">
      <Card>
        <CardContent>
          <SimpleForm
            toolbar={<EditToolbar />}
            onSubmit={onSubmit as SubmitHandler<any>}
            record={record}
          >
            <SaleEditTitle />
            <SalesInputs />
          </SimpleForm>
        </CardContent>
      </Card>
    </div>
  );
}

const SaleEditTitle = () => {
  const record = useRecordContext<Sale>();
  const translate = useTranslate();
  if (!record) return null;
  return (
    <h2 className="text-lg font-semibold mb-4">
      {translate("resources.sales.edit.title", {
        name: `${record.first_name} ${record.last_name}`,
      })}
    </h2>
  );
};
