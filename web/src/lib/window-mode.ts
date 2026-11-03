/** Whether this window is the standalone app window or a browser tab; open.sh puts ?mode=app on the app window's URL. */
export type WindowMode = 'app' | 'tab';

export const resolveMode = (search: string, stored: string): WindowMode => {
  const asked = new URLSearchParams(search).get('mode');
  if (asked === 'app' || asked === 'tab') {
    return asked;
  }
  return stored === 'app' ? 'app' : 'tab';
};

/** The address that opens this workspace in a normal browser tab. */
export const tabUrl = (workspaceId: string) =>
  '/?mode=tab' + (workspaceId ? '&ws=' + encodeURIComponent(workspaceId) : '');

/** The outer size the server remembers for the next app window. */
export const sizeBody = (win: Pick<Window, 'outerWidth' | 'outerHeight'>) => ({
  width: win.outerWidth,
  height: win.outerHeight,
});
