import { createContext } from 'react';

/** One Stop's map pin, keyed by the registering component's React id. */
export interface DayStopMarker {
  lat: number;
  lng: number;
  label: string;
  description?: string;
}

/**
 * Registration channel from Stop up to its enclosing Day. Stops with coordinates register a marker
 * on mount (null unregisters); Day collects them and auto-renders a Map. Rendered children are
 * opaque ReactNodes to Day, so this context is the only way it can see its stops' coordinates.
 */
export type RegisterDayStop = (id: string, marker: DayStopMarker | null) => void;

export const DayMapContext = createContext<RegisterDayStop | null>(null);
