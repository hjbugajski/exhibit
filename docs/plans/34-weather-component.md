# Plan 34 — Weather catalog component: static forecast and live Open-Meteo

Add one `Weather` catalog component with two sources. `static` renders a daily forecast that Claude writes. `live` renders a forecast that the server fetches from Open-Meteo when the owner views the artifact. The plan does not add hourly or historical weather, place-name geocoding, stored forecasts, or a weather prop on `Day`/`Stop` (plan 36 owns itinerary integration).

## Status

- **Planned at**: commit `ffee99b`, 2026-09-26
- **Effort**: M
- **Risk**: MED. It adds the first server-side third-party call from artifact content. The `get_catalog` budget test has 13 tokens of headroom at `ffee99b`, so this plan must raise the ceiling (measured: 15,949 chars, 3,987 of 4,000 tokens).
- **Depends on**: none

## Why this matters

The owner asked for a weather component, static and dynamic. Trip artifacts can state a forecast only as prose, and that text goes stale. A static strip lets Claude show a forecast it researched. A live strip shows the current forecast for a place whenever the owner opens the artifact.

## Context

- `src/catalog/catalog.ts` holds the zod catalog. Size caps are at `:23-26` (`SHORT_MAX`, `LONG_MAX`), `latLng` is at `:34-37` (not exported), and the Travel group is at `:615-684` (`Itinerary` `:616`, `Day` `:633`, `Stop` `:651`). `CatalogComponentProps` (`:692`) is `z.infer` of a component's props, so a union schema gives a union props type.
- `src/components/catalog/mermaid-schema.ts` is the exemplar for a React-free, server-free constants module that `catalog.ts` imports (`catalog.ts:21`).
- `src/lib/mcp/catalog-summary.ts` builds the `get_catalog` text. `summarizeProps` (`:67-70`) sends a non-object schema to `summarizeType`, which prints a union as `A|B` (`:29-31`). It prints object fields without their `.describe()` text (`:41-49`). `ZodDiscriminatedUnion` is an instance of `z.ZodUnion` in zod 4.4.3 (checked). `ZodDefault` falls through to `'unknown'` (`:64`), so Weather props must not use `.default()`.
- `src/lib/mcp/catalog-summary.unit.test.ts:7-12` pins the budget at `< 4000` tokens (chars / 4).
- `src/catalog/fixtures/kitchen-sink.unit.test.ts:7-14` fails unless the kitchen-sink fixture uses every catalog component. `src/catalog/registry.unit.test.tsx:70` renders that fixture in happy-dom.
- Registry: `src/catalog/registry.tsx:43-73` (`catalogComponents`). Markdown directives parse flat string attributes (`src/catalog/directive.ts:49`), so Weather is reachable in markdown only through an `exhibit` fence; no change there.
- Runtime server fn exemplar: `src/lib/map-config.ts:11-13`. It is a GET fn with `.middleware([sessionMiddleware])`, and `src/components/ui/map/map.tsx:44-61` calls it from an effect with a cancel flag and drops the cached promise on failure. Input validation uses `.validator(zodSchema)` (`src/lib/artifacts.ts:61-63`). `src/lib/artifacts.ts:41-47` explains that Start strips only the literal `.handler()` body from the client bundle.
- Catalog component exemplars: `src/components/catalog/stop.tsx` (lucide icon map, `aria-hidden` icons, `flowTight`), `key-value-list.tsx` (restrained layout, `flowBlock`), `map.tsx:23` (skeleton fallback). Flow tiers are in `src/components/catalog/flow.ts:19-29`. The skeleton is `src/components/ui/skeleton.tsx`.
- Server-fn mocking in component tests: `src/components/artifacts/edit-artifact-dialog.unit.test.tsx:11-15`. Component test structure: `src/components/catalog/day.unit.test.tsx`. Validator error test shape: `src/catalog/validate.unit.test.ts:98-122`.
- Library: `src/components/library/demos/catalog-map.tsx` (demo via `catalogDemo`; control kinds are in `src/components/library/playground.tsx:10`), and `src/components/library/registry.tsx:85-112` (catalog demos, alphabetical).
- `README.md:137` is the "External fetches" bullet. Plan 16 rewrites it as a complete list, and plan 16 owns the stale component count at `README.md:7`. This plan does not touch `:7`.
- The lucide-react 1.33.0 exports `Sun`, `CloudSun`, `Cloud`, `CloudFog`, `CloudDrizzle`, `CloudRain`, `CloudSnow`, `CloudLightning`, and `Wind` (checked).

