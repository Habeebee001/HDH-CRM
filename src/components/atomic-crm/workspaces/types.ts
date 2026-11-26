/** A workspace as listed by the workspaces_summary view */
export type Workspace = {
  id: number;
  name: string;
  created_at: string;
  nb_contacts: number;
  nb_companies: number;
  nb_deals: number;
  /** Team members given access (administrators open every workspace) */
  member_ids: number[];
};
