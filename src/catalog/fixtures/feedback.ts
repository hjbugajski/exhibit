import type { Spec } from '@json-render/core';

/**
 * Uses the interactive quartet — Checklist/Choice/Rating/NoteBox — each persisting to its own
 * statePath: how a published artifact asks the owner something and reads the answer back through
 * get_artifact. Kept small on purpose; it ships as an example in the get_catalog payload.
 */
export const feedbackFixture: Spec = {
  root: 'root',
  elements: {
    root: {
      type: 'Section',
      props: { title: 'Backup Plan Sign-off' },
      children: ['prep', 'tool', 'confidence', 'notes'],
    },
    prep: {
      type: 'Checklist',
      props: {
        items: [
          { id: 'size', text: 'Checked the volume size', statePath: '/prep/size' },
          { id: 'cost', text: 'Compared storage cost', statePath: '/prep/cost' },
        ],
      },
      children: [],
    },
    tool: {
      type: 'Choice',
      props: {
        label: 'Which backup tool should we adopt?',
        options: [
          { id: 'restic', label: 'restic', description: 'Native S3 backend.' },
          { id: 'borg', label: 'borg', description: 'Faster pruning at scale.' },
        ],
        statePath: '/decisions/backup-tool',
      },
      children: [],
    },
    confidence: {
      type: 'Rating',
      props: { label: 'Confidence in the pick', statePath: '/ratings/backup' },
      children: [],
    },
    notes: {
      type: 'NoteBox',
      props: {
        label: 'Anything to flag?',
        placeholder: 'Retention window, restore drills...',
        statePath: '/feedback/backup',
      },
      children: [],
    },
  },
};
