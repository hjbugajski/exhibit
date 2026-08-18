/*
 * The diagram playground: one source, two ways of looking at it. Edits re-parse live, so the
 * statement-level recovery is visible as you type — a broken line names itself in the issue list
 * while every other statement still draws.
 *
 * Canvas and static are the same `Diagram.Root`; the mode swaps exactly one child, which is the
 * claim this page exists to make.
 */

import { useDeferredValue, useState } from 'react';

import { Diagram } from '@/components/diagram/diagram';
import type { DiagramClassNames } from '@/components/diagram/diagram-context';
import type { LibraryDemo } from '@/components/library/demo';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';

const presets = [
  {
    id: 'flow',
    label: 'Flowchart',
    source: `flowchart TD
  Claude[Claude] -->|publish_spec| Endpoint

  subgraph server [Exhibit server]
    Endpoint[[MCP endpoint]] --> Token{Bearer token?}
    Token -- no --> Denied[401 unauthorized]:::danger
    Token -- yes --> Valid{Spec valid?}
    Valid -- no --> Errors[Validation errors]:::danger
    Valid -- yes --> Store[(SQLite)]

    subgraph publish [Publish path]
      Store --> Version[Version row]
      Version --> Card([Gallery card]):::success
    end
  end

  Card -->|artifact url| Claude`,
  },
  {
    id: 'state',
    label: 'State',
    source: `stateDiagram-v2
  [*] --> Draft
  Draft --> Review : submit
  note right of Draft : the author can still edit

  state Review {
    [*] --> Automated
    Automated --> Human : checks pass
    Human --> [*]
  }

  state Verdict <<choice>>
  Review --> Verdict
  Verdict --> Published : approved
  Verdict --> Draft : changes requested

  state Fanout <<fork>>
  Published --> Fanout
  Fanout --> Indexed
  Fanout --> Notified

  state Joined <<join>>
  Indexed --> Joined
  Notified --> Joined
  Joined --> [*]`,
  },
  {
    id: 'class',
    label: 'Class',
    source: `classDiagram
  class Artifact {
    <<interface>>
    +String slug
    +String title
    +publish() Version
  }
  class Version {
    +int number
    +String body
    +restore() Artifact
  }
  class Tag {
    +String name
  }
  Artifact "1" *-- "many" Version : keeps
  Artifact "many" o-- "many" Tag : filed under`,
  },
  {
    id: 'er',
    label: 'Entity relationship',
    source: `erDiagram
  ARTIFACT ||--o{ VERSION : keeps
  ARTIFACT }o--o{ TAG : "filed under"
  ARTIFACT {
    string slug PK
    string title
  }
  VERSION {
    int number PK
    string body
    string author "who published it"
  }`,
  },
  {
    id: 'gantt',
    label: 'Gantt',
    source: `gantt
  title Release
  dateFormat YYYY-MM-DD
  axisFormat %m-%d
  excludes weekends
  section Build
  Catalog work   :done, catalog, 2026-01-05, 12d
  Review         :active, review, after catalog, 5d
  section Ship
  Cut the tag    :crit, tag, after review, 2d
  Announced      :milestone, after tag, 0d`,
  },
  {
    id: 'pie',
    label: 'Pie',
    source: `pie showData title Artifacts by kind
  "Markdown" : 128
  "Spec" : 64
  "HTML" : 32
  "Other" : 6`,
  },
  {
    id: 'recovery',
    label: 'Broken source',
    source: `flowchart TD
  Ingest[Ingest] --> Validate[Validate]
  Validate -->
  Validate --> Store[(Store)]
  Store --> Serve([Serve])`,
  },
] as const;

const playgroundClassNames: DiagramClassNames = {
  issues: 'mt-1 text-xs',
  legend: 'mt-3',
};

function DiagramPlaygroundDemo() {
  const [presetId, setPresetId] = useState<string>(presets[0].id);
  const [source, setSource] = useState<string>(presets[0].source);
  const [mode, setMode] = useState<'canvas' | 'static'>('canvas');
  // Parsing is memoized on the source; deferring it keeps typing smooth on a large diagram.
  const deferred = useDeferredValue(source);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-3">
        {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role */}
        <div aria-label="Preset" className="flex flex-wrap gap-2" role="group">
          {presets.map((preset) => (
            <Button
              key={preset.id}
              aria-pressed={preset.id === presetId}
              variant={preset.id === presetId ? 'secondary' : 'ghost'}
              onClick={() => {
                setPresetId(preset.id);
                setSource(preset.source);
              }}
            >
              {preset.label}
            </Button>
          ))}
        </div>

        <Field.Root>
          <Field.Label>Source</Field.Label>
          <Textarea
            className="min-h-80 font-mono text-xs"
            spellCheck={false}
            value={source}
            onChange={(event) => setSource(event.target.value)}
          />
          <Field.Description>
            Edits render on every keystroke. Switching preset replaces what is in the box.
          </Field.Description>
        </Field.Root>
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role */}
        <div aria-label="View mode" className="flex gap-2" role="group">
          <Button
            aria-pressed={mode === 'canvas'}
            variant={mode === 'canvas' ? 'secondary' : 'ghost'}
            onClick={() => setMode('canvas')}
          >
            Canvas
          </Button>
          <Button
            aria-pressed={mode === 'static'}
            variant={mode === 'static' ? 'secondary' : 'ghost'}
            onClick={() => setMode('static')}
          >
            Static
          </Button>
        </div>

        <Diagram.Root classNames={playgroundClassNames} source={deferred}>
          <Diagram.Description />
          {mode === 'canvas' ? (
            <Diagram.Canvas className="h-[30rem]">
              <Diagram.Svg />
            </Diagram.Canvas>
          ) : (
            <div className="bg-surface overflow-x-auto rounded-xl border p-4">
              <Diagram.Svg />
            </div>
          )}
          <Diagram.Legend />
          <p className="text-foreground-subtle text-xs">
            Diagnostics are live: a statement that cannot be read costs only itself.
          </p>
          <Diagram.Issues />
        </Diagram.Root>
      </div>
    </div>
  );
}

export const diagramPlaygroundDemo: LibraryDemo = {
  slug: 'diagram-playground',
  title: 'Diagram playground',
  description:
    'Edit mermaid source and watch it render live, in either view mode: an interactive canvas with a dotted grid, zoom and pan, or the static drawing.',
  group: 'Examples',
  render: () => <DiagramPlaygroundDemo />,
};
