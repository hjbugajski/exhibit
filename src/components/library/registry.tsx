import type { LibraryDemo, LibraryGroup } from '@/components/library/demo';
import { alertDemo } from '@/components/library/demos/alert';
import { alertDialogDemo } from '@/components/library/demos/alert-dialog';
import { badgeDemo } from '@/components/library/demos/badge';
import { buttonDemo } from '@/components/library/demos/button';
import { cardDemo } from '@/components/library/demos/card';
import { catalogBadgeDemo } from '@/components/library/demos/catalog-badge';
import { catalogCalloutDemo } from '@/components/library/demos/catalog-callout';
import { catalogCardDemo } from '@/components/library/demos/catalog-card';
import { catalogChartDemo } from '@/components/library/demos/catalog-chart';
import { catalogChecklistDemo } from '@/components/library/demos/catalog-checklist';
import { catalogChoiceDemo } from '@/components/library/demos/catalog-choice';
import { catalogCodeBlockDemo } from '@/components/library/demos/catalog-code-block';
import { catalogColumnsDemo } from '@/components/library/demos/catalog-columns';
import { catalogDetailsDemo } from '@/components/library/demos/catalog-details';
import { catalogDividerDemo } from '@/components/library/demos/catalog-divider';
import { catalogFigureDemo } from '@/components/library/demos/catalog-figure';
import { catalogGridDemo } from '@/components/library/demos/catalog-grid';
import { catalogHeadingDemo } from '@/components/library/demos/catalog-heading';
import { catalogItineraryDemo } from '@/components/library/demos/catalog-itinerary';
import { catalogKeyValueListDemo } from '@/components/library/demos/catalog-key-value-list';
import { catalogMapDemo } from '@/components/library/demos/catalog-map';
import { catalogNoteBoxDemo } from '@/components/library/demos/catalog-note-box';
import { catalogProgressDemo } from '@/components/library/demos/catalog-progress';
import { catalogProseDemo } from '@/components/library/demos/catalog-prose';
import { catalogQuoteDemo } from '@/components/library/demos/catalog-quote';
import { catalogRatingDemo } from '@/components/library/demos/catalog-rating';
import { catalogSectionDemo } from '@/components/library/demos/catalog-section';
import { catalogStepsDemo } from '@/components/library/demos/catalog-steps';
import { catalogTableDemo } from '@/components/library/demos/catalog-table';
import { catalogTabsDemo } from '@/components/library/demos/catalog-tabs';
import { catalogTimelineDemo } from '@/components/library/demos/catalog-timeline';
import { checkboxDemo } from '@/components/library/demos/checkbox';
import { collapsibleDemo } from '@/components/library/demos/collapsible';
import { dialogDemo } from '@/components/library/demos/dialog';
import { dropdownMenuDemo } from '@/components/library/demos/dropdown-menu';
import { emptyDemo } from '@/components/library/demos/empty';
import { formsDemo } from '@/components/library/demos/forms';
import { itemDemo } from '@/components/library/demos/item';
import { kitchenSinkDemo } from '@/components/library/demos/kitchen-sink';
import { mapDemo } from '@/components/library/demos/map';
import { popoverDemo } from '@/components/library/demos/popover';
import { progressDemo } from '@/components/library/demos/progress';
import { radioGroupDemo } from '@/components/library/demos/radio-group';
import { selectDemo } from '@/components/library/demos/select';
import { separatorDemo } from '@/components/library/demos/separator';
import { skeletonDemo } from '@/components/library/demos/skeleton';
import { spinnerDemo } from '@/components/library/demos/spinner';
import { tableDemo } from '@/components/library/demos/table';
import { tabsDemo } from '@/components/library/demos/tabs';

export const libraryGroupOrder: readonly LibraryGroup[] = ['Components', 'Catalog', 'Examples'];

/** Sidebar order within each group; consumed via `demosByGroup` below. */
export const libraryDemos: LibraryDemo[] = [
  // Components — the raw house UI, alphabetical.
  alertDemo,
  alertDialogDemo,
  badgeDemo,
  buttonDemo,
  cardDemo,
  checkboxDemo,
  collapsibleDemo,
  dialogDemo,
  dropdownMenuDemo,
  emptyDemo,
  formsDemo,
  itemDemo,
  mapDemo,
  popoverDemo,
  progressDemo,
  radioGroupDemo,
  selectDemo,
  separatorDemo,
  skeletonDemo,
  spinnerDemo,
  tableDemo,
  tabsDemo,
  // Catalog — every component Claude composes specs with, alphabetical.
  catalogBadgeDemo,
  catalogCalloutDemo,
  catalogCardDemo,
  catalogChartDemo,
  catalogChecklistDemo,
  catalogChoiceDemo,
  catalogCodeBlockDemo,
  catalogColumnsDemo,
  catalogDetailsDemo,
  catalogDividerDemo,
  catalogFigureDemo,
  catalogGridDemo,
  catalogHeadingDemo,
  catalogItineraryDemo,
  catalogKeyValueListDemo,
  catalogMapDemo,
  catalogNoteBoxDemo,
  catalogProgressDemo,
  catalogProseDemo,
  catalogQuoteDemo,
  catalogRatingDemo,
  catalogSectionDemo,
  catalogStepsDemo,
  catalogTableDemo,
  catalogTabsDemo,
  catalogTimelineDemo,
  // Examples
  kitchenSinkDemo,
];

/** Demos bucketed by sidebar group, computed once — the sidebar nav and overview page share it. */
export const demosByGroup: Record<LibraryGroup, LibraryDemo[]> = {
  Components: [],
  Catalog: [],
  Examples: [],
};

for (const demo of libraryDemos) {
  demosByGroup[demo.group].push(demo);
}

export function getLibraryDemo(slug: string): LibraryDemo | undefined {
  return libraryDemos.find((demo) => demo.slug === slug);
}
