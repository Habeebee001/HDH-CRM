import { email, required, useGetIdentity, useRecordContext } from "ra-core";
import { useWatch } from "react-hook-form";
import { BooleanInput } from "@/components/admin/boolean-input";
import { SelectInput } from "@/components/admin/select-input";
import { TextInput } from "@/components/admin/text-input";

import type { Sale, SalesRole } from "../types";
import { ROLE_CHOICES } from "./roles";

export function SalesInputs() {
  const { identity } = useGetIdentity();
  const record = useRecordContext<Sale>();
  const role = useWatch({ name: "role" }) as SalesRole | undefined;
  const isSelf = record?.id != null && record?.id === identity?.id;
  return (
    <div className="space-y-4 w-full">
      <TextInput source="first_name" validate={required()} helperText={false} />
      <TextInput source="last_name" validate={required()} helperText={false} />
      <TextInput
        source="email"
        validate={[required(), email()]}
        helperText={false}
      />
      <SelectInput
        source="role"
        label="resources.sales.fields.role"
        choices={ROLE_CHOICES}
        validate={required()}
        readOnly={isSelf}
        helperText={
          isSelf
            ? "You can't change your own role."
            : (ROLE_CHOICES.find((choice) => choice.id === role)?.description ??
              false)
        }
      />
      <BooleanInput
        source="disabled"
        readOnly={isSelf}
        helperText={false}
      />
    </div>
  );
}
