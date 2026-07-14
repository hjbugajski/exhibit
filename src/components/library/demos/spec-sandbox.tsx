import { useMemo } from 'react';

import type { Spec } from '@json-render/core';
import { createStateStore } from '@json-render/react';

import { SpecView } from '@/catalog/registry';
import type { ArtifactSpecError } from '@/catalog/validate';
import { validateArtifactSpec } from '@/catalog/validate';
import type { LibraryDemo } from '@/components/library/demo';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { useLocalStorageState } from '@/lib/use-local-storage-state';

const STORAGE_KEY = 'exhibit-dev-spec-sandbox';

type SandboxResult =
  | { kind: 'empty' }
  | { kind: 'parse-error'; message: string }
  | { kind: 'invalid'; errors: ArtifactSpecError[] }
  | { kind: 'valid'; spec: Spec };

function evaluate(text: string): SandboxResult {
  if (!text.trim()) {
    return { kind: 'empty' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return {
      kind: 'parse-error',
      message: error instanceof Error ? error.message : 'Invalid JSON.',
    };
  }

  const result = validateArtifactSpec(parsed);

  return result.valid
    ? { kind: 'valid', spec: result.spec }
    : { kind: 'invalid', errors: result.errors };
}

function SpecSandbox() {
  // Persisted so the pasted spec survives reloads while iterating on it.
  const [text, setText] = useLocalStorageState(STORAGE_KEY, '', (_): _ is string => true);

  const result = useMemo(() => evaluate(text), [text]);
  const validSpec = result.kind === 'valid' ? result.spec : null;
  // Fresh store per pasted spec so interactive components (Checklist, Rating, …) work without
  // leaking state between specs; nothing is persisted.
  const store = useMemo(() => (validSpec ? createStateStore({}) : null), [validSpec]);

  return (
    <div className="flex flex-col gap-6">
      <Field.Root name="spec">
        <Field.Label>Spec JSON</Field.Label>
        <Textarea
          className="max-h-64 min-h-40 font-mono text-xs"
          onChange={(event) => setText(event.target.value)}
          placeholder='{"root":"root","elements":{…}}'
          spellCheck={false}
          value={text}
        />
        <Field.Description>
          Paste the body of a spec artifact (e.g. from an artifact’s Source tab) to render it
          against the local catalog.
        </Field.Description>
      </Field.Root>

      {result.kind === 'empty' ? null : result.kind === 'parse-error' ? (
        <p className="text-danger text-sm">Could not parse JSON: {result.message}</p>
      ) : result.kind === 'invalid' ? (
        <div className="text-sm">
          <p className="text-danger font-medium">
            {result.errors.length === 1
              ? '1 validation error'
              : `${result.errors.length} validation errors`}
          </p>
          <ul className="text-foreground-muted mt-2 flex flex-col gap-1">
            {result.errors.map((error, index) => (
              <li key={index}>
                <code className="text-foreground text-xs">
                  {error.element ?? error.path ?? 'spec'}
                </code>{' '}
                {error.component ? `(${error.component}) ` : ''}
                {error.message}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="rounded-lg border p-8">
          <SpecView spec={validSpec} store={store ?? undefined} />
        </div>
      )}
    </div>
  );
}

export const specSandboxDemo: LibraryDemo = {
  slug: 'spec-sandbox',
  title: 'Spec sandbox',
  description:
    'Paste any spec JSON — a production artifact, a draft — and render it against the local catalog with live validation errors.',
  group: 'Examples',
  render: () => <SpecSandbox />,
};
