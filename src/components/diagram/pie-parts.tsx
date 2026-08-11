/*
 * SVG for the pie family. Slice colour is a `data-series` index, never a value — `diagram.css` maps
 * it onto `--diagram-series-N`, so a theme flip repaints without re-rendering.
 *
 * The legend carries no geometry (it is HTML, rendered by `Diagram.Legend`), so this file draws the
 * circle and the centroid labels the layout decided actually fit.
 */

import { memo } from 'react';

import type { LabelBox, Scene, SceneSlice } from '@/lib/diagram/types';

import type { PartProps } from './diagram-context';
import { renderPart, useDiagramConfig } from './diagram-context';
import { tspans } from './svg-text';

function SliceBase({ datum: _datum, ...props }: { datum: SceneSlice } & PartProps<'path'>) {
  return <path {...props} />;
}

export const PieView = memo(function PieView({ scene }: { scene: Scene }) {
  const { components, classNames } = useDiagramConfig();

  if (scene.kind !== 'pie') {
    return null;
  }

  const labelled = scene.slices.filter((slice) => slice.labelBox && slice.labelPoint);

  return (
    <>
      <g data-part="slices" className={classNames.slices}>
        {scene.slices.map((slice) =>
          renderPart(
            components.Slice,
            SliceBase,
            slice,
            {
              'data-part': 'slice',
              'data-id': slice.id,
              'data-series': slice.swatchIndex,
              d: slice.d,
              className: classNames.slice,
            },
            slice.id,
          ),
        )}
      </g>
      {labelled.length > 0 && (
        <g data-part="slice-labels">
          {labelled.map((slice) => (
            <text
              key={slice.id}
              data-part="slice-label"
              data-id={slice.id}
              data-series={slice.swatchIndex}
              textAnchor="middle"
              className={classNames.sliceLabel}
            >
              {tspans(
                slice.labelBox as LabelBox,
                slice.labelPoint?.x ?? 0,
                slice.labelPoint?.y ?? 0,
              )}
            </text>
          ))}
        </g>
      )}
    </>
  );
});
