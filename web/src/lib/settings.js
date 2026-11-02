// The settings form's shaping: what the server's raw workspace becomes in the form, and what goes back.
export const normaliseForForm = (w) => {
  const copy = structuredClone(w);
  copy.connectors = Array.isArray(copy.connectors) ? copy.connectors : Object.keys(copy.connectors || {}).map((type) => Object.assign({ type }, copy.connectors[type]));
  copy.rules = copy.rules || {}; copy.rules.statuses = copy.rules.statuses || {}; copy.theme = copy.theme || {};
  return copy;
};

export const forSaving = (w) => {
  const copy = structuredClone(w);
  if (!Object.keys(copy.theme).length) delete copy.theme;
  if (!Object.keys(copy.rules.statuses).length) delete copy.rules.statuses;
  if (!Object.keys(copy.rules).length) delete copy.rules;
  return copy;
};

/** The secrets typed into the form, each addressed to its workspace and connector entry. */
export const pendingSecrets = (list, typed) => {
  const out = [];
  list.forEach((w) => w.connectors.forEach((entry) => {
    const values = typed.get(entry) || {};
    Object.keys(values).forEach((key) => { if (values[key]) out.push({ ws: w.id, connector: entry.id || entry.type, key, value: values[key] }); });
  }));
  return out;
};

/** Set a field, or drop it when emptied, so the saved config stays minimal. */
export const setOrDrop = (target, key, value) => { if (value && value.length) target[key] = value; else delete target[key]; };
