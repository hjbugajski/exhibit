import type { Spec } from '@json-render/core';

/** Uses Prose/Callout/Steps/Details: a short conceptual explainer. */
export const explainerFixture: Spec = {
  root: 'root',
  elements: {
    root: {
      type: 'Section',
      props: { title: 'How OAuth 2.1 Device Flow Works', subtitle: 'A plain-language walkthrough' },
      children: ['intro', 'callout', 'steps', 'details'],
    },
    intro: {
      type: 'Prose',
      props: {
        markdown:
          'OAuth 2.1 device flow lets a device with **no browser** (like a TV) authorize itself through a second device. See the [full spec](https://www.rfc-editor.org/rfc/rfc8628) for details.',
      },
      children: [],
    },
    callout: {
      type: 'Callout',
      props: {
        variant: 'info',
        title: 'Why this matters',
        markdown:
          'Device flow avoids ever handling the password directly on the constrained device.',
      },
      children: [],
    },
    steps: {
      type: 'Steps',
      props: {
        items: [
          {
            id: 'request-device-code',
            title: 'Request a device code',
            markdown:
              'The device calls the authorization server and receives a short code plus a verification URL.',
          },
          {
            id: 'show-user-code',
            title: 'Show the user code',
            markdown:
              'The device displays the code and asks the user to visit the URL on another device.',
          },
          { id: 'poll-for-token', title: 'Poll for a token' },
        ],
      },
      children: [],
    },
    details: {
      type: 'Details',
      props: {
        summary: 'What if the user never approves?',
        markdown:
          'The device keeps polling until the code expires, then it must start the flow over.',
      },
      children: [],
    },
  },
};
