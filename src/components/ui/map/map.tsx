import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react';

import 'maplibre-gl/dist/maplibre-gl.css';

import MapLibreGL from 'maplibre-gl';

import { MapContext, type Theme } from '@/components/ui/map/map-context';
import { useLatest } from '@/components/ui/map/map-utils';
import { buildProtomapsStyle } from '@/components/ui/map/protomaps-style';
import { getProtomapsApiKeyFn } from '@/lib/map-config';
import { cn } from '@/lib/utils';

/** Fallback basemaps when no PROTOMAPS_API_KEY is configured. */
const defaultStyles = {
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
};

let protomapsApiKeyPromise: Promise<string | null> | undefined;

/** `undefined` while the fetch is in flight; `null` when the deployment has no key configured. */
function useProtomapsApiKey(): string | null | undefined {
  const [apiKey, setApiKey] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    protomapsApiKeyPromise ??= getProtomapsApiKeyFn().catch(() => {
      // Don't cache transient failures: this mount falls back to Carto, the next retries.
      protomapsApiKeyPromise = undefined;
      return null;
    });

    let cancelled = false;
    void protomapsApiKeyPromise.then((value) => {
      if (!cancelled) {
        setApiKey(value);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return apiKey;
}

/**
 * A tile-less, dependency-free style with a transparent background. Use it for data visualizations
 * (choropleths, world arcs, dot maps) where you draw your own layers and don't need a street
 * basemap. The easiest way to opt in is the `blank` prop:
 *   <Map blank>...</Map>
 * The transparent background lets the themed container show through.
 */
const blankMapStyle: MapLibreGL.StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': 'rgba(0, 0, 0, 0)' },
    },
  ],
};

/**
 * The app's theme script stamps the resolved scheme as `data-theme` on <html> (see
 * src/lib/theme.ts); that wins over the media query, which only backstops the pre-stamp window.
 */
function getDocumentTheme(): Theme | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const theme = document.documentElement.dataset.theme;

  return theme === 'dark' || theme === 'light' ? theme : null;
}

