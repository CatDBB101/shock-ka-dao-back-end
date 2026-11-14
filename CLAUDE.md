# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **FireCalendar API client** for the Shock-KA DAO back-end. It provides a TypeScript client library to interact with the FireCalendar REST API (Path B), which serves fire detection calendar data derived from MODIS and VIIRS satellite observations.

## ⛔ Strict Rules

- **NO API CALLS IN CONTROLLERS**: Data transformation layers (e.g., `HotspotsController`) must be pure functions/classes with ZERO network calls. API calls are handled separately by `FireCalendarApiClient`.
- **Server layer is separate**: The Express server in `src/api/` is a thin HTTP layer that delegates to the controller. It handles routing, middleware, and serialization only - no business logic.

## Commands

### Development

```bash
# Install dependencies
bun install

# Run the API client test script (requires API server running)
bun test-api.ts

# Run hotspots controller tests
bun test-hotspots-controller.ts

# Start Express API server (development with hot reload)
bun --hot src/api/server.ts

# Start Express API server (production)
bun src/api/server.ts

# Type check the project
bun check

# Format code
bun fmt
```

### Testing

```bash
# Run tests (if test files exist)
bun test
```

Note: The `test-api.ts` file is a manual test script, not a unit test. It requires a running FireCalendar API server (default: `http://localhost:7860` or `https://ploychomphoo-firecalendar-api.hf.space`). Set `FIRECALENDAR_API_URL` environment variable to override.

## Architecture

### High-Level Structure

```
src/
├── api/                          # Express REST API layer (HTTP only)
│   ├── routes.ts                 # Route handlers (thin, delegates to controller)
│   └── server.ts                 # Express app setup, middleware, startup
├── lib/
│   ├── firecalendar-api-client.ts   # API client (network calls)
│   └── hotspots-controller.ts       # Data transformation (NO network calls)
└── types/
    ├── firecalendar.ts              # FireCalendar API types
    └── hotspots.ts                  # Hotspots transformation types
```

### API Layer (src/api/)

**Routes** (`src/api/routes.ts`)
- Thin HTTP handlers - NO business logic, NO data transformation
- Delegates all data operations to `HotspotsController`
- Handles: query parsing, response formatting, error handling
- Endpoints: `/hotspots`, `/hotspots/stats`, `/hotspots/timeseries`, `/hotspots/geojson`, `/hotspots/load`, `/hotspots/load-async`, `/health`

**Server** (`src/api/server.ts`)
- Express app with CORS, JSON parsing, request logging
- Auto-loads sample data from FireCalendar API on startup
- Health check at `/api/health`
- Root endpoint at `/` with API info

### Key Components

**FireCalendarApiClient** (`src/lib/firecalendar-api-client.ts`)

- Main client class for interacting with FireCalendar REST API
- **ONLY component allowed to make network requests**
- Constructor accepts optional `baseUrl` (defaults to `http://localhost:7860` or `FIRECALENDAR_API_URL` env var)
- Methods:
  - `healthCheck()` - GET `/health`
  - `getMeta()` - GET `/v1/meta` (full metadata including manifest, regions, seasons, coverage)
  - `getRegionCalendar(region, start?, end?)` - GET `/v1/calendar/region`
  - `getAoiCalendar(box, start?, end?)` - GET `/v1/calendar/aoi`
  - `getHotspotsCsvUrl(box, start, end, source?)` - Generates URL for `/v1/hotspots.csv`
  - `downloadHotspotsCsv(box, start, end, source?)` - Downloads CSV directly
  - `fillAoiMonths(rows)` - Static helper to fill missing months with zeros (2001-2024)
- Custom error class: `FireCalendarApiError` with status and detail

**HotspotsController** (`src/lib/hotspots-controller.ts`)

- **Pure data transformation layer - NO API CALLS**
- Transforms CSV text from FireCalendar API into optimized JSON for frontend
- Methods:
  - `parseCSV(csvText)` - Synchronous parsing with pre-allocated arrays
  - `parseCSVAsync(csvText, batchSize)` - Async generator for large files (non-blocking)
  - `loadData(data)` - Load pre-parsed data (e.g., from cached JSON)
  - `transform(options)` - Main entry point with filters, pagination, formatting
  - `computeStats(data?)` - Statistics (cached)
- Output formats: `array` | `geojson` | `grouped-by-date` | `grouped-by-confidence` | `timeseries`
- Performance features: coordinate simplification, pagination, cached stats, async parsing

**Type Definitions** (`src/types/firecalendar.ts`)

- `Region`: "africa" | "south_america" | "canada_usa" | "australia"
- `Source`: "observed" | "backcast" | "backcast_terra"
- Core interfaces: `CalendarRow`, `CalendarFile`, `Manifest`, `Meta`, `AoiRow`, `AoiCalendar`, `RegionCalendar`, `Box`, `HotspotsQuery`, `Season`, `IntervalRatio`
- Error response types: `ApiErrorResponse`

### API Endpoints (Path B)

| Endpoint              | Method | Description                 |
| --------------------- | ------ | --------------------------- |
| `/health`             | GET    | Health check                |
| `/v1/meta`            | GET    | Full metadata               |
| `/v1/calendar/region` | GET    | Region calendar data        |
| `/v1/calendar/aoi`    | GET    | Area of Interest calendar   |
| `/v1/hotspots.csv`    | GET    | FIRMS hotspots CSV download |

### Data Model Notes

- Calendar data spans 2001-2024 (288 months per region)
- Three data sources with different time ranges:
  - `backcast_terra`: before Jul 2002 (Terra-only MODIS)
  - `backcast`: Jul 2002 - Jan 2012 (modeled from MODIS)
  - `observed`: Feb 2012 onwards (VIIRS S-NPP measured)
- `pct_vs_ref >= 90` indicates critical fire months

## Configuration

- **Base URL**: Set via `FIRECALENDAR_API_URL` environment variable or constructor parameter
- **Default**: `http://localhost:7860` (local) or `https://ploychomphoo-firecalendar-api.hf.space` (demo)
- **Requirements**: FIRMS_MAP_KEY secret must be configured on the API server for hotspots CSV

## Code Style

- Uses Bun's built-in TypeScript support (`bun check` for type checking)
- ESM modules (`"type": "module"` in package.json)
- Strict TypeScript config with bundler module resolution
- Express is a dependency (likely for future server work, though client uses native `fetch`)