Locked shape: one `Weather` component with `z.discriminatedUnion('source', …)` props, not separate `Weather`/`LiveWeather` components. Two components would cost about 130 more budget tokens and split one idea; the union gives branch-precise errors (zod 4.4.3 reports live-without-`location` at `location`, an unknown source at `source`). Cost: field descriptions inside the union do not reach `get_catalog`, so the component description carries the semantics. Live uses `dayCount` (never a `days` prop of a second type); there is no wind field (WMO codes have no wind class); `summary` is block-level and static-only (an authored summary on a live block goes stale).

Domain skills the executor must follow: `/Users/henry/.claude/skills/building-components/SKILL.md` (read `references/accessibility.md` and `references/composition.md`), `/Users/henry/.claude/skills/web-design-guidelines/SKILL.md`, `/Users/henry/.claude/skills/react-best-practices/SKILL.md` (read `references/client.md` and `references/rerender.md`, and ignore `client-tanstack-query`, because TanStack Query is not a dependency), `/Users/henry/.claude/skills/writing-style/SKILL.md` (for the catalog description, UI copy, and the README line), and `/Users/henry/.claude/skills/code-comments/SKILL.md`.

Cross-phase rules: follow the repo `CLAUDE.md` conventions (DOM suites use `// @vitest-environment happy-dom`; this plan adds no env var). The browser must never call a third party for weather.

If the code has drifted from this section since `ffee99b`, re-check the decision it supports before you continue. Report material drift. Do not silently replan.

## Gate

`pnpm gate` (typecheck, lint, fmt, test) closes every phase. CI runs the `:check` variants (`pnpm lint:check`, `pnpm fmt:check`). If `node -v` disagrees with `.node-version` (26), prefix with `mise exec --`.

## How to execute

- Run one phase per fresh session. The owner commits between phases.
- The orchestrator dispatches ONE subagent per phase (`Task` tool, `subagent_type: general-purpose`) with this plan's Context, the phase's Decisions/Scope/Acceptance, and the intent. It verifies with the gate and re-prompts the SAME subagent on failure. It does not edit files itself.
- On success, write a short "what changed, what to test" summary, then stop for owner review.

## Phases

1. Forecast data path: condition enum, WMO mapping, Open-Meteo fetch with cache, `getForecastFn`, README fetch line.
2. `Weather` catalog entry and component (static and live), registry, kitchen sink, budget bump.
3. `/dev/library` demo and validator error-path tests.

---

## Phase 1 — Forecast data path

**Goal**: A session-guarded server fn returns a 7-day forecast for a coordinate from Open-Meteo, validated and cached. The browser never contacts Open-Meteo.

**Decisions**:

