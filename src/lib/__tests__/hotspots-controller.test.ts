/**
 * HotspotsController Tests
 * Comprehensive test suite for the HotspotsController data transformation layer
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { HotspotsController, createHotspotsController } from "../hotspots-controller";
import type { HotspotRow, HotspotFilters, PaginationParams, OutputFormat, BoundingBox } from "../types/hotspots";

// ============ Test Fixtures ============

const SAMPLE_CSV = `latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight
-33.1234,-60.5678,320.5,1.2,1.5,2024-01-15,1230,Terra,MODIS,high,6.1,290.1,15.5,D
-33.2345,-60.6789,315.2,1.1,1.4,2024-01-15,1345,Aqua,MODIS,nominal,6.1,288.5,8.2,N
-33.3456,-60.7890,330.8,1.3,1.6,2024-01-16,0120,Suomi NPP,VIIRS,low,6.1,295.3,22.1,D
-33.4567,-60.8901,325.0,1.2,1.5,2024-01-16,0235,NOAA-20,VIIRS,high,6.1,292.0,12.8,D
-33.5678,-60.9012,318.5,1.1,1.3,2024-01-17,1450,NOAA-21,VIIRS,nominal,6.1,289.7,5.5,N`;

const EMPTY_CSV = `latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight`;

const CSV_WITH_QUOTES = `latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight
-33.1234,-60.5678,320.5,1.2,1.5,2024-01-15,1230,"Terra",MODIS,"high",6.1,290.1,15.5,D
-33.2345,-60.6789,315.2,1.1,1.4,2024-01-15,1345,"Aqua",MODIS,"nominal",6.1,288.5,8.2,N`;

const CSV_MIXED_CONFIDENCE = `latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight
-33.1,-60.5,320,1,1,2024-01-15,1200,Terra,MODIS,high,6.1,290,15,D
-33.2,-60.6,315,1,1,2024-01-15,1300,Aqua,MODIS,80,6.1,288,8,N
-33.3,-60.7,330,1,1,2024-01-16,1400,Suomi NPP,VIIRS,30,6.1,295,22,D
-33.4,-60.8,325,1,1,2024-01-16,1500,NOAA-20,VIIRS,90,6.1,292,12,D
-33.5,-60.9,318,1,1,2024-01-17,1600,NOAA-21,VIIRS,0,6.1,289,5,N`;

const CSV_INVALID_ROWS = `latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight
-33.1234,-60.5678,320.5,1.2,1.5,2024-01-15,1230,Terra,MODIS,high,6.1,290.1,15.5,D
invalid,lat,315.2,1.1,1.4,2024-01-15,1345,Aqua,MODIS,nominal,6.1,288.5,8.2,N
-33.3456,-60.7890,330.8,1.3,1.6,2024-01-16,0120,Suomi NPP,VIIRS,low,6.1,295.3,22.1,D
,,-60.8901,325.0,1.2,1.5,2024-01-16,0235,NOAA-20,VIIRS,high,6.1,292.0,12.8,D
-33.5678,invalid,318.5,1.1,1.3,2024-01-17,1450,NOAA-21,VIIRS,nominal,6.1,289.7,5.5,N`;

const LARGE_CSV = (() => {
  const rows: string[] = [];
  for (let i = 0; i < 100; i++) {
    const lat = -33 - (i % 10) * 0.1;
    const lon = -60 - (i % 5) * 0.1;
    const date = `2024-01-${String((i % 28) + 1).padStart(2, "0")}`;
    const time = String((i % 24) * 100).padStart(4, "0");
    const sat = ["Terra", "Aqua", "Suomi NPP", "NOAA-20", "NOAA-21"][i % 5];
    const conf = ["high", "nominal", "low"][i % 3];
    const frp = 5 + (i % 30);
    rows.push(`${lat},${lon},320,1,1,${date},${time},${sat},VIIRS,${conf},6.1,290,${frp},D`);
  }
  return `latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight\n${rows.join("\n")}`;
})();

// ============ Helper Functions ============

function createController(): HotspotsController {
  return createHotspotsController();
}

function loadSampleData(controller: HotspotsController): HotspotRow[] {
  return controller.parseCSV(SAMPLE_CSV);
}

function loadLargeData(controller: HotspotsController): HotspotRow[] {
  return controller.parseCSV(LARGE_CSV);
}

// ============ Tests ============

describe("HotspotsController", () => {
  let controller: HotspotsController;

  beforeEach(() => {
    controller = createController();
  });

  afterEach(() => {
    controller.clear();
  });

  // ----- parseCSV Tests -----

  describe("parseCSV", () => {
    it("should parse valid CSV and return data array", () => {
      const data = controller.parseCSV(SAMPLE_CSV);
      expect(data).toHaveLength(5);
      expect(Array.isArray(data)).toBe(true);
    });

    it("should store parsed data internally", () => {
      controller.parseCSV(SAMPLE_CSV);
      const data = controller.getData();
      expect(data).toHaveLength(5);
    });

    it("should return empty array for empty CSV (headers only)", () => {
      const data = controller.parseCSV(EMPTY_CSV);
      expect(data).toHaveLength(0);
      expect(controller.getData()).toHaveLength(0);
    });

    it("should handle quoted fields", () => {
      const data = controller.parseCSV(CSV_WITH_QUOTES);
      expect(data).toHaveLength(2);
      expect(data[0].satellite).toBe("TERRA");
      expect(data[1].satellite).toBe("AQUA");
    });

    it("should map confidence values correctly (string)", () => {
      controller.parseCSV(SAMPLE_CSV);
      const data = controller.getData();
      expect(data[0].confidence).toBe("high");
      expect(data[1].confidence).toBe("nominal");
      expect(data[2].confidence).toBe("low");
    });

    it("should map numeric confidence values correctly per CONFIDENCE_MAP", () => {
      controller.parseCSV(CSV_MIXED_CONFIDENCE);
      const data = controller.getData();
      // CONFIDENCE_MAP: 30->"low", 80->"nominal", 90->"high", 0->"low"
      // Fallback: >=80 -> high, >=30 -> nominal, else low
      expect(data[0].confidence).toBe("high");   // "high" string -> "high"
      expect(data[1].confidence).toBe("nominal"); // 80 -> "nominal" (from map)
      expect(data[2].confidence).toBe("low");    // 30 -> "low" (from map)
      expect(data[3].confidence).toBe("high");   // 90 -> "high" (from map)
      expect(data[4].confidence).toBe("low");    // 0 -> "low" (from map)
    });

    it("should normalize satellite names", () => {
      controller.parseCSV(SAMPLE_CSV);
      const data = controller.getData();
      expect(data[0].satellite).toBe("TERRA");
      expect(data[1].satellite).toBe("AQUA");
      expect(data[2].satellite).toBe("SNPP");
      expect(data[3].satellite).toBe("NOAA20");
      expect(data[4].satellite).toBe("NOAA21");
    });

    it("should parse date and time correctly", () => {
      controller.parseCSV(SAMPLE_CSV);
      const data = controller.getData();
      expect(data[0].date).toBe("2024-01-15");
      expect(data[0].time).toBe("12:30");
      expect(data[2].time).toBe("01:20");
    });

    it("should skip invalid rows (NaN lat/lon/frp)", () => {
      const data = controller.parseCSV(CSV_INVALID_ROWS);
      // Valid rows: 1st and 3rd (others have invalid lat/lon)
      expect(data).toHaveLength(2);
    });

    it("should handle empty lines", () => {
      const csvWithEmptyLines = SAMPLE_CSV + "\n\n\n";
      const data = controller.parseCSV(csvWithEmptyLines);
      expect(data).toHaveLength(5);
    });

    it("should invalidate stats cache on new parse", () => {
      controller.parseCSV(SAMPLE_CSV);
      const stats1 = controller.computeStats();
      controller.parseCSV(LARGE_CSV);
      const stats2 = controller.computeStats();
      expect(stats2.totalCount).toBe(100);
      expect(stats1.totalCount).toBe(5);
    });

    it("should throw on transform before parsing", () => {
      expect(() => controller.transform({})).toThrow("No data loaded");
    });
  });

  // ----- parseCSVAsync Tests -----

  describe("parseCSVAsync", () => {
    it("should parse CSV asynchronously and yield batches", async () => {
      const batches: HotspotRow[][] = [];
      for await (const batch of controller.parseCSVAsync(SAMPLE_CSV, 2)) {
        batches.push(batch);
      }
      // Actual behavior: yields batches based on valid rows processed
      expect(batches.length).toBeGreaterThan(0);
      expect(batches.flat().length).toBe(5); // All 5 valid rows yielded
    });

    it("should NOT store parsed data internally (async parse is streaming only)", async () => {
      for await (const _batch of controller.parseCSVAsync(SAMPLE_CSV)) {
        // consume
      }
      // parseCSVAsync doesn't store data in this.data - it only yields
      expect(controller.getData()).toHaveLength(0);
    });

    it("should work with default batch size", async () => {
      const batches: HotspotRow[][] = [];
      for await (const batch of controller.parseCSVAsync(LARGE_CSV)) {
        batches.push(batch);
      }
      // Default batch size is 10000, so all 100 rows in one batch
      expect(batches.length).toBe(1);
      expect(batches[0].length).toBe(100);
    });

    it("should yield control to event loop between batches", async () => {
      let yielded = false;
      const originalSetTimeout = global.setTimeout;
      global.setTimeout = ((fn: any) => {
        yielded = true;
        return originalSetTimeout(fn, 0);
      }) as any;

      for await (const _batch of controller.parseCSVAsync(SAMPLE_CSV, 2)) {
        // consume
      }

      global.setTimeout = originalSetTimeout;
      expect(yielded).toBe(true);
    });
  });

  // ----- loadData Tests -----

  describe("loadData", () => {
    it("should load pre-parsed data directly", () => {
      const preParsed: HotspotRow[] = [
        {
          lat: -33.1,
          lon: -60.5,
          brightness: 320,
          frp: 15,
          confidence: "high",
          date: "2024-01-15",
          time: "12:00",
          satellite: "TERRA",
          instrument: "MODIS",
          daynight: "D",
        },
      ];

      controller.loadData(preParsed);
      expect(controller.getData()).toHaveLength(1);
      expect(controller.getData()[0].lat).toBe(-33.1);
    });

    it("should invalidate stats cache", () => {
      controller.parseCSV(SAMPLE_CSV);
      controller.computeStats(); // cache it
      controller.loadData([]);
      expect(controller.computeStats().totalCount).toBe(0);
    });

    it("should set isParsed to true", () => {
      controller.loadData([]);
      expect(() => controller.transform({})).not.toThrow();
    });

    it("should replace existing data", () => {
      controller.parseCSV(SAMPLE_CSV);
      expect(controller.getData()).toHaveLength(5);
      controller.loadData([]);
      expect(controller.getData()).toHaveLength(0);
    });
  });

  // ----- getData Tests -----

  describe("getData", () => {
    it("should return reference to internal data", () => {
      controller.parseCSV(SAMPLE_CSV);
      const data = controller.getData();
      // Note: getData returns the actual internal array reference
      // Modifying it will affect internal state
      expect(data).toBe(controller.getData());
    });
  });

  // ----- transform Tests -----

  describe("transform - basic formatting", () => {
    beforeEach(() => {
      loadSampleData(controller);
    });

    it("should return array format by default", () => {
      const result = controller.transform({});
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(5);
    });

    it("should return array format when explicitly requested", () => {
      const result = controller.transform({ format: "array" });
      expect(Array.isArray(result)).toBe(true);
    });

    it("should return GeoJSON format", () => {
      const result = controller.transform({ format: "geojson" }) as any;
      expect(result.type).toBe("FeatureCollection");
      expect(result.features).toHaveLength(5);
      expect(result.features[0].geometry.type).toBe("Point");
      expect(result.features[0].geometry.coordinates).toEqual([-60.5678, -33.1234]);
      expect(result.features[0].properties).toBeDefined();
    });

    it("should return grouped-by-date format", () => {
      const result = controller.transform({ format: "grouped-by-date" }) as Record<string, HotspotRow[]>;
      expect(Object.keys(result)).toContain("2024-01-15");
      expect(Object.keys(result)).toContain("2024-01-16");
      expect(Object.keys(result)).toContain("2024-01-17");
      expect(result["2024-01-15"]).toHaveLength(2);
      expect(result["2024-01-16"]).toHaveLength(2);
      expect(result["2024-01-17"]).toHaveLength(1);
    });

    it("should return grouped-by-confidence format", () => {
      const result = controller.transform({ format: "grouped-by-confidence" }) as any;
      expect(result.low).toHaveLength(1);
      expect(result.nominal).toHaveLength(2);
      expect(result.high).toHaveLength(2);
    });

    it("should return timeseries format", () => {
      const result = controller.transform({ format: "timeseries" }) as any[];
      expect(result).toHaveLength(3); // 3 unique dates
      expect(result[0]).toHaveProperty("date");
      expect(result[0]).toHaveProperty("count");
      expect(result[0]).toHaveProperty("totalFrp");
      expect(result[0]).toHaveProperty("avgFrp");
      expect(result[0]).toHaveProperty("maxFrp");
      // Check sorted by date
      expect(result[0].date).toBe("2024-01-15");
      expect(result[1].date).toBe("2024-01-16");
      expect(result[2].date).toBe("2024-01-17");
    });
  });

  describe("transform - filters", () => {
    beforeEach(() => {
      loadLargeData(controller); // 100 rows with varied data
    });

    it("should filter by dateFrom", () => {
      const result = controller.transform({
        filters: { dateFrom: "2024-01-15" },
        format: "array",
      }) as HotspotRow[];
      expect(result.every(r => r.date >= "2024-01-15")).toBe(true);
    });

    it("should filter by dateTo", () => {
      const result = controller.transform({
        filters: { dateTo: "2024-01-15" },
        format: "array",
      }) as HotspotRow[];
      expect(result.every(r => r.date <= "2024-01-15")).toBe(true);
    });

    it("should filter by date range", () => {
      const result = controller.transform({
        filters: { dateFrom: "2024-01-10", dateTo: "2024-01-20" },
        format: "array",
      }) as HotspotRow[];
      expect(result.every(r => r.date >= "2024-01-10" && r.date <= "2024-01-20")).toBe(true);
    });

    it("should filter by confidence", () => {
      const result = controller.transform({
        filters: { confidence: ["high"] },
        format: "array",
      }) as HotspotRow[];
      expect(result.every(r => r.confidence === "high")).toBe(true);
    });

    it("should filter by multiple confidence levels", () => {
      const result = controller.transform({
        filters: { confidence: ["high", "nominal"] },
        format: "array",
      }) as HotspotRow[];
      expect(result.every(r => r.confidence === "high" || r.confidence === "nominal")).toBe(true);
    });

    it("should filter by minFrp", () => {
      const result = controller.transform({
        filters: { minFrp: 20 },
        format: "array",
      }) as HotspotRow[];
      expect(result.every(r => r.frp >= 20)).toBe(true);
    });

    it("should filter by maxFrp", () => {
      const result = controller.transform({
        filters: { maxFrp: 10 },
        format: "array",
      }) as HotspotRow[];
      expect(result.every(r => r.frp <= 10)).toBe(true);
    });

    it("should filter by satellite", () => {
      const result = controller.transform({
        filters: { satellite: ["TERRA"] },
        format: "array",
      }) as HotspotRow[];
      expect(result.every(r => r.satellite === "TERRA")).toBe(true);
    });

    it("should filter by daynight", () => {
      const result = controller.transform({
        filters: { daynight: ["D"] },
        format: "array",
      }) as HotspotRow[];
      expect(result.every(r => r.daynight === "D")).toBe(true);
    });

    it("should filter by bbox", () => {
      const bbox: BoundingBox = { minLat: -33.5, maxLat: -33.0, minLon: -60.5, maxLon: -60.0 };
      const result = controller.transform({
        filters: { bbox },
        format: "array",
      }) as HotspotRow[];
      expect(result.every(r => r.lat >= -33.5 && r.lat <= -33.0 && r.lon >= -60.5 && r.lon <= -60.0)).toBe(true);
    });

    it("should combine multiple filters", () => {
      const result = controller.transform({
        filters: {
          dateFrom: "2024-01-10",
          confidence: ["high"],
          minFrp: 15,
        },
        format: "array",
      }) as HotspotRow[];
      expect(result.every(r => r.date >= "2024-01-10" && r.confidence === "high" && r.frp >= 15)).toBe(true);
    });

    it("should return empty array when no rows match filters", () => {
      const result = controller.transform({
        filters: { confidence: ["high"], minFrp: 1000 }, // impossible
        format: "array",
      }) as HotspotRow[];
      expect(result).toHaveLength(0);
    });
  });

  describe("transform - pagination", () => {
    beforeEach(() => {
      loadLargeData(controller); // 100 rows
    });

    it("should paginate results", () => {
      const result = controller.transform({
        pagination: { page: 1, pageSize: 10 },
        format: "array",
      }) as any;
      expect(result.data).toHaveLength(10);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.pageSize).toBe(10);
      expect(result.pagination.totalItems).toBe(100);
      expect(result.pagination.totalPages).toBe(10);
      expect(result.pagination.hasNext).toBe(true);
      expect(result.pagination.hasPrev).toBe(false);
    });

    it("should handle page 2", () => {
      const result = controller.transform({
        pagination: { page: 2, pageSize: 10 },
        format: "array",
      }) as any;
      expect(result.data).toHaveLength(10);
      expect(result.pagination.page).toBe(2);
      expect(result.pagination.hasPrev).toBe(true);
      expect(result.pagination.hasNext).toBe(true);
    });

    it("should handle last page", () => {
      const result = controller.transform({
        pagination: { page: 10, pageSize: 10 },
        format: "array",
      }) as any;
      expect(result.data).toHaveLength(10);
      expect(result.pagination.page).toBe(10);
      expect(result.pagination.hasNext).toBe(false);
      expect(result.pagination.hasPrev).toBe(true);
    });

    it("should clamp page to minimum 1", () => {
      const result = controller.transform({
        pagination: { page: 0, pageSize: 10 },
        format: "array",
      }) as any;
      expect(result.pagination.page).toBe(1);
    });

    it("should clamp pageSize to maximum 10000", () => {
      const result = controller.transform({
        pagination: { page: 1, pageSize: 20000 },
        format: "array",
      }) as any;
      expect(result.pagination.pageSize).toBe(10000);
    });

    it("should clamp pageSize to minimum 1", () => {
      const result = controller.transform({
        pagination: { page: 1, pageSize: 0 },
        format: "array",
      }) as any;
      expect(result.pagination.pageSize).toBe(1);
    });

    it("should work with filters + pagination", () => {
      const result = controller.transform({
        filters: { confidence: ["high"] },
        pagination: { page: 1, pageSize: 5 },
        format: "array",
      }) as any;
      expect(result.data.every((r: HotspotRow) => r.confidence === "high")).toBe(true);
      expect(result.data.length).toBeLessThanOrEqual(5);
    });
  });

  describe("transform - coordinate simplification", () => {
    beforeEach(() => {
      loadSampleData(controller);
    });

    it("should simplify coordinates when requested", () => {
      const result = controller.transform({
        simplifyCoords: true,
        coordPrecision: 2,
        format: "array",
      }) as HotspotRow[];
      expect(result[0].lat).toBe(-33.12);
      expect(result[0].lon).toBe(-60.57);
    });

    it("should use default precision of 4 when not specified", () => {
      const result = controller.transform({
        simplifyCoords: true,
        format: "array",
      }) as HotspotRow[];
      expect(result[0].lat).toBe(-33.1234);
      expect(result[0].lon).toBe(-60.5678);
    });

    it("should not modify original data", () => {
      controller.transform({ simplifyCoords: true, coordPrecision: 1, format: "array" });
      const original = controller.getData();
      expect(original[0].lat).toBe(-33.1234); // unchanged
    });
  });

  describe("transform - includeStats", () => {
    beforeEach(() => {
      loadSampleData(controller);
    });

    it("should include stats when requested (array format)", () => {
      const result = controller.transform({
        includeStats: true,
        format: "array",
      }) as any;
      expect(result).toHaveProperty("data");
      expect(result).toHaveProperty("stats");
      expect(result.stats.totalCount).toBe(5);
    });

    it("should include stats with pagination (stats computed on full filtered data)", () => {
      const result = controller.transform({
        includeStats: true,
        pagination: { page: 1, pageSize: 2 },
        format: "array",
      }) as any;
      expect(result).toHaveProperty("data");
      expect(result).toHaveProperty("stats");
      // data is the PaginatedResult with data and pagination
      expect(result.data).toHaveProperty("data");
      expect(result.data).toHaveProperty("pagination");
      expect(result.data.data).toHaveLength(2);
      // Stats are computed on filtered data (before pagination), so totalCount=5
      expect(result.stats.totalCount).toBe(5);
    });

    it("should include stats with filters", () => {
      const result = controller.transform({
        includeStats: true,
        filters: { confidence: ["high"] },
        format: "array",
      }) as any;
      expect(result.stats.totalCount).toBe(2); // 2 high confidence in sample
    });
  });

  // ----- computeStats Tests -----

  describe("computeStats", () => {
    beforeEach(() => {
      loadSampleData(controller);
    });

    it("should compute totalCount", () => {
      const stats = controller.computeStats();
      expect(stats.totalCount).toBe(5);
    });

    it("should compute dateRange", () => {
      const stats = controller.computeStats();
      expect(stats.dateRange).toEqual({ from: "2024-01-15", to: "2024-01-17" });
    });

    it("should compute confidenceBreakdown", () => {
      const stats = controller.computeStats();
      expect(stats.confidenceBreakdown).toEqual({ low: 1, nominal: 2, high: 2 });
    });

    it("should compute satelliteBreakdown", () => {
      const stats = controller.computeStats();
      expect(stats.satelliteBreakdown).toHaveProperty("TERRA");
      expect(stats.satelliteBreakdown).toHaveProperty("AQUA");
      expect(stats.satelliteBreakdown).toHaveProperty("SNPP");
      expect(stats.satelliteBreakdown).toHaveProperty("NOAA20");
      expect(stats.satelliteBreakdown).toHaveProperty("NOAA21");
    });

    it("should compute daynightBreakdown", () => {
      const stats = controller.computeStats();
      // Sample CSV: D, N, D, D, N = D:3, N:2
      expect(stats.daynightBreakdown).toEqual({ D: 3, N: 2 });
    });

    it("should compute frpStats", () => {
      const stats = controller.computeStats();
      expect(stats.frpStats.min).toBe(5.5);
      expect(stats.frpStats.max).toBe(22.1);
      expect(stats.frpStats.sum).toBeCloseTo(15.5 + 8.2 + 22.1 + 12.8 + 5.5);
      expect(stats.frpStats.avg).toBeCloseTo(stats.frpStats.sum / 5);
    });

    it("should compute bbox", () => {
      const stats = controller.computeStats();
      expect(stats.bbox).toEqual({
        minLat: -33.5678,
        maxLat: -33.1234,
        minLon: -60.9012,
        maxLon: -60.5678,
      });
    });

    it("should cache stats", () => {
      const stats1 = controller.computeStats();
      const stats2 = controller.computeStats();
      expect(stats1).toBe(stats2); // same object reference
    });

    it("should not use cache when data parameter provided", () => {
      controller.computeStats(); // cache
      const smallData = controller.getData().slice(0, 2);
      const stats = controller.computeStats(smallData);
      expect(stats.totalCount).toBe(2);
    });

    it("should return zeros for empty data", () => {
      controller.clear();
      controller.loadData([]);
      const stats = controller.computeStats();
      expect(stats.totalCount).toBe(0);
      expect(stats.dateRange).toBeNull();
      expect(stats.frpStats.min).toBe(0);
      expect(stats.frpStats.max).toBe(0);
      expect(stats.frpStats.avg).toBe(0);
      expect(stats.frpStats.sum).toBe(0);
      expect(stats.bbox).toBeNull();
    });
  });

  // ----- clear Tests -----

  describe("clear", () => {
    it("should clear all data and reset state", () => {
      controller.parseCSV(SAMPLE_CSV);
      expect(controller.getData()).toHaveLength(5);
      controller.clear();
      expect(controller.getData()).toHaveLength(0);
      expect(() => controller.transform({})).toThrow("No data loaded");
    });

    it("should clear stats cache", () => {
      controller.parseCSV(SAMPLE_CSV);
      controller.computeStats();
      controller.clear();
      controller.loadData([]);
      const stats = controller.computeStats();
      expect(stats.totalCount).toBe(0);
    });
  });

  // ----- Edge Cases -----

  describe("edge cases", () => {
    it("should handle CSV with missing optional fields", () => {
      const csv = `latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight
-33.1,-60.5,320,1,1,2024-01-15,1200,Terra,MODIS,high,6.1,290,15,D`;
      const data = controller.parseCSV(csv);
      expect(data).toHaveLength(1);
    });

    it("should handle unknown satellite gracefully (returns original name)", () => {
      const csv = `latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight
-33.1,-60.5,320,1,1,2024-01-15,1200,UnknownSat,MODIS,high,6.1,290,15,D`;
      controller.parseCSV(csv);
      expect(controller.getData()[0].satellite).toBe("UnknownSat");
    });

    it("should handle unknown confidence gracefully (defaults to low per fallback logic)", () => {
      const csv = `latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight
-33.1,-60.5,320,1,1,2024-01-15,1200,Terra,MODIS,unknown,6.1,290,15,D`;
      controller.parseCSV(csv);
      // "unknown" not in CONFIDENCE_MAP, parseFloat("unknown")=NaN, fallback: NaN>=80 false, NaN>=30 false -> "low"
      expect(controller.getData()[0].confidence).toBe("low");
    });

    it("should handle time parsing for various formats (only 4-digit times parsed)", () => {
      const csv = `latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight
-33.1,-60.5,320,1,1,2024-01-15,0,Terra,MODIS,high,6.1,290,15,D
-33.2,-60.6,315,1,1,2024-01-15,123,Terra,MODIS,high,6.1,290,15,D
-33.3,-60.7,330,1,1,2024-01-15,1234,Terra,MODIS,high,6.1,290,15,D
-33.4,-60.8,325,1,1,2024-01-15,12345,Terra,MODIS,high,6.1,290,15,D`;
      controller.parseCSV(csv);
      const data = controller.getData();
      expect(data[0].time).toBe("00:00"); // "0" length 1 -> "00:00"
      expect(data[1].time).toBe("00:00"); // "123" length 3 -> "00:00"
      expect(data[2].time).toBe("12:34"); // "1234" length 4 -> "12:34"
      expect(data[3].time).toBe("00:00"); // "12345" length 5 -> "00:00"
    });

    it("should handle CSV with trailing commas (extra column skipped)", () => {
      const csv = `latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight
-33.1,-60.5,320,1,1,2024-01-15,1200,Terra,MODIS,high,6.1,290,15,D,`;
      controller.parseCSV(csv);
      // Trailing comma creates 15 values vs 14 headers -> row skipped
      expect(controller.getData()).toHaveLength(0);
    });
  });

  // ----- Performance / Large Data -----

  describe("performance with large datasets", () => {
    it("should handle 1000 rows efficiently", () => {
      const rows: string[] = [];
      for (let i = 0; i < 1000; i++) {
        rows.push(`-33.1,-60.5,320,1,1,2024-01-15,1200,Terra,MODIS,high,6.1,290,15,D`);
      }
      const csv = `latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight\n${rows.join("\n")}`;

      const start = performance.now();
      const data = controller.parseCSV(csv);
      const duration = performance.now() - start;

      expect(data).toHaveLength(1000);
      expect(duration).toBeLessThan(100); // should be fast
    });

    it("should parse async without blocking", async () => {
      const rows: string[] = [];
      for (let i = 0; i < 500; i++) {
        rows.push(`-33.1,-60.5,320,1,1,2024-01-15,1200,Terra,MODIS,high,6.1,290,15,D`);
      }
      const csv = `latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight\n${rows.join("\n")}`;

      let batchCount = 0;
      for await (const _batch of controller.parseCSVAsync(csv, 100)) {
        batchCount++;
      }
      expect(batchCount).toBe(5);
      // parseCSVAsync doesn't store in this.data
      expect(controller.getData()).toHaveLength(0);
    });
  });
});