import type { CatalogComponentProps } from '@/catalog/catalog';
import { HouseDiagram } from '@/components/diagram/house-diagram';

/**
 * One block, one engine. The house engine draws every family it knows — flowchart, sequence, state,
 * class, ER, pie, gantt — from mermaid source, eagerly and in the page: detection is a read of the
 * header line, the layout is deterministic, and the result is house-themed SVG rather than a
 * sandboxed frame, so there is no chunk to wait for and nothing to gate on the viewport.
 *
 * Anything else degrades the way an invalid exhibit fence does — the source stays on screen with one
 * line naming the family that is not drawn yet — which is `HouseDiagram`'s own behaviour with no
 * `fallback` passed. It also brings the flow rhythm wrapper and picks its own fit, so this block
 * adds neither.
 */
export function Mermaid({ props }: { props: CatalogComponentProps<'Mermaid'> }) {
  return <HouseDiagram source={props.code} />;
}
