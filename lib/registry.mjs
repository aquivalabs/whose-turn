/** The live set of workspaces: built from the config, rebuilt on save with unchanged workspaces kept, events fanned in for the SSE stream. */
import { ApiError } from './errors.mjs';

/** A workspace's identity for rebuilding: everything but how it is hidden, which a running workspace reads from the registry (`hiddenOf`) without a rebuild. */
const signatureOf = (definition) => JSON.stringify({ ...definition, hidden: undefined });

/** One raw workspace entry with its hide mode set, or without the key when shown. */
export const withHidden = ({ hidden: _was, ...entry }, hidden) => (hidden ? { ...entry, hidden } : entry);

/**
 * The `<workspace id>/<entry id>` that shows a review request or mention in `repo`, or '' when none does.
 * Among shown sources whose org holds the repository: the one watching it, else the first. RMA-378.
 */
export const askOwner = (workspaces, hiddenOf, repo) => {
  const wanted = String(repo).toLowerCase();
  const sources = workspaces.filter((workspace) => !hiddenOf(workspace.id)).flatMap((workspace) => workspace.connectors
    .filter((entry) => entry.type === 'github' && entry.repo)
    .map((entry) => ({ owner: `${workspace.id}/${entry.id}`, repo: entry.repo.toLowerCase(), org: (entry.org || entry.repo.split('/')[0]).toLowerCase() })));
  const inOrg = sources.filter((source) => wanted.startsWith(`${source.org}/`));
  const found = inOrg.find((source) => source.repo === wanted) || inOrg[0];
  return found ? found.owner : '';
};

export const createRegistry = ({ load, save, saveNotifications, saveSettings = /** @type {(settings: object) => unknown} */ (() => {}), build, normalise = (raw) => raw }) => {
  const listeners = new Set();
  let hiddenModes = new Map();
  const registry = { workspaces: [], hiddenOf: (id) => hiddenModes.get(id) || '', rawWorkspaces: [], problems: [], configFile: '', feedback: null, notifications: { desktop: true }, settings: {}, subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); } };

  const apply = (config, prebuilt = new Map()) => {
    const previous = new Map(registry.workspaces.map((workspace) => [workspace.id, workspace]));
    const signatures = new Map(registry.workspaces.map((workspace) => [workspace.id, workspace.signature]));
    const created = [];
    const dropped = [];
    registry.workspaces = config.workspaces.map((definition) => {
      const signature = signatureOf(definition);
      if (signatures.get(definition.id) === signature) {
        const kept = previous.get(definition.id);
        if (registry.hiddenOf(definition.id) && !definition.hidden) {
          created.push(kept);
        }
        return kept;
      }
      let workspace;
      try {
        workspace = prebuilt.get(signature) || build(definition, config);
      } catch (error) {
        dropped.push(`Workspace "${definition.id}" was dropped: ${error.message}`);
        return null;
      }
      workspace.signature = signature;
      workspace.subscribe((event) => listeners.forEach((listener) => listener(event)));
      created.push(workspace);
      return workspace;
    }).filter(Boolean);
    hiddenModes = new Map(config.workspaces.map((definition) => [definition.id, definition.hidden || '']));
    registry.rawWorkspaces = config.rawWorkspaces;
    registry.feedback = config.feedback;
    registry.notifications = config.notifications;
    registry.settings = config.settings || {};
    registry.problems = [...config.problems, ...dropped];
    registry.configFile = config.configFile;
    return created;
  };

  registry.reload = () => apply(load());
  const tryBuild = (rawWorkspaces) => {
    const config = load();
    const known = new Set(registry.workspaces.map((workspace) => workspace.signature));
    const prebuilt = new Map();
    try {
      for (const definition of normalise(rawWorkspaces)) {
        const signature = signatureOf(definition);
        if (!known.has(signature)) {
          prebuilt.set(signature, build(definition, config));
        }
      }
      return prebuilt;
    } catch (error) {
      throw new ApiError('INVALID_CONFIG', { count: '1' }, [error.message]);
    }
  };
  registry.save = async (rawWorkspaces) => {
    const prebuilt = tryBuild(rawWorkspaces);
    await save(rawWorkspaces);
    return apply(load(), prebuilt);
  };
  /** Parks, pauses or shows one workspace by rewriting its entry in the config; everything else about it stays. */
  registry.setHidden = async (id, hidden) => {
    await save(registry.rawWorkspaces.map((entry) => (entry.id === id ? withHidden(entry, hidden) : entry)));
    return registry.reload();
  };
  registry.saveSettings = async (settings) => {
    await saveSettings(settings);
    registry.reload();
  };
  registry.saveNotifications = async (notifications) => {
    await saveNotifications(notifications);
    registry.reload();
  };
  registry.reload();
  return registry;
};
