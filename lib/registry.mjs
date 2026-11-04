/** The live set of workspaces: built from the config, rebuilt on save with unchanged workspaces kept, events fanned in for the SSE stream. */
import { ApiError } from './errors.mjs';

export const createRegistry = ({ load, save, saveNotifications, saveSettings = /** @type {(settings: object) => unknown} */ (() => {}), build, normalise = (raw) => raw }) => {
  const listeners = new Set();
  const registry = { workspaces: [], rawWorkspaces: [], problems: [], configFile: '', feedback: null, notifications: { desktop: true }, settings: {}, subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); } };

  const apply = (config, prebuilt = new Map()) => {
    const previous = new Map(registry.workspaces.map((workspace) => [workspace.id, workspace]));
    const signatures = new Map(registry.workspaces.map((workspace) => [workspace.id, workspace.signature]));
    const created = [];
    const dropped = [];
    registry.workspaces = config.workspaces.map((definition) => {
      const signature = JSON.stringify(definition);
      if (signatures.get(definition.id) === signature) {
        return previous.get(definition.id);
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
        const signature = JSON.stringify(definition);
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
