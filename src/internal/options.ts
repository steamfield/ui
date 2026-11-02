/**
 * The first problem with an options argument: the field name when it isn't an object (`fallback`)
 * or has a key outside `known`, else undefined. Callers throw `invalid_option` with it, so a typo
 * never passes silently.
 */
export function unknownOption(
  options: unknown,
  known: readonly string[],
  fallback = "options",
): string | undefined {
  if (options === undefined) return undefined;
  if (typeof options !== "object" || options === null || Array.isArray(options)) return fallback;
  return Object.keys(options).find((key) => !known.includes(key));
}

/** Drops undefined values, which `exactOptionalPropertyTypes` won't pass as "absent". */
export function defined<O extends object>(
  values: O,
): { [K in keyof O]?: Exclude<O[K], undefined> } {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)) as {
    [K in keyof O]?: Exclude<O[K], undefined>;
  };
}
