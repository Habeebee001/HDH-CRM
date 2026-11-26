/**
 * The workspace the app is showing, kept in this browser.
 *
 * Every request to the server carries it in the X-Workspace-Id header: the
 * database's row level security policies then only return (and only accept)
 * that workspace's contacts, companies, deals, notes, tasks and tags. Without
 * the header, the server uses the first workspace the user may open.
 */
export const WORKSPACE_HEADER = "X-Workspace-Id";

const STORAGE_KEY = "hdh-crm.workspace";

export const getStoredWorkspaceId = (): number | null => {
  try {
    const value = Number(window.localStorage.getItem(STORAGE_KEY));
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
};

export const storeWorkspaceId = (id: number | null) => {
  try {
    if (id === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, String(id));
  } catch {
    // Private browsing without storage: the server falls back to the first
    // workspace the user may open.
  }
};

/** fetch() for the Supabase client: adds the current workspace to requests. */
export const fetchWithWorkspace: typeof fetch = (input, init) => {
  const workspaceId = getStoredWorkspaceId();
  if (workspaceId === null) return fetch(input, init);
  const headers = new Headers(
    init?.headers ?? (input instanceof Request ? input.headers : undefined),
  );
  headers.set(WORKSPACE_HEADER, String(workspaceId));
  return fetch(input, { ...init, headers });
};

/**
 * Wraps the httpClient of ra-supabase-core's data provider (it does not use
 * the Supabase client's fetch): its requests carry the workspace too.
 */
export const withWorkspaceHeader =
  <Options extends { headers?: HeadersInit }, Result>(
    httpClient: (url: string, options?: Options) => Promise<Result>,
  ) =>
  (url: string, options: Options = {} as Options) => {
    const workspaceId = getStoredWorkspaceId();
    if (workspaceId !== null) {
      const headers = new Headers(options.headers);
      headers.set(WORKSPACE_HEADER, String(workspaceId));
      options = { ...options, headers };
    }
    return httpClient(url, options);
  };
