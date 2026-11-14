/**
 * Hotspots Controller
 * Transforms CSV data from FireCalendar API into optimized JSON for frontend consumption.
 * Pure data transformation layer - NO API calls.
 */

import type {
  HotspotRawRow,
  HotspotRow,
  HotspotFilters,
  PaginationParams,
  PaginatedResult,
  HotspotStats,
  GroupedByDate,
  GroupedByConfidence,
  TimeSeriesPoint,
  OutputFormat,
  TransformOptions,
  BoundingBox,
  ConfidenceLevel,
  GeoJSONFeatureCollection,
} from "../types/hotspots";

const CONFIDENCE_MAP: Record<string | number, ConfidenceLevel> = {
  low: "low",
  nominal: "nominal",
  high: "high",
  0: "low",
  1: "nominal",
  2: "high",
  30: "low",
  80: "nominal",
  90: "high",
};

const SATELLITE_NORMALIZE: Record<string, string> = {
  "Terra": "TERRA",
  "Aqua": "AQUA",
  "Suomi NPP": "SNPP",
  "NOAA-20": "NOAA20",
  "NOAA-21": "NOAA21",
};

interface ParsedCSV {
  headers: string[];
  rows: HotspotRawRow[];
}

export class HotspotsController {
  private data: HotspotRow[] = [];
  private stats: HotspotStats | null = null;
  private isParsed: boolean = false;

  /**
   * Parse CSV text into structured HotspotRow array
   * Optimized for large datasets with streaming-friendly approach
   */
  parseCSV(csvText: string): HotspotRow[] {
    const lines = csvText.trim().split("\n");
    if (lines.length < 2 || !lines[0]) {
      this.data = [];
      this.stats = null;
      this.isParsed = false; // Don't mark as parsed if no valid data
      return this.data;
    }

    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const headerIndex = this.buildHeaderIndex(headers);

    // Pre-allocate array for performance
    const parsed: HotspotRow[] = new Array(lines.length - 1);
    let validCount = 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]?.trim();
      if (!line) continue;

      const values = this.parseCSVLine(line);
      if (values.length !== headers.length) continue;

