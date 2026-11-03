// "Ago", age and date texts for rows and the feed, in the window's one locale.
export const ago = (iso: string) => {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (!isFinite(minutes)) {
    return '';
  }
  if (minutes < 1) {
    return 'now';
  }
  if (minutes < 60) {
    return minutes + 'm ago';
  }
  if (minutes < 48 * 60) {
    return Math.round(minutes / 60) + 'h ago';
  }
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export interface Age {
  text: string;
  old: boolean;
  hours: number;
}

export const age = (iso: string | undefined): Age => {
  const hours = (Date.now() - new Date(iso ?? '').getTime()) / 3600000;
  if (!isFinite(hours) || hours < 0) {
    return { text: '', old: false, hours: 0 };
  }
  return {
    text: hours < 1 ? '<1h' : hours < 48 ? Math.floor(hours) + 'h' : Math.floor(hours / 24) + 'd',
    old: hours >= 24,
    hours,
  };
};

export const when = (iso: string | undefined) =>
  iso
    ? new Date(iso).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';
