export type Layer = 'modal' | 'settings' | 'feedback' | 'whatsNew';

/** Which open layer sits on top and takes Escape: the comment modal, then Settings, then Report, then What's new. */
export const topLayer = (open: {
  modal: unknown;
  settings: boolean;
  feedback: boolean;
  whatsNew?: boolean;
}): Layer | null => {
  if (open.modal) return 'modal';
  if (open.settings) return 'settings';
  if (open.feedback) return 'feedback';
  if (open.whatsNew) return 'whatsNew';
  return null;
};
