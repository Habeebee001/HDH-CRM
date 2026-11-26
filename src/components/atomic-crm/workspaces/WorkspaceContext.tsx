/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { useGetList } from "ra-core";

import { getStoredWorkspaceId, storeWorkspaceId } from "./currentWorkspace";
import type { Workspace } from "./types";

type WorkspaceContextValue = {
  /** False when the backend has no workspaces (e.g. the demo) */
  supported: boolean;
  isPending: boolean;
  /** The workspaces this user may open, oldest first */
  workspaces: Workspace[];
  /** The workspace the app is showing */
  current: Workspace | undefined;
  /** Opens another workspace (reloads the app on its dashboard) */
  switchWorkspace(id: number): void;
  refetch(): void;
};

const WorkspaceContext = createContext<WorkspaceContextValue>({
  supported: false,
  isPending: false,
  workspaces: [],
  current: undefined,
  switchWorkspace: () => undefined,
  refetch: () => undefined,
});

export const useWorkspaces = () => useContext(WorkspaceContext);

/** Opens a workspace: reloads the app so that no data of the previous one stays. */
export const openWorkspace = (id: number) => {
  storeWorkspaceId(id);
  window.location.hash = "#/";
  window.location.reload();
};

export const WorkspaceProvider = ({ children }: { children: ReactNode }) => {
  const { data, isPending, error, refetch } = useGetList<Workspace>(
    "workspaces_summary",
    {
      pagination: { page: 1, perPage: 500 },
      sort: { field: "id", order: "ASC" },
    },
    { retry: false, staleTime: 30_000 },
  );

  const workspaces = useMemo(() => data ?? [], [data]);
  const stored = getStoredWorkspaceId();
  // Without a stored choice the server uses the first workspace (by id)
  const current = workspaces.find(({ id }) => id === stored) ?? workspaces[0];

  useEffect(() => {
    if (isPending || error || !current || current.id === stored) return;
    storeWorkspaceId(current.id);
    // The stored workspace cannot be opened any more (deleted, or access
    // removed): what is on screen came from no workspace, so start over.
    if (stored !== null) window.location.reload();
  }, [current, error, isPending, stored]);

  const switchWorkspace = useCallback((id: number) => openWorkspace(id), []);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      supported: !error && !isPending,
      isPending,
      workspaces,
      current,
      switchWorkspace,
      refetch: () => void refetch(),
    }),
    [current, error, isPending, refetch, switchWorkspace, workspaces],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
};
