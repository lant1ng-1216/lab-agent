export interface ModelIdentity {
  id: string;
}

const DEEPSEEK_MODEL_ALIASES: Record<string, string> = {
  "deepseek-v4-flash": "deepseek-flash",
  "deepseek-v4.1-flash": "deepseek-flash",
  "deepseek-v4-flash-vision-exp": "deepseek-flash",
  "deepseek-pro": "deepseek-v4-pro",
};

/** Normalize known DeepSeek aliases to their current API model IDs. */
export function canonicalModelId(provider: string | undefined, id: string): string {
  const trimmed = id.trim();
  return provider?.toLowerCase() === "deepseek"
    ? DEEPSEEK_MODEL_ALIASES[trimmed.toLowerCase()] || trimmed
    : trimmed;
}

/** Remove exact duplicate IDs while preserving distinct provider model IDs. */
export function dedupeModelsById<T extends ModelIdentity>(models: readonly T[]): T[] {
  const seen = new Set<string>();
  return models.filter((model) => {
    const id = model.id.trim();
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export interface SearchableModel {
  id?: string;
  key?: string;
  name?: string;
  tag?: string;
}

export function modelMatchesQuery(model: SearchableModel, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  return [model.id, model.key, model.name, model.tag]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLocaleLowerCase().includes(needle));
}
