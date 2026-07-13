import type { Spec, StateStore } from '@json-render/core';
import { JSONUIProvider, Renderer, defineRegistry } from '@json-render/react';

import { catalog } from '@/catalog/catalog';
import { Badge } from '@/components/catalog/badge';
import { Callout } from '@/components/catalog/callout';
import { Card } from '@/components/catalog/card';
import { Chart } from '@/components/catalog/chart';
import { Checklist } from '@/components/catalog/checklist';
import { Choice } from '@/components/catalog/choice';
import { CodeBlock } from '@/components/catalog/code-block';
import { Columns } from '@/components/catalog/columns';
import { Day } from '@/components/catalog/day';
import { Details } from '@/components/catalog/details';
import { Divider } from '@/components/catalog/divider';
import { Figure } from '@/components/catalog/figure';
import { Grid } from '@/components/catalog/grid';
import { Heading } from '@/components/catalog/heading';
import { Itinerary } from '@/components/catalog/itinerary';
import { KeyValueList } from '@/components/catalog/key-value-list';
import { Map } from '@/components/catalog/map';
import { NoteBox } from '@/components/catalog/note-box';
import { Progress } from '@/components/catalog/progress';
import { Prose } from '@/components/catalog/prose';
import { Quote } from '@/components/catalog/quote';
import { Rating } from '@/components/catalog/rating';
import { Section } from '@/components/catalog/section';
import { Steps } from '@/components/catalog/steps';
import { Stop } from '@/components/catalog/stop';
import { Table } from '@/components/catalog/table';
import { Tabs } from '@/components/catalog/tabs';
import { Timeline } from '@/components/catalog/timeline';

export const { registry } = defineRegistry(catalog, {
  components: {
    Section,
    Grid,
    Columns,
    Tabs,
    Divider,
    Heading,
    Prose,
    Callout,
    Quote,
    CodeBlock,
    Card,
    Table,
    KeyValueList,
    Steps,
    Timeline,
    Checklist,
    Details,
    Badge,
    Figure,
    Progress,
    Chart,
    Map,
    Choice,
    NoteBox,
    Rating,
    Itinerary,
    Day,
    Stop,
  },
});

/**
 * Renders a spec against the catalog registry. `Renderer` alone throws
 * (`useVisibility must be used within a VisibilityProvider`) — it expects to be mounted under
 * `JSONUIProvider`, even for a catalog with no actions or state. This wraps that up for callers
 * (the dev fixtures preview, tests).
 *
 * `store` (optional) makes the provider controlled: stateful components (Checklist statePath)
 * read/write it, and the caller owns persistence.
 */
export function SpecView({ spec, store }: { spec: Spec | null; store?: StateStore }) {
  return (
    <JSONUIProvider registry={registry} store={store}>
      <Renderer registry={registry} spec={spec} />
    </JSONUIProvider>
  );
}
