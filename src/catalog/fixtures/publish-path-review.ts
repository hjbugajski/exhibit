import type { Spec } from '@json-render/core';

/**
 * A diagram-led artifact: the design review a Claude would publish after reading this repo's
 * publish path — prose carrying the argument, diagrams carrying the shapes that prose is bad at.
 *
 * It is also the end-to-end check that diagrams work outside /dev/library. All five sources are
 * drawn by the in-repo engine — a flowchart with nested subgraphs and edge labels, a composite
 * state machine with a choice pseudostate and a return edge, a sequence with activations, a
 * self-message and an alt frame, a pie, and a rollout gantt with relative task dates. Every source
 * is either lifted from the showcase demos or built out of the same constructs, so each one draws.
 */
export const publishPathReviewFixture: Spec = {
  root: 'root',
  elements: {
    root: {
      type: 'Section',
      props: {
        title: 'Publish Path Review',
        subtitle: 'Design review — MCP ingest, June 2026',
      },
      children: [
        'intro',
        'facts',
        'request-section',
        'lifecycle-section',
        'exchange-section',
        'mix-section',
        'rollout-section',
        'open-questions',
      ],
    },
    intro: {
      type: 'Prose',
      props: {
        markdown:
          'The publish tools grew one branch at a time — bearer check, then spec validation, then versioning — and nobody has walked the whole path since. This review traces a single `publish_spec` call from the MCP endpoint to the gallery card, names the two behaviours that are still undecided, and proposes a rollout.',
      },
      children: [],
    },
    facts: {
      type: 'KeyValueList',
      props: {
        columns: 2,
        items: [
          { id: 'scope', key: 'Scope', value: 'publish_spec, publish_markdown, publish_html' },
          { id: 'reviewers', key: 'Reviewers', value: 'Owner (sole maintainer)' },
          { id: 'status', key: 'Status', value: 'Draft — comments open' },
          { id: 'decide-by', key: 'Decision needed by', value: 'June 26, 2026' },
        ],
      },
      children: [],
    },

    'request-section': {
      type: 'Section',
      props: { title: 'Request path' },
      children: ['request-prose', 'request-diagram', 'request-callout'],
    },
    'request-prose': {
      type: 'Prose',
      props: {
        markdown:
          'Two gates stand between a call and a stored version: the bearer token, then the catalog schema. Both failures return to the caller rather than landing anywhere the owner can see, which is the property the whole design leans on — a rejected publish leaves no trace in the gallery.',
      },
      children: [],
    },
    'request-diagram': {
      type: 'Mermaid',
      props: {
        code: `flowchart TD
  Claude[Claude] -->|publish_spec| Endpoint

  subgraph server [Exhibit server]
    Endpoint[[MCP endpoint]] --> Token{Bearer token?}
    Token -- no --> Denied[401 unauthorized]
    Token -- yes --> Valid{Spec valid?}
    Valid -- no --> Errors[Validation errors]
    Valid -- yes --> Store[(SQLite)]

    subgraph publish [Publish path]
      Store --> Version[Version row]
      Version --> Card([Gallery card])
    end
  end

  Denied --> Claude
  Errors --> Claude
  Card -->|artifact url| Claude`,
      },
      children: [],
    },
    'request-callout': {
      type: 'Callout',
      props: {
        variant: 'warning',
        title: 'Validation errors are the product',
        markdown:
          'The error payload is the only thing that gets the next attempt right, so it has to name the element and the failing prop. Truncating it to a summary line — proposed once to keep responses small — would make a failed publish unrecoverable without guessing.',
      },
      children: [],
    },

    'lifecycle-section': {
      type: 'Section',
      props: { title: 'Artifact lifecycle' },
      children: ['lifecycle-prose', 'lifecycle-diagram', 'lifecycle-note'],
    },
    'lifecycle-prose': {
      type: 'Prose',
      props: {
        markdown:
          'Review is composite: automated checks run first and a human only sees what survives them. The verdict is a single branch point, and the "changes requested" arm returns to Draft rather than to a separate Rejected state — an artifact under revision is the same artifact.',
      },
      children: [],
    },
    'lifecycle-diagram': {
      type: 'Mermaid',
      props: {
        code: `stateDiagram-v2
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
  Published --> [*]`,
      },
      children: [],
    },
    'lifecycle-note': {
      type: 'Prose',
      props: {
        markdown:
          'Nothing currently expires: a Draft that is never submitted stays a Draft forever. That is fine at one owner and one gallery, and it is the first thing to revisit if this ever grows a second author.',
      },
      children: [],
    },

    'exchange-section': {
      type: 'Section',
      props: { title: 'One publish call, step by step' },
      children: ['exchange-prose', 'exchange-diagram', 'exchange-details'],
    },
    'exchange-prose': {
      type: 'Prose',
      props: {
        markdown:
          'The token check is a separate round trip, and it happens before anything touches the database. Both outcomes of validation return inside the same request — there is no queue and no callback, which is what keeps the tool synchronous from Claude’s side.',
      },
      children: [],
    },
    'exchange-diagram': {
      type: 'Mermaid',
      props: {
        code: `sequenceDiagram
  autonumber
  actor Claude
  participant MCP as MCP endpoint
  participant Auth as Better Auth
  participant DB as SQLite

  Claude->>+MCP: publish_spec
  MCP->>+Auth: verify bearer token
  Auth-->>-MCP: token claims
  Note right of Auth: scope and subject only

  alt spec is valid
    MCP->>+DB: insert artifact version
    DB-->>-MCP: version id
    MCP-->>Claude: artifact url
  else validation failed
    MCP--xClaude: 400 with the errors
  end

  MCP->>MCP: prune old versions
  deactivate MCP`,
      },
      children: [],
    },
    'exchange-details': {
      type: 'Details',
      props: {
        summary: 'Why pruning runs after the response is composed',
        markdown:
          'Trimming old versions is bookkeeping, not part of the publish contract: if it fails, the artifact is still published and the next call cleans up. Running it inside the transaction would make a full history the reason a good publish fails.',
      },
      children: [],
    },

    'mix-section': {
      type: 'Section',
      props: { title: 'What is actually being published' },
      children: ['mix-prose', 'mix-diagram', 'mix-note'],
    },
    'mix-prose': {
      type: 'Prose',
      props: {
        markdown:
          'Two hundred and thirty artifacts so far. Markdown dominates because it is the cheapest thing to publish, but specs are the ones that get revised — they account for most of the version rows.',
      },
      children: [],
    },
    'mix-diagram': {
      type: 'Mermaid',
      props: {
        code: `pie showData title Artifacts by kind
  "Markdown" : 128
  "Spec" : 64
  "HTML" : 32
  "Other" : 6`,
      },
      children: [],
    },
    'mix-note': {
      type: 'Prose',
      props: {
        markdown:
          'The HTML slice is the one worth watching: every one of those is a hostile document that has to open on its own origin, and it is the only kind whose cost grows with the count.',
      },
      children: [],
    },

    'rollout-section': {
      type: 'Section',
      props: { title: 'Rollout' },
      children: ['rollout-prose', 'rollout-diagram'],
    },
    'rollout-prose': {
      type: 'Prose',
      props: {
        markdown:
          'Nothing here needs a migration, so the sequencing is about confidence rather than coordination: ship behind a flag, dogfood for a week of real publishes, then make it the default.',
      },
      children: [],
    },
    'rollout-diagram': {
      type: 'Mermaid',
      props: {
        code: `gantt
  title Rollout
  section Ship
  Behind a flag :a1, 2026-06-08, 5d
  Owner dogfood :a2, after a1, 4d
  Default on :a3, after a2, 3d`,
      },
      children: [],
    },

    'open-questions': {
      type: 'Callout',
      props: {
        variant: 'info',
        title: 'Open questions',
        markdown:
          '- Should a rejected publish still consume a version number, so gaps in the history are visible?\n- Does pruning belong on a schedule instead of on the publish path, now that it is the only work after the response?',
      },
      children: [],
    },
  },
};
