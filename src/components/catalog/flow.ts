/*
 * Prose-flow rhythm: rendered specs lay out in normal flow (no space-y/gap
 * containers), so every block-level catalog component carries its own
 * y-margins and adjacent margins collapse like prose. `first:mt-0 last:mb-0`
 * makes a block sit flush when it opens or closes any flow context (the spec
 * root, a Section body, Card content, a Tabs panel, a Grid/Columns cell).
 *
 * Big spacing is reserved for document structure; everything inside a section
 * shares one uniform base rhythm. Headings are asymmetric: big top margin to
 * open a run, small bottom to hug the content they title. Four tiers:
 *   4  (16px) — tight offsets: flowTight (Day body, Stop rhythm), heading mb,
 *               tab panel
 *   6  (24px) — base rhythm between sibling blocks: flowBlock, column gaps
 *   8  (32px) — standouts: flowStandout (Divider, Day), h3 mt,
 *               Section/Itinerary header-to-body
 *   12 (48px) — chapters: flowSection, h1/h2 mt
 */

/** Tightest rhythm — nested runs that read as one unit (Day body, Stop). */
export const flowTight = 'my-4 first:mt-0 last:mb-0';

/** Rhythm between sibling blocks — leaves and grouping containers alike. */
export const flowBlock = 'my-6 first:mt-0 last:mb-0';

/** Rhythm for blocks that stand out from the base run (Divider, Day). */
export const flowStandout = 'my-8 first:mt-0 last:mb-0';

/** Widest rhythm for document-level chapters (Section, Itinerary). */
export const flowSection = 'my-12 first:mt-0 last:mb-0';

/**
 * Cell wrapper for multi-column containers (Grid, Columns): each child becomes
 * :first-child/:last-child of its cell so its flow margins self-neutralize instead of stacking
 * onto the grid gap. flex + grow keeps cards in a row stretching to equal height, as bare grid
 * items did.
 */
export const flowCell = 'flex min-w-0 flex-col *:grow';
