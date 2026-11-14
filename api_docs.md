# Shock-KA DAO Hotspots API Documentation

## Overview

REST API for transforming and serving fire hotspots data from the FireCalendar API to frontend applications.

- **Base URL**: `http://localhost:3000/api` (development)
- **Content-Type**: `application/json`
- **Max Request Size**: 50MB (for CSV uploads)

---

## Authentication

Currently no authentication required. Add API key or JWT as needed for production.

---

## Endpoints

### 1. Health Check

```
GET /health
```

**Response**
```json
{
  "success": true,
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "service": "shock-ka-dao-hotspots-api"
}
```

---

### 2. Get Hotspots Data

```
GET /hotspots
```

Main endpoint for retrieving hotspots data with filtering, pagination, and multiple output formats.

#### Query Parameters

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `dateFrom` | string | Start date (YYYY-MM-DD) | - |
| `dateTo` | string | End date (YYYY-MM-DD) | - |
| `confidence` | string | Comma-separated: `low,nominal,high` | - |
| `minFrp` | number | Minimum Fire Radiative Power | - |
| `maxFrp` | number | Maximum Fire Radiative Power | - |
| `satellite` | string | Comma-separated satellite names | - |
| `daynight` | string | Comma-separated: `D,N` | - |
| `minLat` | number | Bounding box min latitude | - |
| `maxLat` | number | Bounding box max latitude | - |
| `minLon` | number | Bounding box min longitude | - |
| `maxLon` | number | Bounding box max longitude | - |
| `page` | number | Page number (1-based) | 1 |
| `pageSize` | number | Items per page (max 10000) | 1000 |
| `format` | string | Output format (see below) | `array` |
| `includeStats` | boolean | Include statistics in response | `false` |
| `simplifyCoords` | boolean | Reduce coordinate precision | `false` |
| `coordPrecision` | number | Decimal places for coords (1-6) | 4 |

#### Format Options

| Format | Description | Use Case |
|--------|-------------|----------|
| `array` | Flat array of hotspot objects | General purpose |
| `geojson` | GeoJSON FeatureCollection | Map rendering (Mapbox, Leaflet) |
| `grouped-by-date` | Object keyed by date (YYYY-MM-DD) | Date-based UI grouping |
| `grouped-by-confidence` | Object with `low`, `nominal`, `high` arrays | Confidence-based filtering |
| `timeseries` | Daily aggregated counts + FRP stats | Charts, trends |

#### Response (Default: array)

```json
{
  "success": true,
  "data": [
    {
      "lat": -33.1234,
      "lon": -59.5678,
      "brightness": 320.5,
      "frp": 45.6,
      "confidence": "high",
      "date": "2024-01-15",
      "time": "14:30",
      "satellite": "SNPP",
      "instrument": "VIIRS",
      "daynight": "D"
    }
  ]
}
```

#### Response (with `includeStats=true`)

```json
{
  "success": true,
  "data": [...],
  "stats": {
    "totalCount": 1500,
    "dateRange": { "from": "2024-01-01", "to": "2024-01-31" },
    "confidenceBreakdown": { "low": 300, "nominal": 700, "high": 500 },
    "satelliteBreakdown": { "SNPP": 800, "AQUA": 400, "TERRA": 300 },
    "daynightBreakdown": { "D": 900, "N": 600 },
    "frpStats": { "min": 1.2, "max": 125.8, "avg": 28.4, "sum": 42600 },
    "bbox": { "minLat": -35.0, "maxLat": -32.0, "minLon": -62.0, "maxLon": -57.0 }
  }
}
```

#### Response (with pagination)

```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "pageSize": 1000,
    "totalItems": 5432,
    "totalPages": 6,
    "hasNext": true,
    "hasPrev": false
  }
}
```

#### Response (format=geojson)

