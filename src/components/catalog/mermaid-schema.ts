/**
 * The two constants the catalog's Mermaid block is defined by, in a module free of React and of
 * anything server-only: the schema cap and the family list Claude is told about. `src/catalog` and
 * `src/lib/mcp` both read them, so the tool copy and the validator can never disagree.
 */

/** Mirrors the schema cap on the block's `code` prop. */
export const MERMAID_MAX_CHARS = 10_000;

/**
 * The families the house engine draws, in the order `builtinFamilies` registers them. Every other
 * header keeps its source on screen with the reason, so this list is a promise about drawings, not
 * about what parses.
 */
export const ALLOWED_FAMILIES = 'flowchart, sequence, state, class, ER, pie and gantt';
