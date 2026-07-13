import type { Spec } from '@json-render/core';

/**
 * Every catalog component at least once, composed as a real artifact would be: a project brief for
 * replacing a kitchen sink — vendor quotes, a parts list, an install-day runbook, and a pre-install
 * checklist.
 */
export const kitchenSinkFixture: Spec = {
  root: 'root',
  elements: {
    root: {
      type: 'Section',
      props: {
        title: 'Kitchen Sink Replacement',
        subtitle: 'Project brief — R&M Plumbing, targeting June 22, 2026',
      },
      children: [
        'overview',
        'figure',
        'stat-grid',
        'progress',
        'facts',
        'site-map',
        'warning',
        'quote',
        'divider',
        'vendors-section',
        'fixture-tabs',
        'parts-heading',
        'parts-table',
        'cost-heading',
        'cost-chart',
        'plan-section',
        'timeline',
        'install-day',
        'checklist',
        'decisions-section',
        'appendix',
      ],
    },
    overview: {
      type: 'Prose',
      props: {
        markdown:
          "The cast-iron sink cracked near the disposal flange in March, so we're swapping it for a stainless workstation sink with a matching garbage disposal. Scope is limited to the sink, disposal, faucet, and supply lines — the countertop and cabinets stay as-is.",
      },
      children: [],
    },
    figure: {
      type: 'Figure',
      props: {
        src: 'https://images.unsplash.com/photo-1556911220-bff31c812dba?w=1600&q=80',
        alt: 'Kitchen with a stainless sink set into a wooden countertop',
        caption: 'The target look: stainless workstation sink, existing countertop untouched.',
      },
      children: [],
    },
    'stat-grid': {
      type: 'Grid',
      props: { columns: 3 },
      children: ['stat-cost', 'stat-bids', 'stat-days'],
    },
    'stat-cost': {
      type: 'Card',
      props: {
        title: 'Estimated cost',
        value: '$2,220',
        delta: '$180 under budget',
        trend: 'up',
      },
      children: [],
    },
    'stat-bids': {
      type: 'Card',
      props: { title: 'Bids collected', value: '3', delta: '$1,250 spread', trend: 'flat' },
      children: [],
    },
    'stat-days': {
      type: 'Card',
      props: { title: 'Days to install', value: '12', delta: 'on schedule', trend: 'up' },
      children: [],
    },
    progress: {
      type: 'Progress',
      props: { label: 'Project progress', value: 70 },
      children: [],
    },
    facts: {
      type: 'KeyValueList',
      props: {
        columns: 2,
        items: [
          { id: 'budget', key: 'Budget', value: '$2,400 estimated' },
          { id: 'contractor', key: 'Contractor', value: 'R&M Plumbing (Marcus Alvarez)' },
          {
            id: 'permit',
            key: 'Permit',
            value: 'Approved — City of Springfield #PL-2026-0417',
          },
          { id: 'target-completion', key: 'Target completion', value: 'June 22, 2026' },
        ],
      },
      children: [],
    },
    'site-map': {
      type: 'Map',
      props: {
        markers: [
          {
            id: 'home',
            lat: 39.7725,
            lng: -89.6889,
            label: 'Home',
            description: 'Install site — park in the driveway, side door to the kitchen.',
          },
          {
            id: 'ferguson-supply',
            lat: 39.7621,
            lng: -89.6446,
            label: 'Ferguson Supply',
            description: 'Sink, disposal, and faucet pickup — will-call opens 7 AM.',
          },
          {
            id: 'recycling-center',
            lat: 39.8306,
            lng: -89.6108,
            label: 'Recycling center',
            description: 'Cast-iron sink drop-off; scrap metal accepted Saturdays only.',
          },
        ],
        paths: [
          {
            id: 'supply-to-home',
            points: [
              { lat: 39.7621, lng: -89.6446 },
              { lat: 39.768, lng: -89.665 },
              { lat: 39.7725, lng: -89.6889 },
            ],
          },
          {
            id: 'home-to-recycling',
            dashed: true,
            points: [
              { lat: 39.7725, lng: -89.6889 },
              { lat: 39.8306, lng: -89.6108 },
            ],
          },
        ],
      },
      children: [],
    },
    warning: {
      type: 'Callout',
      props: {
        variant: 'warning',
        title: 'Old shutoff valve is seized',
        markdown:
          "The valve under the sink hasn't been touched since the house was built. Shut off water at the street meter before demo — don't rely on it.",
      },
      children: [],
    },
    quote: {
      type: 'Quote',
      props: {
        markdown:
          'A workstation sink earns its keep the first week — the ledge lets you stage a cutting board or colander right over the basin instead of cluttering the counter.',
        attribution: 'Marcus Alvarez, R&M Plumbing (site visit notes)',
      },
      children: [],
    },
    divider: {
      type: 'Divider',
      props: {},
      children: [],
    },
    'vendors-section': {
      type: 'Section',
      props: { title: 'Vendor Quotes', subtitle: 'Three bids collected, April 2026' },
      children: ['vendor-grid'],
    },
    'vendor-grid': {
      type: 'Grid',
      props: { columns: 3 },
      children: ['card-rm', 'card-am', 'card-bp'],
    },
    'card-rm': {
      type: 'Card',
      props: { title: 'R&M Plumbing', subtitle: 'Start June 18', badge: '$2,400' },
      children: ['prose-rm', 'badge-rm'],
    },
    'prose-rm': {
      type: 'Prose',
      props: {
        markdown:
          'Includes disposal swap, new supply lines, and one day of labor. Marcus has done two other jobs in the neighborhood.',
      },
      children: [],
    },
    'badge-rm': {
      type: 'Badge',
      props: { text: 'Licensed & insured', variant: 'success' },
      children: [],
    },
    'card-am': {
      type: 'Card',
      props: { title: 'Ace Metro Plumbing', subtitle: 'Start July 2', badge: '$3,100' },
      children: ['prose-am'],
    },
    'prose-am': {
      type: 'Prose',
      props: {
        markdown:
          "Higher bid, but includes cutout resizing if the new sink doesn't match the old one.",
      },
      children: [],
    },
    'card-bp': {
      type: 'Card',
      props: { title: 'Budget Pipe Co.', subtitle: 'Start June 25', badge: '$1,850' },
      children: ['prose-bp'],
    },
    'prose-bp': {
      type: 'Prose',
      props: {
        markdown:
          "Lowest bid; doesn't include disposal removal or haul-away — we'd handle that ourselves.",
      },
      children: [],
    },
    'fixture-tabs': {
      type: 'Tabs',
      props: { items: ['Selected: workstation', 'Alternative: undermount'] },
      children: ['spec-columns', 'alt-undermount'],
    },
    'spec-columns': {
      type: 'Columns',
      props: { ratio: '1:2' },
      children: ['spec-card', 'rationale'],
    },
    'alt-undermount': {
      type: 'Prose',
      props: {
        markdown:
          'The runner-up was a Blanco Precis undermount ($389). It sits flush and is easier to wipe down, but our laminate countertop would need edge sealing and a new cutout template — about $350 extra from the countertop supplier, and Ace Metro was the only bidder willing to do it.',
      },
      children: [],
    },
    'spec-card': {
      type: 'Card',
      props: { title: 'Selected Fixture', subtitle: 'Kraus KWT200-33 workstation sink' },
      children: ['spec-kv'],
    },
    'spec-kv': {
      type: 'KeyValueList',
      props: {
        items: [
          { id: 'material', key: 'Material', value: '16-gauge stainless' },
          { id: 'dimensions', key: 'Dimensions', value: '33" x 22" x 10"' },
          {
            id: 'ledge',
            key: 'Ledge',
            value: 'Integrated, fits included colander and board',
          },
          { id: 'warranty', key: 'Warranty', value: 'Limited lifetime' },
        ],
      },
      children: [],
    },
    rationale: {
      type: 'Prose',
      props: {
        markdown:
          "We picked the workstation style mainly for the ledge accessories — [Kraus's own spec sheet](https://www.kraususa.com/) shows it fits our 33-inch cabinet without modifying the countertop cutout, unlike the undermount options we considered.",
      },
      children: [],
    },
    'parts-heading': { type: 'Heading', props: { level: 2, text: 'Parts List' }, children: [] },
    'parts-table': {
      type: 'Table',
      props: {
        columns: [
          { key: 'item', label: 'Item' },
          { key: 'model', label: 'Model / SKU' },
          { key: 'qty', label: 'Qty', align: 'right' },
          { key: 'price', label: 'Unit Price', align: 'right' },
        ],
        rows: [
          { item: 'Sink', model: 'Kraus KWT200-33', qty: '1', price: '$429' },
          {
            item: 'Garbage disposal',
            model: 'InSinkErator Evolution Compleat',
            qty: '1',
            price: '$329',
          },
          { item: 'Pull-down faucet', model: 'Delta Trinsic 9159T-DST', qty: '1', price: '$259' },
          { item: 'Basket strainer kit', model: '—', qty: '1', price: '$38' },
          { item: 'Braided supply lines (3/8")', model: '—', qty: '2', price: '$24' },
          { item: 'P-trap kit (1.5")', model: '—', qty: '1', price: '$19' },
        ],
      },
      children: [],
    },
    'cost-heading': { type: 'Heading', props: { level: 2, text: 'Cost Breakdown' }, children: [] },
    'cost-chart': {
      type: 'Chart',
      props: {
        kind: 'bar',
        valueLabel: 'Cost ($)',
        data: [
          { label: 'Sink', value: 429 },
          { label: 'Disposal', value: 329 },
          { label: 'Faucet', value: 259 },
          { label: 'Fittings', value: 81 },
          { label: 'Labor', value: 1100 },
        ],
      },
      children: [],
    },
    'plan-section': {
      type: 'Section',
      props: { title: 'Installation Plan', subtitle: 'Install-day runbook, June 20' },
      children: ['steps', 'sensor-intro', 'sensor-code'],
    },
    'sensor-intro': {
      type: 'Prose',
      props: {
        markdown:
          'Once the install passes inspection, a $25 moisture sensor goes in the under-sink cabinet. Home Assistant automation for the alert:',
      },
      children: [],
    },
    'sensor-code': {
      type: 'CodeBlock',
      props: {
        filename: 'leak-sensor.yaml',
        language: 'yaml',
        code: 'alias: Kitchen sink leak alert\ntrigger:\n  - platform: state\n    entity_id: binary_sensor.under_sink_moisture\n    to: "on"\naction:\n  - service: notify.mobile_app\n    data:\n      message: "Water detected under the kitchen sink!"\nmode: single',
      },
      children: [],
    },
    steps: {
      type: 'Steps',
      props: {
        items: [
          {
            id: 'shut-off-water',
            title: 'Shut off water at the street',
            markdown: 'Confirm no flow at the kitchen faucet before starting demo.',
          },
          { id: 'disconnect-old-sink', title: 'Disconnect the old sink and disposal' },
          {
            id: 'remove-countertop-clips',
            title: 'Remove countertop clips and lift the old sink out',
          },
          {
            id: 'dry-fit-new-sink',
            title: 'Dry-fit the new sink in the cutout',
            markdown: 'Check clearance against the cabinet face frame before applying sealant.',
          },
          { id: 'set-sink-with-putty', title: "Set the sink with plumber's putty and clamp it" },
          {
            id: 'connect-disposal-and-lines',
            title: 'Connect the disposal, trap, and supply lines',
          },
          {
            id: 'run-water-check-leaks',
            title: 'Run water and check every joint for leaks',
            markdown: 'Let it run for 10 minutes, then check under the sink again after an hour.',
          },
        ],
      },
      children: [],
    },
    timeline: {
      type: 'Timeline',
      props: {
        items: [
          { id: 'quotes-collected', label: 'April 14', title: 'Quotes collected' },
          { id: 'contractor-selected', label: 'April 22', title: 'R&M Plumbing selected' },
          { id: 'permit-submitted', label: 'May 5', title: 'Permit submitted' },
          {
            id: 'permit-approved',
            label: 'May 30',
            title: 'Permit approved',
            markdown: 'Permit #PL-2026-0417 issued by the city.',
          },
          { id: 'parts-delivered', label: 'June 18', title: 'Sink and parts delivered' },
          { id: 'installation-day', label: 'June 20', title: 'Installation day' },
        ],
      },
      children: [],
    },
    'install-day': {
      type: 'Itinerary',
      props: { title: 'Install Day Schedule', dateRange: 'June 20, 2026' },
      children: ['day-1'],
    },
    'day-1': {
      type: 'Day',
      props: { label: 'Install Day', date: 'June 20, 2026', summary: 'Marcus on site 8 AM – 2 PM' },
      children: ['stop-1', 'stop-2', 'stop-3', 'stop-4', 'stop-5'],
    },
    'stop-1': {
      type: 'Stop',
      props: {
        time: '8:00 AM',
        duration: '1 hour',
        title: 'Water shutoff & demo',
        location: 'Under-sink cabinet',
        markdown: 'Disconnect disposal and old sink, cap supply lines.',
        kind: 'activity',
      },
      children: [],
    },
    'stop-2': {
      type: 'Stop',
      props: {
        time: '9:30 AM',
        duration: '15 minutes',
        title: 'Countertop supplier drop-off',
        location: 'Driveway',
        markdown: 'Confirms the cutout template matches before final set.',
        kind: 'travel',
      },
      children: [],
    },
    'stop-3': {
      type: 'Stop',
      props: {
        time: '10:00 AM',
        duration: '3 hours',
        title: 'New sink & disposal install',
        location: 'Under-sink cabinet',
        markdown: 'Set the sink, connect the disposal, and run new supply lines.',
        kind: 'activity',
      },
      children: [],
    },
    'stop-4': {
      type: 'Stop',
      props: { time: '1:00 PM', duration: '30 minutes', title: 'Crew lunch break', kind: 'food' },
      children: [],
    },
    'stop-5': {
      type: 'Stop',
      props: {
        time: '1:30 PM',
        duration: '30 minutes',
        title: 'Leak test & walkthrough',
        markdown: 'Run water for 10 minutes, check every joint, and sign off.',
        kind: 'other',
      },
      children: [],
    },
    checklist: {
      type: 'Checklist',
      props: {
        items: [
          {
            id: 'disposal-in-stock',
            text: 'Confirm disposal model in stock at supplier',
            checked: true,
            statePath: '/pre-install/disposal-in-stock',
          },
          {
            id: 'dishwasher-line',
            text: 'Move dishwasher supply line out of the way',
            checked: true,
            statePath: '/pre-install/dishwasher-line',
          },
          {
            id: 'putty-and-lines',
            text: "Buy plumber's putty and braided supply lines",
            checked: true,
            statePath: '/pre-install/putty-and-lines',
          },
          {
            id: 'schedule-inspector',
            text: 'Schedule city inspector for final sign-off',
            statePath: '/pre-install/schedule-inspector',
          },
          {
            id: 'clear-cabinet',
            text: 'Clear out the under-sink cabinet',
            statePath: '/pre-install/clear-cabinet',
          },
        ],
      },
      children: [],
    },
    'decisions-section': {
      type: 'Section',
      props: {
        title: 'Decisions & Feedback',
        subtitle: 'Answered here; read back before the order goes in June 12',
      },
      children: ['finish-choice', 'bid-rating', 'install-notes'],
    },
    'finish-choice': {
      type: 'Choice',
      props: {
        label: 'Which faucet finish should Marcus order?',
        options: [
          {
            id: 'matte-black',
            label: 'Matte black',
            description: 'Matches the cabinet pulls; shows water spots the least.',
          },
          {
            id: 'brushed-nickel',
            label: 'Brushed nickel',
            description: 'Closest to the old faucet; safest resale pick.',
          },
          {
            id: 'chrome',
            label: 'Chrome',
            description: 'Cheapest ($30 less) and ships same-day.',
          },
        ],
        statePath: '/decisions/faucet-finish',
      },
      children: [],
    },
    'bid-rating': {
      type: 'Rating',
      props: { label: 'Confidence in the R&M bid', statePath: '/ratings/rm-bid' },
      children: [],
    },
    'install-notes': {
      type: 'NoteBox',
      props: {
        label: 'Anything else for Marcus before install day?',
        placeholder: 'Gate code, dog in the yard, preferred arrival window...',
        statePath: '/feedback/install-notes',
      },
      children: [],
    },
    appendix: {
      type: 'Details',
      props: {
        summary: 'Permit & code notes',
        markdown:
          'Springfield requires a permit for any disposal replacement involving new electrical (a switched outlet under the sink). Marcus is pulling the permit as part of the quote; inspection must pass before the warranty is registered with Kraus.',
      },
      children: [],
    },
  },
};