```json
{
  "success": true,
  "data": {
    "type": "FeatureCollection",
    "features": [
      {
        "type": "Feature",
        "geometry": {
          "type": "Point",
          "coordinates": [-59.5678, -33.1234]
        },
        "properties": {
          "lat": -33.1234,
          "lon": -59.5678,
          "brightness": 320.5,
          "frp": 45.6,
          "confidence": "high",
          "date": "2024-01-15",
          "time": "14:30",
          "satellite": "SNPP",
          "instrument": "VIIRS",
          "daynight": "D"
        }
      }
    ]
  }
}
```

#### Response (format=timeseries)

```json
{
  "success": true,
  "data": [
    {
      "date": "2024-01-15",
      "count": 42,
      "totalFrp": 1250.5,
      "avgFrp": 29.8,
      "maxFrp": 85.3
    },
    {
      "date": "2024-01-16",
      "count": 38,
      "totalFrp": 980.2,
      "avgFrp": 25.8,
      "maxFrp": 72.1
    }
  ]
}
```

---

### 3. Get Statistics

```
GET /hotspots/stats
```

Returns statistics for currently loaded data. Accepts same filter parameters as `/hotspots`.

**Response**
```json
{
  "success": true,
  "data": {
    "totalCount": 1500,
    "dateRange": { "from": "2024-01-01", "to": "2024-01-31" },
    "confidenceBreakdown": { "low": 300, "nominal": 700, "high": 500 },
    "satelliteBreakdown": { "SNPP": 800, "AQUA": 400, "TERRA": 300 },
    "daynightBreakdown": { "D": 900, "N": 600 },
    "frpStats": { "min": 1.2, "max": 125.8, "avg": 28.4, "sum": 42600 },
    "bbox": { "minLat": -35.0, "maxLat": -32.0, "minLon": -62.0, "maxLon": -57.0 }
  }
}
```

---

### 4. Get Time Series

```
GET /hotspots/timeseries
```

Convenience endpoint for chart data. Returns daily aggregated counts and FRP statistics.

Accepts same filter parameters as `/hotspots`.

**Response**
```json
{
  "success": true,
  "data": [
    { "date": "2024-01-15", "count": 42, "totalFrp": 1250.5, "avgFrp": 29.8, "maxFrp": 85.3 },
    { "date": "2024-01-16", "count": 38, "totalFrp": 980.2, "avgFrp": 25.8, "maxFrp": 72.1 }
  ]
}
```

---

### 5. Get GeoJSON

```
GET /hotspots/geojson
```

Convenience endpoint for map rendering. Returns GeoJSON FeatureCollection.

Accepts same filter parameters as `/hotspots`.

**Response**
```json
{
  "success": true,
  "data": {
    "type": "FeatureCollection",
    "features": [...]
  }
}
```

---

### 6. Load CSV Data

```
POST /hotspots/load
```

Load CSV data directly into the controller. Use when you have CSV text from FireCalendar API or other sources.

**Request Body**
```json
{
  "csv": "latitude,longitude,brightness,...\n-33.1234,-59.5678,320.5,...\n..."
}
```

**Response**
```json
{
  "success": true,
  "message": "Loaded 1500 hotspot records",
  "count": 1500
}
```

**Error Response (400)**
```json
{
  "success": false,
  "error": "Bad Request",
  "message": "CSV data required in request body: { csv: string }"
}
```

---

### 7. Load CSV Data (Async)

```
POST /hotspots/load-async
```

Load large CSV files asynchronously in batches. Non-blocking for very large datasets.

**Request Body**
```json
{
  "csv": "...",
  "batchSize": 10000
}
```

**Response**
```json
{
  "success": true,
  "message": "Async load completed: 50000 rows",
  "totalRows": 50000
}
```

> **Note**: Current implementation processes synchronously but yields to event loop between batches. For true async with progress updates, implement WebSocket/SSE.

---

### 8. Clear Data

```
DELETE /hotspots
```

Clears all loaded data from the controller.

**Response**
```json
{
  "success": true,
  "message": "Data cleared"
}
```

---

