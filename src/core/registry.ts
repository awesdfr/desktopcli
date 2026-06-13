import type { AdapterDefinition, CommandDefinition } from "./types.js";

export class Registry {
  private readonly adapters = new Map<string, AdapterDefinition>();
  private readonly rootCommands = new Map<string, CommandDefinition>();

  addAdapter(adapter: AdapterDefinition): void {
    this.adapters.set(adapter.name, adapter);
  }

  addRootCommand(command: CommandDefinition): void {
    this.rootCommands.set(command.name, command);
  }

  listAdapters(): AdapterDefinition[] {
    return [...this.adapters.values()].sort((left, right) => left.name.localeCompare(right.name));
  }

  listRootCommands(): CommandDefinition[] {
    return [...this.rootCommands.values()].sort((left, right) => left.name.localeCompare(right.name));
  }

  getAdapter(name: string): AdapterDefinition | undefined {
    return this.adapters.get(name);
  }

  getRootCommand(name: string): CommandDefinition | undefined {
    return this.rootCommands.get(name);
  }

  getCommand(adapterName: string, commandName: string): CommandDefinition | undefined {
    return this.adapters.get(adapterName)?.commands.find((command) => command.name === commandName);
  }
}
