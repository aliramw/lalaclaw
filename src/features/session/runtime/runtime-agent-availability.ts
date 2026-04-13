type RuntimeAgentRecord = Record<string, unknown> | null | undefined;

function normalizeAgentId(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readAgentField(agent: RuntimeAgentRecord, field: string) {
  if (!agent || typeof agent !== "object") {
    return "";
  }

  return normalizeAgentId(agent[field]);
}

function isExplicitlyInstalledAgent(agent: RuntimeAgentRecord) {
  if (!agent || typeof agent !== "object") {
    return false;
  }

  return agent.installed === true
    || agent.available === true
    || agent.enabled === true;
}

function readAgentId(agent: RuntimeAgentRecord) {
  return readAgentField(agent, "agentId")
    || readAgentField(agent, "id")
    || readAgentField(agent, "name");
}

export function collectAvailableRuntimeAgentIds({
  availableAgents = [],
  agents = [],
}: {
  availableAgents?: unknown[];
  agents?: RuntimeAgentRecord[];
}) {
  const ordered = new Set<string>();

  if (Array.isArray(availableAgents)) {
    for (const value of availableAgents) {
      const agentId = normalizeAgentId(value);
      if (agentId) {
        ordered.add(agentId);
      }
    }
  }

  if (Array.isArray(agents)) {
    for (const agent of agents) {
      if (!isExplicitlyInstalledAgent(agent)) {
        continue;
      }

      const agentId = readAgentId(agent);
      if (agentId) {
        ordered.add(agentId);
      }
    }
  }

  return [...ordered];
}