## Data Models

### HotspotRow

| Field | Type | Description |
|-------|------|-------------|
| `lat` | number | Latitude (WGS84) |
| `lon` | number | Longitude (WGS84) |
| `brightness` | number | Brightness temperature (Kelvin) |
| `frp` | number | Fire Radiative Power (MW) |
| `confidence` | string | `low` \| `nominal` \| `high` |
| `date` | string | Acquisition date (YYYY-MM-DD) |
| `time` | string | Acquisition time (HH:MM) |
| `satellite` | string | Satellite identifier (SNPP, AQUA, TERRA, NOAA20, NOAA21) |
| `instrument` | string | Instrument (VIIRS, MODIS) |
| `daynight` | string | `D` (day) \| `N` (night) |

### HotspotStats

| Field | Type | Description |
|-------|------|-------------|
| `totalCount` | number | Total hotspots |
| `dateRange` | object | `{ from: string, to: string }` \| null |
| `confidenceBreakdown` | object | Counts per confidence level |
| `satelliteBreakdown` | object | Counts per satellite |
| `daynightBreakdown` | object | `{ D: number, N: number }` |
| `frpStats` | object | `{ min, max, avg, sum }` |
| `bbox` | object | `{ minLat, maxLat, minLon, maxLon }` \| null |

### TimeSeriesPoint

| Field | Type | Description |
|-------|------|-------------|
| `date` | string | Date (YYYY-MM-DD) |
| `count` | number | Hotspot count for that day |
| `totalFrp` | number | Sum of FRP |
| `avgFrp` | number | Average FRP |
| `maxFrp` | number | Maximum FRP |

---

## Error Responses

All errors follow this format:

```json
{
  "success": false,
  "error": "Error Type",
  "message": "Human-readable description",
  "code": "ERROR_CODE"
}
```

| Status | Code | Description |
|--------|------|-------------|
| 400 | `BAD_REQUEST` | Invalid parameters or missing CSV |
| 404 | `NOT_FOUND` | Route not found |
| 500 | `INTERNAL_ERROR` | Unexpected server error |
| 503 | `DATA_NOT_LOADED` | No data loaded, call POST /hotspots/load first |

---

## Performance Considerations

### For Large Datasets

1. **Use Pagination**: Always use `page` and `pageSize` for large results
2. **Simplify Coordinates**: Use `simplifyCoords=true&coordPrecision=3` to reduce payload ~40%
3. **Filter Early**: Apply date, confidence, and bbox filters to reduce data before formatting
4. **Use Convenience Endpoints**: `/timeseries`, `/geojson`, `/stats` avoid transferring raw data

### Payload Size Examples

| Records | Format | Simplified | Approx Size |
|---------|--------|------------|-------------|
| 10,000 | array | No | ~3.5 MB |
| 10,000 | array | Yes (precision=3) | ~2.1 MB |
| 10,000 | geojson | No | ~4.2 MB |
| 10,000 | timeseries | N/A | ~50 KB |

### Caching

- Statistics are cached after first computation
- Controller instance is singleton (shared across requests)
- Consider Redis caching for production deployments

---

## Frontend Integration Examples

### Fetch with Filters (React/TypeScript)

```typescript
interface HotspotsResponse<T> {
  success: boolean;
  data: T;
  pagination?: PaginationInfo;
  stats?: HotspotStats;
}

async function fetchHotspots(params: {
  dateFrom?: string;
  dateTo?: string;
  confidence?: string[];
  page?: number;
  pageSize?: number;
  format?: 'array' | 'geojson' | 'timeseries';
  includeStats?: boolean;
}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) {
      searchParams.set(key, Array.isArray(value) ? value.join(',') : String(value));
    }
  });

  const response = await fetch(`/api/hotspots?${searchParams}`);
  return response.json() as Promise<HotspotsResponse<any>>;
}

// Usage
const { data, pagination, stats } = await fetchHotspots({
  dateFrom: '2024-01-01',
  dateTo: '2024-01-31',
  confidence: ['high', 'nominal'],
  page: 1,
  pageSize: 5000,
  format: 'geojson',
  includeStats: true,
});
```