      const row = this.mapRow(values, headerIndex);
      if (row) {
        parsed[validCount++] = row;
      }
    }

    this.data = parsed.slice(0, validCount);
    this.stats = null; // Invalidate cached stats
    this.isParsed = this.data.length > 0; // Only mark parsed if we have valid data

    return this.data;
  }

  /**
   * Parse CSV with async iteration for very large files (non-blocking)
   * Yields control every `batchSize` rows
   */
  async *parseCSVAsync(
    csvText: string,
    batchSize: number = 10000
  ): AsyncGenerator<HotspotRow[], void, unknown> {
    const lines = csvText.trim().split("\n");
    if (lines.length < 2 || !lines[0]) return;

    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const headerIndex = this.buildHeaderIndex(headers);

    const batch: HotspotRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]?.trim();
      if (!line) continue;

      const values = this.parseCSVLine(line);
      if (values.length !== headers.length) continue;

      const row = this.mapRow(values, headerIndex);
      if (row) {
        batch.push(row);
        if (batch.length >= batchSize) {
          yield [...batch]; // Yield a copy to avoid reference issues
          batch.length = 0;
          // Yield control to event loop
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
    }

    if (batch.length > 0) {
      yield [...batch]; // Yield a copy
    }
  }

  /**
   * Load pre-parsed data directly (e.g., from cached JSON)
   */
  loadData(data: HotspotRow[]): void {
    this.data = data;
    this.stats = null;
    this.isParsed = true;
  }

  /**
   * Get current data (already parsed)
   */
  getData(): HotspotRow[] {
    return this.data;
  }

  /**
   * Transform data with filters, pagination, and output formatting
   * Main entry point for frontend consumption
   */
  transform(options: TransformOptions = {}):
    | HotspotRow[]
    | PaginatedResult<HotspotRow>
    | GroupedByDate
    | GroupedByConfidence
    | TimeSeriesPoint[]
    | { data: HotspotRow[]; stats: HotspotStats }
    | { data: any; stats: HotspotStats } {

    if (!this.isParsed) {
      throw new Error("No data loaded. Call parseCSV() or loadData() first.");
    }

    const {
      format = "array",
      filters,
      pagination,
      includeStats = false,
      simplifyCoords = false,
      coordPrecision = 4,
    } = options;

    // Apply filters
    let filtered = this.applyFilters(this.data, filters);

    // Simplify coordinates if requested (reduces payload size)
    if (simplifyCoords) {
      filtered = this.simplifyCoordinates(filtered, coordPrecision);
    }

    // Compute stats if needed
    const stats = includeStats ? this.computeStats(filtered) : null;

    // Apply pagination
    let result: any;
    if (pagination) {
      result = this.paginate(filtered, pagination);
    } else {
      result = filtered;
    }

    // Format output
    const formatted = this.formatOutput(result, format);

    if (includeStats) {
      return { data: formatted, stats: stats! };
    }

    return formatted;
  }

  /**
   * Apply filters to data
   */
  private applyFilters(data: HotspotRow[], filters?: HotspotFilters): HotspotRow[] {
    if (!filters) return data;

    return data.filter((row) => {
      if (filters.dateFrom && row.date < filters.dateFrom) return false;
      if (filters.dateTo && row.date > filters.dateTo) return false;
      if (filters.confidence?.length && !filters.confidence.includes(row.confidence)) return false;
      if (filters.minFrp !== undefined && row.frp < filters.minFrp) return false;
      if (filters.maxFrp !== undefined && row.frp > filters.maxFrp) return false;
      if (filters.satellite?.length && !filters.satellite.includes(row.satellite)) return false;
      if (filters.daynight?.length && !filters.daynight.includes(row.daynight)) return false;
      if (filters.bbox && !this.inBBox(row, filters.bbox)) return false;
      return true;
    });
  }

  private inBBox(row: HotspotRow, bbox: BoundingBox): boolean {
    return (
      row.lat >= bbox.minLat &&
      row.lat <= bbox.maxLat &&
      row.lon >= bbox.minLon &&
      row.lon <= bbox.maxLon
    );
  }

  /**
   * Simplify coordinates to reduce payload size
   */
  private simplifyCoordinates(data: HotspotRow[], precision: number): HotspotRow[] {
    const factor = Math.pow(10, precision);
    return data.map((row) => ({
      ...row,
      lat: Math.round(row.lat * factor) / factor,
      lon: Math.round(row.lon * factor) / factor,
    }));
  }

  /**
   * Paginate results
   */
  private paginate(data: HotspotRow[], params: PaginationParams): PaginatedResult<HotspotRow> {
    const page = Math.max(1, params.page);
    const pageSize = Math.min(Math.max(1, params.pageSize), 10000);
    const totalItems = data.length;
    const totalPages = Math.ceil(totalItems / pageSize);
    const start = (page - 1) * pageSize;
    const end = start + pageSize;

    return {
      data: data.slice(start, end),
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Format output based on requested format
   */
  private formatOutput(
    data: HotspotRow[] | PaginatedResult<HotspotRow>,
    format: OutputFormat
  ): any {
    const rows = Array.isArray(data) ? data : data.data;

    switch (format) {
      case "array":
        return data;

      case "geojson":
        return this.toGeoJSON(rows);

      case "grouped-by-date":
        return this.groupByDate(rows);

      case "grouped-by-confidence":
        return this.groupByConfidence(rows);

      case "timeseries":
        return this.toTimeSeries(rows);

      default:
        return data;
    }
  }

  /**
   * Convert to GeoJSON FeatureCollection
   */
  private toGeoJSON(rows: HotspotRow[]): GeoJSONFeatureCollection {
    return {
      type: "FeatureCollection",
      features: rows.map((row) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [row.lon, row.lat],
        },
        properties: row,
      })),
    };
  }

  /**
   * Group by date (YYYY-MM-DD)
   */
  private groupByDate(rows: HotspotRow[]): GroupedByDate {
    const grouped: GroupedByDate = {};
    for (const row of rows) {
      const date = row.date;
      if (!grouped[date]) grouped[date] = [];
      grouped[date].push(row);
    }
    return grouped;
  }

  /**
   * Group by confidence level
   */
  private groupByConfidence(rows: HotspotRow[]): GroupedByConfidence {
    const grouped: GroupedByConfidence = { low: [], nominal: [], high: [] };
    for (const row of rows) {
      grouped[row.confidence].push(row);
    }
    return grouped;
  }

  /**
   * Aggregate to time series (daily counts + FRP stats)
   */
  private toTimeSeries(rows: HotspotRow[]): TimeSeriesPoint[] {
    const dailyMap = new Map<string, { count: number; totalFrp: number; maxFrp: number }>();

    for (const row of rows) {
      const existing = dailyMap.get(row.date) || { count: 0, totalFrp: 0, maxFrp: 0 };
      existing.count++;
      existing.totalFrp += row.frp;
      existing.maxFrp = Math.max(existing.maxFrp, row.frp);
      dailyMap.set(row.date, existing);
    }

    // Sort by date and convert
    return Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, stats]) => ({
        date,
        count: stats.count,
        totalFrp: stats.totalFrp,
        avgFrp: stats.totalFrp / stats.count,
        maxFrp: stats.maxFrp,
      }));
  }

  /**
   * Compute statistics on current/filtered data
   * Cached after first computation
   */
  computeStats(data?: HotspotRow[]): HotspotStats {
    const source = data || this.data;

    if (this.stats && !data) {
      return this.stats;
    }

    const confidenceBreakdown: Record<ConfidenceLevel, number> = { low: 0, nominal: 0, high: 0 };
    const satelliteBreakdown: Record<string, number> = {};
    const daynightBreakdown = { D: 0, N: 0 };

    let minFrp = Infinity;
    let maxFrp = -Infinity;
    let sumFrp = 0;
    let minLat = Infinity, maxLat = -Infinity;
    let minLon = Infinity, maxLon = -Infinity;
    let minDate: string | null = null;
    let maxDate: string | null = null;

    for (const row of source) {
      confidenceBreakdown[row.confidence]++;
      satelliteBreakdown[row.satellite] = (satelliteBreakdown[row.satellite] || 0) + 1;
      daynightBreakdown[row.daynight]++;

      minFrp = Math.min(minFrp, row.frp);
      maxFrp = Math.max(maxFrp, row.frp);
      sumFrp += row.frp;

      minLat = Math.min(minLat, row.lat);
      maxLat = Math.max(maxLat, row.lat);
      minLon = Math.min(minLon, row.lon);
      maxLon = Math.max(maxLon, row.lon);

      if (!minDate || row.date < minDate) minDate = row.date;
      if (!maxDate || row.date > maxDate) maxDate = row.date;
    }

    const stats: HotspotStats = {
      totalCount: source.length,
      dateRange: minDate && maxDate ? { from: minDate, to: maxDate } : null,
      confidenceBreakdown,
      satelliteBreakdown,
      daynightBreakdown,
      frpStats: {
        min: minFrp === Infinity ? 0 : minFrp,
        max: maxFrp === -Infinity ? 0 : maxFrp,
        avg: source.length > 0 ? sumFrp / source.length : 0,
        sum: sumFrp,
      },
      bbox: source.length > 0 ? { minLat, maxLat, minLon, maxLon } : null,
    };

    if (!data) this.stats = stats;
    return stats;
  }

  /**
   * Clear all data and reset controller
   */
  clear(): void {
    this.data = [];
    this.stats = null;
    this.isParsed = false;
  }

  // ============ Private Helpers ============

  private buildHeaderIndex(headers: string[]): Map<string, number> {
    const index = new Map<string, number>();
    headers.forEach((h, i) => index.set(h, i));
    return index;
  }

  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        result.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  }

  private mapRow(values: string[], headerIndex: Map<string, number>): HotspotRow | null {
    const get = (key: string) => values[headerIndex.get(key) ?? -1]?.trim();

    const lat = parseFloat(get("latitude") || "");
    const lon = parseFloat(get("longitude") || "");
    const brightness = parseFloat(get("brightness") || "");
    const frp = parseFloat(get("frp") || "");

    if (isNaN(lat) || isNaN(lon) || isNaN(frp)) return null;

    const rawConfidence = get("confidence") || "";
    const confidence = CONFIDENCE_MAP[rawConfidence] ||
      (rawConfidence === "" ? "nominal" :
       parseFloat(rawConfidence) >= 80 ? "high" :
       parseFloat(rawConfidence) >= 30 ? "nominal" : "low");

    const satellite = SATELLITE_NORMALIZE[get("satellite") || ""] || get("satellite") || "UNKNOWN";
    const instrument = get("instrument") || "";
    const daynight = (get("daynight") as "D" | "N") || "D";

    // Parse date/time
    const acqDate = get("acq_date") || "";
    const acqTime = get("acq_time") || "";
    const time = acqTime.length === 4
      ? `${acqTime.slice(0, 2)}:${acqTime.slice(2, 4)}`
      : "00:00";

    return {
      lat,
      lon,
      brightness: isNaN(brightness) ? 0 : brightness,
      frp,
      confidence,
      date: acqDate,
      time,
      satellite,
      instrument,
      daynight,
    };
  }
}

/**
 * Factory function for creating controller instance
 */
export function createHotspotsController(): HotspotsController {
  return new HotspotsController();
}