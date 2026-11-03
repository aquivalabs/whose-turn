export type Layer = 'modal' | 'settings' | 'feedback';

/** Which open layer sits on top and takes Escape: the comment modal, then Settings, then Report. */
export const topLayer = (open: {
  modal: unknown;
  settings: boolean;
  feedback: boolean;
}): Layer | null => {
  if (open.modal) return 'modal';
  if (open.settings) return 'settings';
  if (open.feedback) return 'feedback';
  return null;
};
