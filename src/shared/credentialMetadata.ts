/** Remove credentials before persisting API metadata in renderer storage. */
export function withoutApiKey<T extends { apiKey?: string }>(config: T): Omit<T, "apiKey"> {
  const { apiKey: _apiKey, ...metadata } = config;
  return metadata;
}
