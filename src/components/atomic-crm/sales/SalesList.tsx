import { useRecordContext, useTranslate } from "ra-core";
import { CreateButton } from "@/components/admin/create-button";
import { DataTable } from "@/components/admin/data-table";
import { ExportButton } from "@/components/admin/export-button";
import { List } from "@/components/admin/list";
import { SearchInput } from "@/components/admin/search-input";
import { Badge } from "@/components/ui/badge";

import { TopToolbar } from "../layout/TopToolbar";
import type { Sale } from "../types";
import { AccessRequestsPanel } from "./AccessRequestsPanel";
import { roleLabel, roleOf } from "./roles";
import { PendingInvitePanel } from "./ShareLinkDialog";

const SalesListActions = () => (
  <TopToolbar>
    <ExportButton />
    <CreateButton label="resources.sales.action.new" />
  </TopToolbar>
);

const filters = [<SearchInput source="q" alwaysOn />];

const ROLE_BADGE: Record<string, string> = {
  admin: "border-brand/60 bg-brand-soft/50 text-foreground",
  manager: "border-sky-300/80 dark:border-sky-700",
  sales_rep: "border-border",
};

const OptionsField = (_props: { label?: string | boolean }) => {
  const record = useRecordContext<Sale>();
  const translate = useTranslate();
  if (!record) return null;
  const role = roleOf(record);
  return (
    <div className="flex flex-row gap-1">
      <Badge variant="outline" className={ROLE_BADGE[role]}>
        {roleLabel(role)}
      </Badge>
      {record.disabled && (
        <Badge
          variant="outline"
          className="border-orange-300 dark:border-orange-700"
        >
          {translate("resources.sales.fields.disabled")}
        </Badge>
      )}
    </div>
  );
};

export function SalesList() {
  return (
    <List
      filters={filters}
      actions={<SalesListActions />}
      sort={{ field: "first_name", order: "ASC" }}
      filter={{ "pending_approval@neq": true }}
    >
      <AccessRequestsPanel />
      <PendingInvitePanel />
      <DataTable bulkActionButtons={false}>
        <DataTable.Col source="first_name" />
        <DataTable.Col source="last_name" />
        <DataTable.Col source="email" />
        <DataTable.Col label={false}>
          <OptionsField />
        </DataTable.Col>
      </DataTable>
    </List>
  );
}
