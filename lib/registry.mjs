/** The live set of workspaces: built from the config, rebuilt on save with unchanged workspaces kept, events fanned in for the SSE stream. */

export const createRegistry = ({ load, save, build }) => {
  const listeners = new Set();
  const registry = { workspaces: [], rawWorkspaces: [], problems: [], configFile: '', subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); } };

  const apply = (config) => {
    const previous = new Map(registry.workspaces.map((workspace) => [workspace.id, workspace]));
    const signatures = new Map(registry.workspaces.map((workspace) => [workspace.id, workspace.signature]));
    const created = [];
    registry.workspaces = config.workspaces.map((definition) => {
      const signature = JSON.stringify(definition);
      if (signatures.get(definition.id) === signature) {
        return previous.get(definition.id);
      }
      const workspace = build(definition, config);
      workspace.signature = signature;
      workspace.subscribe((event) => listeners.forEach((listener) => listener(event)));
      created.push(workspace);
      return workspace;
    });
    registry.rawWorkspaces = config.rawWorkspaces;
    registry.problems = config.problems;
    registry.configFile = config.configFile;
    return created;
  };

  registry.reload = () => apply(load());
  registry.save = async (rawWorkspaces) => {
    await save(rawWorkspaces);
    return registry.reload();
  };
  registry.reload();
  return registry;
};
