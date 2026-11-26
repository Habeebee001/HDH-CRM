import { Plus, Users } from "lucide-react";
import { useGetIdentity, useGetList, useTranslate } from "ra-core";
import { Link } from "react-router";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { SimpleList } from "../simple-list/SimpleList";
import { Avatar } from "../contacts/Avatar";
import type { Contact } from "../types";

export const HotContacts = () => {
  const { identity } = useGetIdentity();
  const translate = useTranslate();
  const {
    data: contactData,
    total: contactTotal,
    isPending: contactsLoading,
  } = useGetList<Contact>(
    "contacts",
    {
      pagination: { page: 1, perPage: 10 },
      sort: { field: "last_seen", order: "DESC" },
      filter: { status: "hot", sales_id: identity?.id },
    },
    { enabled: Number.isInteger(identity?.id) },
  );

  return (
    <div className="glass-card flex flex-col rounded-2xl">
      <div className="flex items-center gap-3 border-b border-foreground/[0.06] px-5 py-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
          <Users className="size-[1.05rem]" />
        </div>
        <h2 className="font-display text-xl leading-tight text-foreground">
          {translate("resources.contacts.hot.title")}
        </h2>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={
                <Link
                  to="/contacts/create"
                  aria-label={translate("resources.contacts.action.create")}
                  className={cn(
                    buttonVariants({ variant: "ghost", size: "sm" }),
                    "ml-auto text-muted-foreground",
                  )}
                />
              }
            >
              <Plus className="w-4 h-4 text-primary" />
            </TooltipTrigger>
            <TooltipContent>
              {translate("resources.contacts.action.create")}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <div className="py-1">
        <SimpleList<Contact>
          linkType="show"
          data={contactData}
          total={contactTotal}
          isPending={contactsLoading}
          resource="contacts"
          className="[&>li:first-child>a]:rounded-t-xl [&>li:last-child>a]:rounded-b-xl"
          primaryText={(contact) =>
            `${contact.first_name} ${contact.last_name}`
          }
          secondaryText={(contact) => (
            <>
              {contact.title && contact.company_name
                ? translate("resources.contacts.position_at_company", {
                    title: contact.title,
                    company: contact.company_name,
                  })
                : contact.title || contact.company_name}
            </>
          )}
          leftAvatar={(contact) => <Avatar record={contact} />}
          empty={
            <div className="p-4">
              <p className="text-sm mb-4">
                {translate("resources.contacts.hot.empty_hint")}
              </p>
              <p className="text-sm">
                {translate("resources.contacts.hot.empty_change_status")}
              </p>
            </div>
          }
        />
      </div>
    </div>
  );
};
