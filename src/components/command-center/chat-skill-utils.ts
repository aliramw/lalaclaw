// Skill mention utilities

export function normalizeSkillMention(skill) {
  if (typeof skill === "string") {
    const name = skill.trim();
    return name ? { name, ownerAgentId: "" } : null;
  }

  const name = String(skill?.name || "").trim();
  if (!name) {
    return null;
  }

  return {
    name,
    ownerAgentId: String(skill?.ownerAgentId || "").trim(),
  };
}
