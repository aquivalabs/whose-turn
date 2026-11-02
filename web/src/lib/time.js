export const ago = (iso) => {
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (!isFinite(m)) return '';
  if (m < 1) return 'now';
  if (m < 60) return m + 'm ago';
  if (m < 48 * 60) return Math.round(m / 60) + 'h ago';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export const age = (iso) => {
  const h = (Date.now() - new Date(iso)) / 3600000;
  if (!isFinite(h) || h < 0) return { text: '', old: false, hours: 0 };
  return { text: h < 1 ? '<1h' : h < 48 ? Math.floor(h) + 'h' : Math.floor(h / 24) + 'd', old: h >= 24, hours: h };
};

export const when = (iso) => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