### Map Integration (Mapbox GL JS)

```javascript
// Fetch GeoJSON
const response = await fetch('/api/hotspots/geojson?dateFrom=2024-01-01&dateTo=2024-01-31');
const { data: geojson } = await response.json();

// Add to Mapbox
map.addSource('hotspots', {
  type: 'geojson',
  data: geojson
});

map.addLayer({
  id: 'hotspots-layer',
  type: 'circle',
  source: 'hotspots',
  paint: {
    'circle-radius': ['interpolate', ['linear'], ['get', 'frp'], 0, 2, 100, 10],
    'circle-color': [
      'match',
      ['get', 'confidence'],
      'high', '#ff0000',
      'nominal', '#ffaa00',
      'low', '#ffff00',
      '#888888'
    ],
    'circle-opacity': 0.7
  }
});
```

### Chart Integration (Chart.js / Recharts)

```typescript
// Fetch time series for line chart
const { data: timeseries } = await fetch('/api/hotspots/timeseries?dateFrom=2024-01-01').then(r => r.json());

// Transform for Recharts
const chartData = timeseries.map(d => ({
  date: d.date,
  hotspots: d.count,
  avgFRP: Math.round(d.avgFrp * 10) / 10,
  maxFRP: Math.round(d.maxFrp * 10) / 10,
}));
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `FIRECALENDAR_API_URL` | `http://localhost:7860` | FireCalendar API base URL |
| `NODE_ENV` | `development` | Environment mode |

---

## Development

```bash
# Install dependencies
bun install

# Start development server (with hot reload)
bun --hot src/api/server.ts

# Or run directly
bun src/api/server.ts
```

### Manual Data Load for Testing

```bash
# Using curl
curl -X POST http://localhost:3000/api/hotspots/load \
  -H "Content-Type: application/json" \
  -d '{"csv": "latitude,longitude,frp,confidence,date\n-33.1,-59.5,45.6,high,2024-01-15"}'

# Or load from FireCalendar API (requires running FireCalendar server)
curl "http://localhost:7860/v1/hotspots.csv?min_lat=-34.5&max_lat=-32.5&min_lon=-61&max_lon=-58.5&start=2024-01-01&end=2024-01-31" \
  | curl -X POST http://localhost:3000/api/hotspots/load \
    -H "Content-Type: application/json" \
    -d @-
```

---

## Architecture Notes

### Separation of Concerns

```
┌─────────────────────────────────────────────────────────────┐
│                    Express Server (src/api/)                │
│  - HTTP routing, middleware, CORS, error handling          │
│  - Request/response serialization                           │
└─────────────────────────┬───────────────────────────────────┘
                          │ delegates to
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              HotspotsController (src/lib/)                  │
│  - CSV parsing (sync & async)                               │
│  - Data filtering, pagination, formatting                   │
│  - Statistics computation (cached)                          │
│  - Coordinate simplification                                │
│  - ZERO network calls                                       │
└─────────────────────────┬───────────────────────────────────┘
                          │ used by
                          ▼
┌─────────────────────────────────────────────────────────────┐
│           FireCalendarApiClient (src/lib/)                  │
│  - ONLY component making HTTP requests                      │
│  - Downloads CSV from FireCalendar API                      │
└─────────────────────────────────────────────────────────────┘
```

### Why This Separation?

1. **Testability**: Controller is pure TypeScript - unit test without HTTP mocking
2. **Reusability**: Controller can be used in CLI, workers, or other servers
3. **Maintainability**: HTTP concerns isolated from business logic
4. **Performance**: Controller has no I/O - predictable latency
5. **Scalability**: Easy to add caching layer between routes and controller

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2024-11-14 | Initial release |

---

## License

Internal use - Shock-KA DAO