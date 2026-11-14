/**
 * Hotspots Data Types
 * Types for CSV-to-JSON transformation and frontend consumption
 */

export interface HotspotRawRow {
  latitude: number;
  longitude: number;
  brightness: number;
  scan: number;
  track: number;
  acq_date: string;      // YYYY-MM-DD
  acq_time: string;      // HHMM
  satellite: string;
  instrument: string;
  confidence: number | string;  // Can be "low", "nominal", "high" or numeric
  version: string;
  bright_t31: number;
  frp: number;           // Fire Radiative Power
  daynight: "D" | "N";
}

export interface HotspotRow {
  lat: number;
  lon: number;
  brightness: number;
  frp: number;
  confidence: ConfidenceLevel;
  date: string;          // YYYY-MM-DD
  time: string;          // HH:MM
  satellite: string;
  instrument: string;
  daynight: "D" | "N";
}

export type ConfidenceLevel = "low" | "nominal" | "high";

export interface HotspotFilters {
  dateFrom?: string;     // YYYY-MM-DD
  dateTo?: string;       // YYYY-MM-DD
  confidence?: ConfidenceLevel[];
  minFrp?: number;
  maxFrp?: number;
  satellite?: string[];
  daynight?: ("D" | "N")[];
  bbox?: BoundingBox;
}

export interface BoundingBox {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}

export interface PaginationParams {
  page: number;          // 1-based
  pageSize: number;      // max 10000
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface HotspotStats {
  totalCount: number;
  dateRange: { from: string; to: string } | null;
  confidenceBreakdown: Record<ConfidenceLevel, number>;
  satelliteBreakdown: Record<string, number>;
  daynightBreakdown: { D: number; N: number };
  frpStats: { min: number; max: number; avg: number; sum: number };
  bbox: BoundingBox | null;
}

export interface GroupedByDate {
  [date: string]: HotspotRow[];
}

export interface GroupedByConfidence {
  low: HotspotRow[];
  nominal: HotspotRow[];
  high: HotspotRow[];
}

export interface TimeSeriesPoint {
  date: string;
  count: number;
  totalFrp: number;
  avgFrp: number;
  maxFrp: number;
}

export interface GeoJSONFeatureCollection {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
}

export interface GeoJSONFeature {
  type: "Feature";
  geometry: GeoJSONPoint;
  properties: HotspotRow;
}

export interface GeoJSONPoint {
  type: "Point";
  coordinates: [number, number]; // [longitude, latitude]
}

export type OutputFormat = "array" | "geojson" | "grouped-by-date" | "grouped-by-confidence" | "timeseries";

export interface TransformOptions {
  format?: OutputFormat;
  filters?: HotspotFilters;
  pagination?: PaginationParams;
  includeStats?: boolean;
  simplifyCoords?: boolean;     // Reduce precision for smaller payload
  coordPrecision?: number;      // Decimal places (default: 4)
}