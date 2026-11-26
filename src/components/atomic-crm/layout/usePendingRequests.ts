import { useCanAccess, useGetList } from "ra-core";

import type { Sale } from "../types";

/** Number of account requests waiting for an administrator (0 for others) */
export const usePendingRequestCount = () => {
  const { canAccess } = useCanAccess({ resource: "sales", action: "list" });
  const { total } = useGetList<Sale>(
    "sales",
    {
      filter: { pending_approval: true },
      pagination: { page: 1, perPage: 1 },
      sort: { field: "id", order: "ASC" },
    },
    { enabled: !!canAccess, refetchInterval: 5 * 60_000 },
  );
  return canAccess ? (total ?? 0) : 0;
};
