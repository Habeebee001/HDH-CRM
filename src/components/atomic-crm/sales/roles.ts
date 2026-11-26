import type { SalesRole } from "../types";

export const ROLE_CHOICES: {
  id: SalesRole;
  name: string;
  description: string;
}[] = [
  {
    id: "admin",
    name: "Admin",
    description:
      "Everything: all workspaces, users, settings and account requests.",
  },
  {
    id: "manager",
    name: "Manager",
    description: "Sees and edits every client and deal of their workspaces.",
  },
  {
    id: "sales_rep",
    name: "Sales rep",
    description: "Sees and edits only the clients and deals they own.",
  },
];

export const roleOf = (sale?: {
  role?: SalesRole;
  administrator?: boolean;
}): SalesRole => sale?.role ?? (sale?.administrator ? "admin" : "manager");

export const roleLabel = (role: SalesRole) =>
  ROLE_CHOICES.find((choice) => choice.id === role)?.name ?? role;