- New `src/components/catalog/weather-schema.ts`, modeled on `mermaid-schema.ts`: `export const weatherConditions = ['clear', 'partly-cloudy', 'cloudy', 'fog', 'drizzle', 'rain', 'snow', 'thunderstorm', 'windy'] as const`, `export type WeatherCondition`, and `export const FORECAST_DAYS_MAX = 7`.
- New `src/lib/weather.ts` exports the following:
  - `type ForecastDay = { date: string; high: number; low: number; condition: WeatherCondition; precipitationChance?: number }`. `date` is ISO `YYYY-MM-DD` in the location's time zone. Temperatures are in °C.
  - `conditionFromWmoCode(code: number): WeatherCondition`. Map 0–1 to clear, 2 to partly-cloudy, 3 to cloudy, 45 and 48 to fog, 51–57 to drizzle, 61–67 and 80–82 to rain, 71–77 and 85–86 to snow, and 95–99 to thunderstorm. Map any other code to cloudy. `windy` exists for static authoring only.
  - `parseForecast(json: unknown): ForecastDay[]`. It parses a zod schema of `daily.{time, weather_code, temperature_2m_max, temperature_2m_min, precipitation_probability_max}`, where precipitation entries can be `null`. A `null` omits the field. A shape mismatch throws.
  - `fetchForecast({ lat, lng })`. It requests `https://api.open-meteo.com/v1/forecast` with the coordinates rounded to 2 decimal places, `daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max`, `timezone=auto`, and `forecast_days=7`, with `signal: AbortSignal.timeout(5000)`. A non-OK status throws.
  - Cache: a module-scope `Map` keyed by the rounded `"lat,lng"`. It stores `{ expires, promise }` so that concurrent callers share one upstream call. The TTL is 30 min. The cache holds at most 256 entries, and an insert over the cap evicts the oldest (insertion order). A rejected promise leaves the cache, as `src/components/ui/map/map.tsx:45-49` does.
  - `getForecastFn = createServerFn({ method: 'GET' }).middleware([sessionMiddleware]).validator(…).handler(({ data }) => fetchForecast(data))`. The validator is a local `z.object` with the same bounds as `latLng` (lat ±90, lng ±180); do not import `catalog.ts` into this module. Because the handler delegates, `fetchForecast` and the cache ship in the client bundle as dead code (`src/lib/artifacts.ts:41-47`), so `weather.ts` must import nothing server-only (no `db`, no `env`).
- The server always fetches 7 days in °C. The component slices and converts, so the cache key has no unit or day count.
- `README.md:137`: add one server-side sentence to the "External fetches" bullet. It says that live Weather blocks make the server call `api.open-meteo.com` with the block's coordinates rounded to 2 decimal places, and that the viewer's IP is not sent. The bullet's closing claim ("No other third-party calls are made") stays true. If plan 16 has rewritten the bullet already, add the sentence to its server-side part.

**Scope**: In: `src/components/catalog/weather-schema.ts`, `src/lib/weather.ts`, `src/lib/weather.unit.test.ts` (all new), and `README.md:137`. Out: the catalog entry and any UI (Phase 2).

**Acceptance**:

- `pnpm gate` exits 0.
- `grep -n "sessionMiddleware" src/lib/weather.ts` matches the `getForecastFn` chain.
- `src/lib/weather.unit.test.ts` (node env; stub `fetch` with `vi.stubGlobal`, use fake timers for the TTL, and give each case distinct coordinates instead of a test-only cache reset):
  - `it.each` over one code per WMO group, plus an unknown code that maps to cloudy.
  - A fixture response parses to 7 days, and a `null` precipitation entry omits the field.
  - A malformed body (no `daily`) rejects.
  - The request URL carries rounded coordinates, `timezone=auto`, and `forecast_days=7`, and it passes an `AbortSignal`.
  - A second call within 30 min makes no second fetch. A call after 30 min refetches.
  - A failed fetch is not cached: the next call fetches again.
  - A non-OK status rejects.

---

## Phase 2 — Weather catalog entry and component

**Goal**: Claude can publish a `Weather` element with either source. Static renders its authored days. Live renders a skeleton on the server and then the fetched forecast, or a quiet error line.

**Decisions**:

