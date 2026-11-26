/**
 * Splits a title like "HDH CRM" into a wordmark ("HDH") and a suffix ("CRM")
 * so the suffix can be rendered as a small gold label next to the wordmark.
 */
export const splitBrandTitle = (title: string) =>
  title.endsWith(" CRM")
    ? { brand: title.slice(0, -4), suffix: "CRM" }
    : { brand: title, suffix: undefined };