function getSystemTheme(): Theme {
  if (typeof window === 'undefined') {
    return 'light';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function useResolvedTheme(themeProp?: 'light' | 'dark'): Theme {
  const [detectedTheme, setDetectedTheme] = useState<Theme>(
    () => getDocumentTheme() ?? getSystemTheme(),
  );

  useEffect(() => {
    if (themeProp) {
      return;
    }

    // Watch the theme script (and appearance menu) re-stamping data-theme on <html>.
    const observer = new MutationObserver(() => {
      const docTheme = getDocumentTheme();
      if (docTheme) {
        setDetectedTheme(docTheme);
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemChange = (e: MediaQueryListEvent) => {
      if (!getDocumentTheme()) {
        setDetectedTheme(e.matches ? 'dark' : 'light');
      }
    };
    mediaQuery.addEventListener('change', handleSystemChange);

    return () => {
      observer.disconnect();
      mediaQuery.removeEventListener('change', handleSystemChange);
    };
  }, [themeProp]);

  return themeProp ?? detectedTheme;
}

export interface MapViewport {
  /** [longitude, latitude]. */
  center: [number, number];
  zoom: number;
  /** Rotation in degrees. */
  bearing: number;
  /** Tilt in degrees. */
  pitch: number;
}

type MapStyleOption = string | MapLibreGL.StyleSpecification;

/** `ref.current` is null until the map instance mounts, despite the non-nullable type. */
export type MapRef = MapLibreGL.Map;

export type MapProps = {
  ref?: Ref<MapRef>;
  children?: ReactNode;
  className?: string;
  /**
   * Theme for the map. If not provided, detects a 'dark'/'light' document class, falling back to
   * the system preference.
   */
  theme?: Theme;
  /** Per-theme overrides for the default Carto styles. */
  styles?: {
    light?: MapStyleOption;
    dark?: MapStyleOption;
  };
  /**
   * Use a transparent, tile-less basemap instead of the default Carto street basemap — a blank
   * canvas. Used alone it renders nothing; add your own layers on top (markers, etc.). Ideal for
   * data visualizations (choropleths, arcs, dot maps). Ignored when an explicit `styles` prop is
   * provided.
   */
  blank?: boolean;
  /** Map projection type. Use `{ type: "globe" }` for 3D globe view. */
  projection?: MapLibreGL.ProjectionSpecification;
  /**
   * Controlled viewport. When provided with onViewportChange, the map becomes controlled and
   * viewport is driven by this prop.
   */
  viewport?: Partial<MapViewport>;
  /**
   * Callback fired continuously as the viewport changes (pan, zoom, rotate, pitch). Can be used
   * standalone to observe changes, or with `viewport` prop to enable controlled mode where the map
   * viewport is driven by your state.
   */
  onViewportChange?: (viewport: MapViewport) => void;
  loading?: boolean;
} & Omit<MapLibreGL.MapOptions, 'container' | 'style'>;

function DefaultLoader() {
  return (
    <div className="bg-background/50 absolute inset-0 z-10 flex items-center justify-center backdrop-blur-xs">
      <div className="flex gap-1">
        <span className="bg-foreground-subtle size-1.5 animate-pulse rounded-full" />
        <span className="bg-foreground-subtle size-1.5 animate-pulse rounded-full [animation-delay:150ms]" />
        <span className="bg-foreground-subtle size-1.5 animate-pulse rounded-full [animation-delay:300ms]" />
      </div>
    </div>
  );
}

function getViewport(map: MapLibreGL.Map): MapViewport {
  const center = map.getCenter();
  return {
    center: [center.lng, center.lat],
    zoom: map.getZoom(),
    bearing: map.getBearing(),
    pitch: map.getPitch(),
  };
}

/** Provides the context that MapControls, Marker, MapRoute, and MapPopup require as an ancestor. */
export function Map({
  ref,
  children,
  className,
  theme: themeProp,
  styles,
  blank = false,
  projection,
  viewport,
  onViewportChange,
  loading = false,
  ...props
}: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapInstance, setMapInstance] = useState<MapLibreGL.Map | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isStyleLoaded, setIsStyleLoaded] = useState(false);
  const currentStyleRef = useRef<MapStyleOption | null>(null);
  const styleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const internalUpdateRef = useRef(false);
  const resolvedTheme = useResolvedTheme(themeProp);
  const apiKey = useProtomapsApiKey();
  // Explicit styles and blank don't involve the default basemap, so they never wait on the key
  // fetch; the default path defers map creation until it settles to avoid a double style load.
  const styleReady = Boolean(styles) || blank || apiKey !== undefined;

  const isControlled = viewport !== undefined && onViewportChange !== undefined;

  const onViewportChangeRef = useLatest(onViewportChange);
  // Mount effect below only reads projection through this ref so that changing the prop after mount
  // doesn't get silently reverted on the next style reload by a handler still closing over the
  // mount-time value.
  const projectionRef = useLatest(projection);

  const mapStyles = useMemo(() => {
    // Explicit styles win. Otherwise `blank` opts into the transparent tile-less basemap; with
    // neither, the house Protomaps style when a key is configured, else the Carto defaults.
    if (styles) {
      return {
        dark: styles.dark ?? defaultStyles.dark,
        light: styles.light ?? defaultStyles.light,
      };
    }
    if (blank) {
      return { dark: blankMapStyle, light: blankMapStyle };
    }
    if (apiKey) {
      return {
        dark: buildProtomapsStyle('dark', apiKey),
        light: buildProtomapsStyle('light', apiKey),
      };
    }
    return defaultStyles;
  }, [styles, blank, apiKey]);

  // Expose the map instance to the parent via the imperative `ref`: the ref value (the MapLibre
  // instance) isn't the DOM node this component renders, so `useImperativeHandle` still earns its
  // keep under React 19's plain `ref` prop.
  useImperativeHandle(ref, () => mapInstance as MapLibreGL.Map, [mapInstance]);

  const clearStyleTimeout = useCallback(() => {
    if (styleTimeoutRef.current) {
      clearTimeout(styleTimeoutRef.current);
      styleTimeoutRef.current = null;
    }
  }, []);

  // Latest-ref (not a mount-time snapshot): creation can be deferred past first render by
  // `styleReady`, and the map must be born with the values current at creation time.
  const initialRef = useLatest({ resolvedTheme, mapStyles, props, viewport });

  useEffect(() => {
    if (!containerRef.current || !styleReady) {
      return;
    }

    const {
      resolvedTheme: initialTheme,
      mapStyles: initialMapStyles,
      props: initialProps,
      viewport: initialViewport,
    } = initialRef.current;

    const initialStyle = initialTheme === 'dark' ? initialMapStyles.dark : initialMapStyles.light;
    currentStyleRef.current = initialStyle;

    const map = new MapLibreGL.Map({
      container: containerRef.current,
      style: initialStyle,
      renderWorldCopies: false,
      attributionControl: {
        compact: true,
      },
      ...initialProps,
      ...initialViewport,
    });

    const styleDataHandler = () => {
      clearStyleTimeout();
      // Delay to ensure style is fully processed before allowing layer operations This is a
      // workaround to avoid race conditions with the style loading else we have to force update
      // every layer on setStyle change
      styleTimeoutRef.current = setTimeout(() => {
        setIsStyleLoaded(true);
        if (projectionRef.current) {
          map.setProjection(projectionRef.current);
        }
      }, 100);
    };
    const loadHandler = () => setIsLoaded(true);

    // Skip move events triggered by our own jumpTo.
    const handleMove = () => {
      if (internalUpdateRef.current) {
        return;
      }
      onViewportChangeRef.current?.(getViewport(map));
    };

    map.on('load', loadHandler);
    map.on('styledata', styleDataHandler);
    map.on('move', handleMove);
    setMapInstance(map);

    return () => {
      clearStyleTimeout();
      map.off('load', loadHandler);
      map.off('styledata', styleDataHandler);
      map.off('move', handleMove);
      map.remove();
      setIsLoaded(false);
      setIsStyleLoaded(false);
      setMapInstance(null);
    };
  }, [clearStyleTimeout, projectionRef, onViewportChangeRef, initialRef, styleReady]);

  useEffect(() => {
    if (!mapInstance || !isControlled || !viewport) {
      return;
    }
    if (mapInstance.isMoving()) {
      return;
    }

    const current = getViewport(mapInstance);
    const next = {
      center: viewport.center ?? current.center,
      zoom: viewport.zoom ?? current.zoom,
      bearing: viewport.bearing ?? current.bearing,
      pitch: viewport.pitch ?? current.pitch,
    };

    if (
      next.center[0] === current.center[0] &&
      next.center[1] === current.center[1] &&
      next.zoom === current.zoom &&
      next.bearing === current.bearing &&
      next.pitch === current.pitch
    ) {
      return;
    }

    internalUpdateRef.current = true;
    mapInstance.jumpTo(next);
    internalUpdateRef.current = false;
  }, [mapInstance, isControlled, viewport]);

  useEffect(() => {
    if (!mapInstance || !resolvedTheme) {
      return;
    }

    const newStyle = resolvedTheme === 'dark' ? mapStyles.dark : mapStyles.light;

    if (currentStyleRef.current === newStyle) {
      return;
    }

    clearStyleTimeout();
    currentStyleRef.current = newStyle;
    setIsStyleLoaded(false);

    mapInstance.setStyle(newStyle, { diff: true });
  }, [mapInstance, resolvedTheme, mapStyles, clearStyleTimeout]);

  // Sync projection when the prop changes after mount.
  useEffect(() => {
    if (!mapInstance || !isStyleLoaded || !projection) {
      return;
    }
    mapInstance.setProjection(projection);
  }, [mapInstance, isStyleLoaded, projection]);

  const contextValue = useMemo(
    () => ({
      map: mapInstance,
      isLoaded: isLoaded && isStyleLoaded,
      resolvedTheme,
    }),
    [mapInstance, isLoaded, isStyleLoaded, resolvedTheme],
  );

  return (
    <MapContext value={contextValue}>
      <div ref={containerRef} className={cn('relative h-full w-full', className)}>
        {(!isLoaded || loading) && <DefaultLoader />}
        {/* SSR-safe: children render only when map is loaded on client */}
        {mapInstance && children}
      </div>
    </MapContext>
  );
}
