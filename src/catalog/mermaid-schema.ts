/**
 * The two constants the catalog's Mermaid block is defined by, in a module free of React and of
 * anything server-only: the schema cap and the family list Claude is told about. `src/catalog` and
 * `src/lib/mcp` both read them, so the tool copy and the validator can never disagree.
 */

import { builtinFamilies } from '@/lib/diagram/family';

/** Mirrors the schema cap on the block's `code` prop. */
export const MERMAID_MAX_CHARS = 10_000;

/** Display names for family ids that do not read as prose; every other id prints as-is. */
const FAMILY_LABELS: Readonly<Record<string, string>> = { er: 'ER' };

const labels = builtinFamilies.map((family) => FAMILY_LABELS[family.id] ?? family.id);

/**
 * The families the house engine draws, derived from `builtinFamilies` in registration order and
 * joined as prose ("a, b and c"). Every other header keeps its source on screen with the reason, so
 * this list is a promise about drawings, not about what parses.
 */
export const ALLOWED_FAMILIES = `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`;
