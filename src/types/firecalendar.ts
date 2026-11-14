/**
 * FireCalendar API Types
 * Based on API documentation sections 2.6 and 4.3-4.6
 */

export type Region = "africa" | "south_america" | "canada_usa" | "australia";

export type Source = "observed" | "backcast" | "backcast_terra";

export interface Season {
  peak_month: number; // 1-12
  start_month: number; // 1-12 (cumulative 10%)
  end_month: number; // 1-12 (cumulative 90%)
  method: string;
}

export interface CalendarRow {
  region: Region;
  year: number; // 2001-2024
  month: number; // 1-12
  source: Source;
  value: number; // VIIRS S-NPP-equivalent detections
  p_lo: number; // ~80% range low (= value if observed)
  p_hi: number; // ~80% range high (= value if observed)
  modis: number; // raw MODIS detections
  viirs_model: number; // model value, also in observed months
  viirs_obs: number; // measured S-NPP, 0 before Feb 2012
  clim_median: number; // median of this month, 2013-2024
  ratio_vs_median: number; // value / clim_median
  pct_vs_ref: number; // 0-100, >= 90 = critical month
}

export interface CalendarFile {
  data_version: string;
  model_id: string;
  model_version: string;
  generated: string; // YYYY-MM-DD
  unit: string;
  sources: Record<Source, string>;
  season: Record<Region, Season>;
  rows: CalendarRow[]; // 1,152 rows
}

export interface IntervalRatio {
  q10: number;
  q50: number;
  q90: number;
}

export interface Manifest {
  data_version: string;
  model_id: string;
  model_version: string;
  generated: string;
  files: {
    calendar_region: string;
    cell_month: string;
    cell_index: string;
  };
  final_test_poisson_dev: number;
  known_limitations: string[];
  calendar_interval_ratios: Record<Region, IntervalRatio>;
}

/** Extended meta response from /v1/meta */
export interface Meta extends Manifest {
  unit: string;
  sources: Record<Source, string>;
  season: Record<Region, Season>;
  regions: Region[];
  years: [number, number];
  coverage_bbox: {
    min_lat: number;
    max_lat: number;
    min_lon: number;
    max_lon: number;
  };
  n_cells: number;
}

/** One month of a user-drawn box (from /v1/calendar/aoi) */
export interface AoiRow {
  year: number;
  month: number;
  source: Source; // most common source among the box's cells
  value: number;
  modis: number;
  viirs_model: number;
  p_lo: number;
  p_hi: number;
  clim_median: number | null;
  pct_vs_ref: number | null;
}

export interface AoiCalendar {
  cells: number;
  region: Region;
  note: string;
  rows: AoiRow[];
}

export interface RegionCalendar {
  region: Region;
  season: Season;
  rows: CalendarRow[];
}

export interface Box {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}

export interface HotspotsQuery {
  min_lat: number;
  min_lon: number;
  max_lat: number;
  max_lon: number;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
  source?: string;
}

/** API Error response formats */
export interface ApiErrorDetailString {
  detail: string;
}

export interface ApiErrorDetailArray {
  detail: Array<{
    type: string;
    loc: (string | number)[];
    msg: string;
    input: unknown;
  }>;
}

export type ApiErrorResponse = ApiErrorDetailString | ApiErrorDetailArray;

/** Health check response */
export interface HealthResponse {
  status: "ok";
}
