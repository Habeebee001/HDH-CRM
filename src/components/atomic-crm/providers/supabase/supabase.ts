import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import { config } from "../../root/config";
import { fetchWithWorkspace } from "../../workspaces/currentWorkspace";

let supabaseClient: SupabaseClient | null = null;

export const getSupabaseClient = () => {
  if (!supabaseClient) {
    supabaseClient = createClient(
      config.supabaseUrl!,
      config.supabasePublishableKey!,
      // Every request says which workspace it is made in
      { global: { fetch: fetchWithWorkspace } },
    );
  }
  return supabaseClient;
};
