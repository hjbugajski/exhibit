import type { Spec } from '@json-render/core';

/**
 * Uses Table/Badge/Choice/Rating/NoteBox/Callout: a decision memo asking the owner to weigh in —
 * the Choice/Rating/NoteBox trio makes sense together here since they're literally the ask of the
 * document.
 */
const spec: Spec = {
  root: 'root',
  elements: {
    root: {
      type: 'Section',
      props: {
        title: 'Backup Strategy for /data',
        subtitle: 'Decision memo — the app volume has no offsite backup today',
      },
      children: [
        'overview',
        'risk',
        'table-heading',
        'comparison',
        'stat-grid',
        'recommendation',
        'decisions-section',
      ],
    },
    overview: {
      type: 'Prose',
      props: {
        markdown:
          "Right now `/data/app.db` only exists on the Coolify host's disk — a bad disk or a fat-fingered `docker volume rm` loses every published artifact with no recovery path. Evaluated two backup tools that both support encrypted, deduplicated snapshots to S3-compatible storage: **restic** and **borgbackup**.",
      },
      children: [],
    },
    risk: {
      type: 'Callout',
      props: {
        variant: 'warning',
        title: 'No backups exist today',
        markdown:
          "This isn't a question of *which* tool is marginally better — it's whether we ship *something* this week. Either choice below is a large improvement over the current state.",
      },
      children: [],
    },
    'table-heading': {
      type: 'Heading',
      props: { level: 2, text: 'Feature Comparison' },
      children: [],
    },
    comparison: {
      type: 'Table',
      props: {
        columns: [
          { key: 'feature', label: 'Feature' },
          { key: 'restic', label: 'restic', align: 'center' },
          { key: 'borg', label: 'borg', align: 'center' },
        ],
        rows: [
          { feature: 'Native S3-compatible backend', restic: 'Yes', borg: 'Via rclone mount' },
          { feature: 'Client-side encryption', restic: 'Yes (AES-256)', borg: 'Yes (AES-256)' },
          {
            feature: 'Deduplication',
            restic: 'Content-defined chunking',
            borg: 'Content-defined chunking',
          },
          { feature: 'Single static binary', restic: 'Yes', borg: 'Yes' },
          {
            feature: 'Prune performance at our scale',
            restic: 'Fine under 50GB',
            borg: 'Faster past 50GB',
          },
          { feature: 'Restore UX', restic: 'Mount or full restore', borg: 'Mount or full restore' },
        ],
      },
      children: [],
    },
    'stat-grid': {
      type: 'Grid',
      props: { columns: 3 },
      children: ['stat-cost', 'stat-size', 'stat-restore'],
    },
    'stat-cost': {
      type: 'Card',
      props: { title: 'Estimated monthly cost', value: '$0.60', delta: 'Backblaze B2, ~28 GB' },
      children: [],
    },
    'stat-size': {
      type: 'Card',
      props: { title: 'Current /data size', value: '3.1 GB', delta: 'mostly artifact bodies' },
      children: [],
    },
    'stat-restore': {
      type: 'Card',
      props: {
        title: 'Full restore, test run',
        value: '4m 12s',
        delta: 'from cold B2',
        trend: 'flat',
      },
      children: [],
    },
    recommendation: {
      type: 'Callout',
      props: {
        variant: 'success',
        title: 'Recommendation: restic',
        markdown:
          "Native S3 support means one fewer moving part (no rclone mount to babysit), and at 3GB today we are nowhere near the scale where borg's prune speed advantage matters. Nightly snapshot via cron, 14-day retention, weekly prune.",
      },
      children: [],
    },
    'decisions-section': {
      type: 'Section',
      props: { title: 'Sign-off', subtitle: 'Answer here before this ships Friday' },
      children: ['tool-choice', 'confidence', 'notes'],
    },
    'tool-choice': {
      type: 'Choice',
      props: {
        label: 'Which backup tool should we adopt?',
        options: [
          {
            id: 'restic',
            label: 'restic',
            description: 'Native S3 backend, simplest setup — the recommendation above.',
          },
          {
            id: 'borg',
            label: 'borg',
            description: 'Faster pruning at scale; needs an rclone mount for S3.',
          },
          {
            id: 'defer',
            label: 'Defer — snapshot the volume manually for now',
            description: 'Buys time but leaves the single-point-of-failure risk in place.',
          },
        ],
        statePath: '/decisions/backup-tool',
      },
      children: [],
    },
    confidence: {
      type: 'Rating',
      props: {
        label: 'Confidence in the restic recommendation',
        statePath: '/ratings/backup-decision',
      },
      children: [],
    },
    notes: {
      type: 'NoteBox',
      props: {
        label: 'Anything to flag before this ships?',
        placeholder: 'Retention window, restore drill cadence, alternate storage provider...',
        statePath: '/feedback/backup-decision',
      },
      children: [],
    },
  },
};

export const decisionMemoExample = {
  title: 'Backup Strategy Decision: restic vs borg',
  description: 'Decision memo comparing backup tools for the app data volume; asks for sign-off.',
  tags: ['decision', 'infra', 'demo'],
  spec,
};