- `catalog.ts`: add `Weather` in the Travel group after `Stop`, as a leaf. Props are `z.discriminatedUnion('source', [staticBranch, liveBranch])`. Do not use `.default()` or field `.describe()` anywhere in the union: the summarizer drops the descriptions (Context), and a default prints as `unknown`.
  - Static: `{ source: z.literal('static'), unit: z.enum(['c', 'f']), label?: string, summary?: string, days: array 1..FORECAST_DAYS_MAX of { date: string, high: number, low: number, condition: z.enum(weatherConditions), precipitationChance?: int 0..100 } }`. Strings are capped at `SHORT_MAX`. Put a `uniqueBy` check on `date`, reusing the helper at `catalog.ts:55`.
  - Live: `{ source: z.literal('live'), location: latLng, label?: string, unit?: z.enum(['c', 'f']), dayCount?: int 1..FORECAST_DAYS_MAX }`. The component defaults are `unit` c and `dayCount` 5.
  - Description, 350 characters or fewer, written to the writing-style rules. It states that the strip covers 1–7 days, and that `static` means you supply the days (`date` as displayed, highs and lows in `unit`, `precipitationChance` as a percentage). It states that `live` makes the app fetch a forecast for `location` each time the artifact is viewed, which suits trips within the next week.
- New `src/components/catalog/weather.tsx` exports `Weather`, which dispatches on `props.source` to two module-scope components, `StaticWeather` and `LiveWeather`. They share one presentational forecast strip. The hook stays module-local in this file (`useForecast(lat, lng)`, with primitive deps), so no `use-*.ts` file is added. Its states are `loading | ready(days) | error`. It calls `getForecastFn({ data: { lat, lng } })` in an effect with a cancel flag, as `src/components/ui/map/map.tsx:44-61` does. There is no viewport gating and no fetch during SSR: effects do not run on the server, so SSR output is the skeleton.
- Strip: a `<ul>` of day tiles, each with a date label, an icon, the high and low temperatures, and the precipitation %. The strip wraps with no horizontal scroll at 320 px. Icons map from `weatherConditions` (`clear` Sun, `partly-cloudy` CloudSun, `cloudy` Cloud, `fog` CloudFog, `drizzle` CloudDrizzle, `rain` CloudRain, `snow` CloudSnow, `thunderstorm` CloudLightning, `windy` Wind). Icons are `aria-hidden`, and each tile has sr-only condition text such as "Partly cloudy". Temperatures are rounded and formatted with `Intl.NumberFormat` (`style: 'unit'`, `unit: 'celsius' | 'fahrenheit'`, `unitDisplay: 'narrow'`) in `tabular-nums`. `label` is a `<p>`, not a heading, so it stays out of the artifact outline. `summary` is muted text under the strip. Use the `flowBlock` rhythm and no Card chrome.
- Live specifics:
  - Live dates are formatted with `Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })` from `${date}T00:00:00Z`, so the ISO day never shifts.
  - °F = °C × 9/5 + 32, applied before rounding.
  - Slice to `dayCount`.
  - While loading, render `dayCount` skeleton tiles at tile size (no layout shift) under `aria-busy`.
  - On error, render "Forecast unavailable. Reload the page to try again." in muted text inside an `aria-live="polite"` region. Never throw into the artifact.
  - Show a muted source line with a link to `https://open-meteo.com`: "Forecast data: Open-Meteo". Open-Meteo data is CC BY 4.0 and requires attribution.
- `registry.tsx`: import `Weather` and add it after `Stop`. `kitchen-sink.ts`: add one static Weather element (no fixture uses the live source, because tests render fixtures). Do not add Weather to `EXAMPLE_SPECS`.
- `catalog-summary.unit.test.ts:11`: shared budget rule (plans 34, 35, 36): run the budget test after the catalog change; if it fails, set the ceiling to the measured `text.length / 4` rounded up to the next 100, update the "~4k" wording at `catalog-summary.ts:3` to match, and report the before and after sizes. The Weather section of the summary must be 1000 characters or fewer.

