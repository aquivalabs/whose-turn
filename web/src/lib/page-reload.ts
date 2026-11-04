/** The version a reload after a self-update announces, kept for one page load. */
export const UPDATED_KEY = 'wt-updated-to';

/** Reloads the window so it runs the code the updated server now serves. */
export const reloadPage = (): void => window.location.reload();

/** Remembers the version to announce after the reload; a blocked storage only loses the announcement. */
export const rememberUpdated = (version: string): void => {
  try {
    sessionStorage.setItem(UPDATED_KEY, version);
  } catch {
    // docs/adr/0002-vueuse-in-the-window.md
  }
};

/** The version a previous page asked to announce, read once. */
export const takeUpdated = (): string => {
  try {
    const version = sessionStorage.getItem(UPDATED_KEY) || '';
    sessionStorage.removeItem(UPDATED_KEY);
    return version;
  } catch {
    return '';
  }
};
