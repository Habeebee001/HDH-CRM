/**
 * Invitation link of the user just created, shown on the Users list when the
 * server has no email set up. Kept in memory only: the link must not be
 * persisted in the browser.
 */
export type PendingInvite = { link: string; name: string };

let pendingInvite: PendingInvite | null = null;
const listeners = new Set<() => void>();

export const getPendingInvite = () => pendingInvite;

export const setPendingInvite = (invite: PendingInvite | null) => {
  pendingInvite = invite;
  listeners.forEach((listener) => listener());
};

export const subscribeToPendingInvite = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