**Scope**: In: `src/catalog/catalog.ts`, `src/components/catalog/weather.tsx` (new), `src/components/catalog/weather.unit.test.tsx` (new), `src/catalog/registry.tsx`, `src/catalog/fixtures/kitchen-sink.ts`, and `src/lib/mcp/catalog-summary.unit.test.ts`. Out: summarizer logic changes, the `Day`/`Itinerary` descriptions (plan 36), and the library demo (Phase 3).

**Acceptance**:

- `pnpm gate` exits 0, and the kitchen-sink coverage and registry render suites pass unchanged except for the added element.
- `weather.unit.test.tsx` (happy-dom, mock `@/lib/weather` as in `edit-artifact-dialog.unit.test.tsx:11-15`):
  - Static renders one list item per day with the label, high, low, and precipitation, and `unit: 'f'` formats as °F.
  - Live pending shows `aria-busy` and `dayCount` skeletons.
  - Live resolved shows tiles sliced to `dayCount`, and 20 °C renders as 68 °F with `unit: 'f'`.
  - Live rejected shows the "Forecast unavailable" text.
- Manual smoke (owner): `/dev/library/kitchen-sink` shows the static strip in light and dark, and the strip wraps at 320 px.

---

## Phase 3 — Library demo and error paths

**Goal**: The owner can view both sources in `/dev/library`, and the validator's errors for a bad Weather element point at the field to fix.

**Decisions**:

- New `src/components/library/demos/catalog-weather.tsx` built on `catalogDemo`. It has a `select` control for `source` (static or live) and a `select` control for `unit`. The live source uses a fixed Kyoto coordinate, as in `catalog-map.tsx:4`. Register it in `src/components/library/registry.tsx` alphabetically after `catalogTimelineDemo`.
- `src/catalog/validate.unit.test.ts`: add cases modeled on `:98-122`. A live Weather without `location` errors at `elements.<key>.props.location`. An unknown `source` errors at `elements.<key>.props.source`. A static Weather with duplicate `date` values errors on `days`.

**Scope**: In: the two library files and `validate.unit.test.ts`. Out: any component or schema change. If a test exposes a schema bug, report it. Do not fix it in this phase.

**Acceptance**:

- `pnpm gate` exits 0.
- Manual smoke (owner, signed in): `/dev/library/catalog-weather` with source live shows a skeleton, then 5 Kyoto tiles. With the network offline, it shows the error line and no console error.

---

## When reality disagrees with the plan

Adapt and continue when the change still serves the intent, respects the locked decisions, and stays in scope. Note each deviation in the final summary. Stop and report instead when a locked decision is wrong or impossible, when the work needs out-of-scope files, or when acceptance fails after a couple of honest attempts. One risk is specific to this plan: if Open-Meteo's response keys differ from the Phase 1 schema, stop and report. Do not loosen the schema to `unknown`.

## Done criteria

- [ ] `pnpm gate` exits 0.
- [ ] `grep -rln "open-meteo" src --include="*.tsx" | grep -v unit.test` → only `src/components/catalog/weather.tsx` (the attribution link; no client fetch).
- [ ] `grep -n "Weather" src/catalog/registry.tsx src/catalog/fixtures/kitchen-sink.ts src/components/library/registry.tsx` → at least one match in each file.
- [ ] `grep -n "open-meteo" README.md` → one match in the "External fetches" bullet.
- [ ] `docs/plans/README.md` status row updated.

## Open questions

- Amplification: a spec with hundreds of live Weather blocks at distinct coordinates makes as many upstream calls per view. Default: accept it, because the owner is the only viewer and the cache caps memory. A follow-up plan can add a publish-time lint (for example, 20 live blocks per spec); Phase 3 is scoped to no schema change.
- Visual variants: the owner's preference is to choose among 3–4 screenshot variants for significant UI. Default: ship the single strip in Phase 2, and the owner reviews it in `/dev/library` before Phase 3. Phase 2 resolves this.
- `windy` for live data: WMO codes have no wind class. Default: live never reports `windy`. Deriving it from `wind_speed_10m_max` is deferred until someone asks for it.
