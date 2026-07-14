/*
 * Prose-flow rhythm: rendered specs lay out in normal flow (no space-y/gap
 * containers), so every block-level catalog component carries its own
 * y-margins and adjacent margins collapse like prose. `first:mt-0 last:mb-0`
 * makes a block sit flush when it opens or closes any flow context (the spec
 * root, a Section body, Card content, a Tabs panel, a Grid/Columns cell).
 * One-off tiers (Heading, Divider, Day, Stop) stay inline in their components.
 */

/** Default rhythm for leaf blocks (Prose, Table, Callout, …). */
export const flowBlock = 'my-5 first:mt-0 last:mb-0';

/** Slightly wider rhythm for grouping containers (Grid, Columns, Card, Tabs). */
export const flowGroup = 'my-6 first:mt-0 last:mb-0';

/** Widest rhythm for document-level chapters (Section, Itinerary). */
export const flowSection = 'my-12 first:mt-0 last:mb-0';

/**
 * Cell wrapper for multi-column containers (Grid, Columns): each child becomes
 * :first-child/:last-child of its cell so its flow margins self-neutralize instead of stacking
 * onto the grid gap. flex + grow keeps cards in a row stretching to equal height, as bare grid
 * items did.
 */
export const flowCell = 'flex min-w-0 flex-col *:grow';
