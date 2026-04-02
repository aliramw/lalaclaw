function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function deepMerge(base, override) {
  if (!isPlainObject(base)) {
    return override === undefined ? base : override;
  }

  if (!isPlainObject(override)) {
    return override === undefined ? { ...base } : override;
  }

  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const baseValue = result[key];
    result[key] = isPlainObject(baseValue) && isPlainObject(value)
      ? deepMerge(baseValue, value)
      : value;
  }
  return result;
}

export default function mergeLocale(base, override) {
  return deepMerge(base, override);
}
