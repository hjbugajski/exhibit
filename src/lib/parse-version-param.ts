/**
 * Parses an artifact version route param (`n` in `/render/$id/$n`, `/download/$id/$n`,
 * `/a/$id/v/$n`). `Number.isInteger` alone accepts values like `1e21` - technically integral as a
 * float, but well outside the safe integer range - which then blow up downstream repository lookups
 * that bind the value as a SQLite parameter. `Number.isSafeInteger` rejects those.
 */
export function parseVersionParam(raw: string): number | undefined {
  const version = Number(raw);

  return Number.isSafeInteger(version) && version >= 1 ? version : undefined;
}
