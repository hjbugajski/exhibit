/**
 * Markdown artifact exercising every surface of the markdown renderer at once: GFM constructs, a
 * highlighted code fence, the URL policy (an allowed https link next to a dropped javascript: one),
 * raw HTML that must show as literal text, a comment directive wrapping markdown in a Card, and
 * exhibit fences for a chart and a stateful checklist. Doubles as the live verification fixture for
 * plan 07.
 */
export const markdownNotesExample = {
  title: 'Markdown Renderer Notes',
  description: 'Every markdown surface in one document — GFM, fences, directives, exhibit blocks.',
  tags: ['demo', 'markdown'],
  markdown: `# Markdown Renderer Notes

Markdown artifacts render in the gallery with the same theming as specs. Links only render for
[http(s) URLs](https://example.com); [this one](javascript:alert(1)) renders as plain text.

Bare URLs do not autolink: https://example.com stays text. Raw HTML is never interpreted —
<script>alert(1)</script> shows exactly as written.

## GFM

| Surface   | Supported | Notes                    |
| --------- | --------- | ------------------------ |
| Tables    | yes       | with alignment           |
| Footnotes | yes       | linked both ways[^gfm]   |
| Autolinks | no        | write explicit links     |

[^gfm]: Footnote references and backreferences are same-document links.

- [x] Tables, task lists, ~~strikethrough~~
- [ ] Anything that needs raw HTML

Loose task items (blank-line-separated, so each wraps in a paragraph) and ordered task lists
render identically:

- [x] A loose checked item

- [ ] A loose unchecked item

1. [x] First ordered task
2. [ ] Second ordered task

## Code

\`\`\`ts
export function greet(name: string): string {
  return \`hello \${name}\`;
}
\`\`\`

## Directives

<!-- ::start:Card title="Budget" subtitle="Directive wrapping markdown" -->

A **Card** directive wraps this markdown as its content. Attributes are flat strings, so they carry
text and enum props only.

<!-- ::end:Card -->

<!-- ::Divider -->

## Exhibit blocks

\`\`\`exhibit
{
  "type": "Chart",
  "props": {
    "kind": "bar",
    "valueLabel": "Artifacts",
    "data": [
      { "label": "Spec", "value": 9 },
      { "label": "HTML", "value": 1 },
      { "label": "Markdown", "value": 1 }
    ]
  }
}
\`\`\`

\`\`\`exhibit
{
  "type": "Checklist",
  "props": {
    "items": [
      { "id": "render", "text": "Rendered tab shows this document", "statePath": "/checks/render" },
      { "id": "state", "text": "This checkbox survives a reload", "statePath": "/checks/state" }
    ]
  }
}
\`\`\`

An invalid block degrades to a code block plus an inline error rather than disappearing:

\`\`\`exhibit
{ "type": "Chart", "props": { "kind": "pie" } }
\`\`\`
`,
};
