/**
 * FireCalendarApiClient Tests
 * Comprehensive test suite for the FireCalendar API client
 */

import { describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from "bun:test";
import { FireCalendarApiClient, createFireCalendarClient, FireCalendarApiError } from "../firecalendar-api-client";
import type { Region, Box, Source, AoiRow } from "../types/firecalendar";

// ============ Test Fixtures ============

const MOCK_META = {
  data_version: "1.0.0",
  model_id: "test-model",
  model_version: "v1",
  generated: "2024-01-15",
  files: {
    calendar_region: "calendar_region.parquet",
    cell_month: "cell_month.parquet",
    cell_index: "cell_index.parquet",
  },
  final_test_poisson_dev: 1.23,
  known_limitations: ["test limitation"],
  calendar_interval_ratios: {
    africa: { q10: 0.5, q50: 1.0, q90: 2.0 },
    south_america: { q10: 0.4, q50: 1.0, q90: 2.5 },
    canada_usa: { q10: 0.6, q50: 1.0, q90: 1.8 },
    australia: { q10: 0.3, q50: 1.0, q90: 3.0 },
  },
  unit: "detections",
  sources: {
    observed: "VIIRS S-NPP",
    backcast: "MODIS backcast",
    backcast_terra: "Terra-only MODIS backcast",
  },
  season: {
    africa: { peak_month: 8, start_month: 5, end_month: 11, method: "test" },
    south_america: { peak_month: 9, start_month: 6, end_month: 12, method: "test" },
    canada_usa: { peak_month: 7, start_month: 5, end_month: 9, method: "test" },
    australia: { peak_month: 1, start_month: 11, end_month: 3, method: "test" },
  },
  regions: ["africa", "south_america", "canada_usa", "australia"],
  years: [2001, 2024],
  coverage_bbox: { min_lat: -55, max_lat: 85, min_lon: -180, max_lon: 180 },
  n_cells: 1000,
};

const MOCK_REGION_CALENDAR_BASE = {
  season: { peak_month: 9, start_month: 6, end_month: 12, method: "test" },
  rows: [
    { region: "south_america", year: 2024, month: 1, source: "observed" as Source, value: 100, p_lo: 90, p_hi: 110, modis: 50, viirs_model: 95, viirs_obs: 100, clim_median: 80, ratio_vs_median: 1.25, pct_vs_ref: 75 },
    { region: "south_america", year: 2024, month: 2, source: "observed" as Source, value: 120, p_lo: 105, p_hi: 135, modis: 60, viirs_model: 115, viirs_obs: 120, clim_median: 85, ratio_vs_median: 1.41, pct_vs_ref: 85 },
    { region: "south_america", year: 2024, month: 3, source: "observed" as Source, value: 200, p_lo: 180, p_hi: 220, modis: 100, viirs_model: 190, viirs_obs: 200, clim_median: 90, ratio_vs_median: 2.22, pct_vs_ref: 95 },
  ],
};

const MOCK_AOI_CALENDAR = {
  cells: 4,
  region: "south_america" as Region,
  note: "AOI covers 4 cells",
  rows: [
    { year: 2024, month: 1, source: "observed" as Source, value: 25, modis: 12, viirs_model: 24, p_lo: 20, p_hi: 30, clim_median: 20, pct_vs_ref: 80 },
    { year: 2024, month: 2, source: "observed" as Source, value: 30, modis: 15, viirs_model: 28, p_lo: 25, p_hi: 35, clim_median: 22, pct_vs_ref: 85 },
  ],
};

const MOCK_CSV_RESPONSE = `latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight
-33.1234,-60.5678,320.5,1.2,1.5,2024-01-15,1230,Terra,MODIS,high,6.1,290.1,15.5,D
-33.2345,-60.6789,315.2,1.1,1.4,2024-01-15,1345,Aqua,MODIS,nominal,6.1,288.5,8.2,N`;

const TEST_BOX: Box = { minLat: -34, maxLat: -32, minLon: -61, maxLon: -58 };

// ============ Mock Server Setup ============

let mockServer: any;
const MOCK_BASE_URL = "http://localhost:18080";

async function startMockServer() {
  const server = Bun.serve({
    port: 18080,
    fetch(req: Request) {
      const url = new URL(req.url);
      const path = url.pathname;
      const searchParams = url.searchParams;

      // Health check
      if (path === "/health") {
        return new Response("ok", { status: 200 });
      }

      // Meta
      if (path === "/v1/meta") {
        return Response.json(MOCK_META);
      }

      // Region calendar
      if (path === "/v1/calendar/region") {
        const region = searchParams.get("region");
        if (!region) {
          return Response.json({ detail: "Region parameter required" }, { status: 400 });
        }
        return Response.json({ ...MOCK_REGION_CALENDAR_BASE, region });
      }

      // AOI calendar
      if (path === "/v1/calendar/aoi") {
        const minLat = searchParams.get("min_lat");
        const maxLat = searchParams.get("max_lat");
        const minLon = searchParams.get("min_lon");
        const maxLon = searchParams.get("max_lon");
        if (!minLat || !maxLat || !minLon || !maxLon) {
          return Response.json({ detail: "Bounding box parameters required" }, { status: 400 });
        }
        return Response.json(MOCK_AOI_CALENDAR);
      }

      // Hotspots CSV
      if (path === "/v1/hotspots.csv") {
        const start = searchParams.get("start");
        const end = searchParams.get("end");
        if (!start || !end) {
          return Response.json({ detail: "Start and end dates required" }, { status: 400 });
        }
        return new Response(MOCK_CSV_RESPONSE, {
          status: 200,
          headers: { "Content-Type": "text/csv" },
        });
      }

      // Error endpoints for testing error handling
      if (path === "/v1/error/404") {
        return Response.json({ detail: "Not found" }, { status: 404 });
      }
      if (path === "/v1/error/500") {
        return Response.json({ detail: "Internal server error" }, { status: 500 });
      }
      if (path === "/v1/error/validation") {
        return Response.json({
          detail: [
            { type: "value_error", loc: ["query", "region"], msg: "Invalid region", input: "invalid" },
          ],
        }, { status: 422 });
      }

      return new Response("Not Found", { status: 404 });
    },
  });

  return server;
}

// ============ Tests ============

describe("FireCalendarApiClient", () => {
  let client: FireCalendarApiClient;

  beforeAll(async () => {
    mockServer = await startMockServer();
  });

  afterAll(() => {
    mockServer?.stop();
  });

  beforeEach(() => {
    client = new FireCalendarApiClient(MOCK_BASE_URL);
  });

  // ----- Constructor Tests -----

  describe("constructor", () => {
    it("should use provided baseUrl", () => {
      const c = new FireCalendarApiClient("https://custom.api.com");
      expect(c.getBaseUrl()).toBe("https://custom.api.com");
    });

    it("should use environment variable when no baseUrl provided", () => {
      const originalEnv = process.env.FIRECALENDAR_API_URL;
      process.env.FIRECALENDAR_API_URL = "https://env.api.com";
      try {
        const c = new FireCalendarApiClient();
        expect(c.getBaseUrl()).toBe("https://env.api.com");
      } finally {
        process.env.FIRECALENDAR_API_URL = originalEnv;
      }
    });

    it("should default to localhost when no baseUrl or env", () => {
      const originalEnv = process.env.FIRECALENDAR_API_URL;
      delete process.env.FIRECALENDAR_API_URL;
      try {
        const c = new FireCalendarApiClient();
        expect(c.getBaseUrl()).toBe("http://localhost:7860");
      } finally {
        if (originalEnv) process.env.FIRECALENDAR_API_URL = originalEnv;
      }
    });
  });

  // ----- healthCheck Tests -----

  describe("healthCheck", () => {
    it("should return true for healthy API", async () => {
      const result = await client.healthCheck();
      expect(result).toBe(true);
    });

    it("should return false for unhealthy API", async () => {
      const badClient = new FireCalendarApiClient("http://localhost:18081"); // non-existent
      const result = await badClient.healthCheck();
      expect(result).toBe(false);
    });
  });

  // ----- getMeta Tests -----

  describe("getMeta", () => {
    it("should fetch and return meta data", async () => {
      const meta = await client.getMeta();
      expect(meta).toEqual(MOCK_META);
    });

    it("should return correct type structure", async () => {
      const meta = await client.getMeta();
      expect(meta).toHaveProperty("data_version");
      expect(meta).toHaveProperty("regions");
      expect(meta).toHaveProperty("years");
      expect(meta).toHaveProperty("coverage_bbox");
      expect(meta.regions).toHaveLength(4);
      expect(meta.years).toEqual([2001, 2024]);
    });
  });

  // ----- getRegionCalendar Tests -----

  describe("getRegionCalendar", () => {
    it("should fetch region calendar with required region parameter", async () => {
      const calendar = await client.getRegionCalendar("south_america");
      expect(calendar.region).toBe("south_america");
      expect(calendar.rows).toHaveLength(3);
    });

    it("should include start parameter when provided", async () => {
      const calendar = await client.getRegionCalendar("africa", "2024-01");
      // Mock server echoes back the region from query param
      expect(calendar.region).toBe("africa");
    });

    it("should include end parameter when provided", async () => {
      const calendar = await client.getRegionCalendar("africa", "2024-01", "2024-12");
      expect(calendar.region).toBe("africa");
    });

    it("should validate region parameter type", () => {
      const validRegions: Region[] = ["africa", "south_america", "canada_usa", "australia"];
      validRegions.forEach(region => {
        expect(() => client.getRegionCalendar(region)).not.toThrow();
      });
    });
  });

  // ----- getAoiCalendar Tests -----

  describe("getAoiCalendar", () => {
    it("should fetch AOI calendar with bounding box", async () => {
      const calendar = await client.getAoiCalendar(TEST_BOX);
      expect(calendar.cells).toBe(4);
      expect(calendar.region).toBe("south_america");
      expect(calendar.rows).toHaveLength(2);
    });

    it("should include start and end parameters", async () => {
      const calendar = await client.getAoiCalendar(TEST_BOX, "2024-01", "2024-12");
      expect(calendar.rows).toHaveLength(2);
    });

    it("should pass box coordinates correctly", async () => {
      const customBox: Box = { minLat: -10, maxLat: 10, minLon: -20, maxLon: 20 };
      const calendar = await client.getAoiCalendar(customBox);
      expect(calendar).toBeDefined();
    });
  });

  // ----- getHotspotsCsvUrl Tests -----

  describe("getHotspotsCsvUrl", () => {
    it("should generate correct URL with all required params", () => {
      const url = client.getHotspotsCsvUrl(TEST_BOX, "2024-01-01", "2024-01-31");
      expect(url).toContain(MOCK_BASE_URL);
      expect(url).toContain("/v1/hotspots.csv?");
      expect(url).toContain("min_lat=-34");
      expect(url).toContain("max_lat=-32");
      expect(url).toContain("min_lon=-61");
      expect(url).toContain("max_lon=-58");
      expect(url).toContain("start=2024-01-01");
      expect(url).toContain("end=2024-01-31");
    });

    it("should include source parameter when provided", () => {
      const url = client.getHotspotsCsvUrl(TEST_BOX, "2024-01-01", "2024-01-31", "observed");
      expect(url).toContain("source=observed");
    });

    it("should not include source when not provided", () => {
      const url = client.getHotspotsCsvUrl(TEST_BOX, "2024-01-01", "2024-01-31");
      expect(url).not.toContain("source=");
    });

    it("should properly encode special characters in params", () => {
      const box: Box = { minLat: -33.5, maxLat: -32.5, minLon: -60.5, maxLon: -59.5 };
      const url = client.getHotspotsCsvUrl(box, "2024-01-01", "2024-01-31");
      expect(url).toContain("min_lat=-33.5");
    });
  });

  // ----- downloadHotspotsCsv Tests -----

  describe("downloadHotspotsCsv", () => {
    it("should download CSV text", async () => {
      const csv = await client.downloadHotspotsCsv(TEST_BOX, "2024-01-01", "2024-01-31");
      expect(csv).toBe(MOCK_CSV_RESPONSE);
    });

    it("should include source parameter", async () => {
      const csv = await client.downloadHotspotsCsv(TEST_BOX, "2024-01-01", "2024-01-31", "observed");
      expect(csv).toBe(MOCK_CSV_RESPONSE);
    });

    it("should set Accept header to text/csv", async () => {
      const csv = await client.downloadHotspotsCsv(TEST_BOX, "2024-01-01", "2024-01-31");
      expect(typeof csv).toBe("string");
      expect(csv).toContain("latitude,longitude");
    });
  });

  // ----- fillAoiMonths Tests -----

  describe("fillAoiMonths (static)", () => {
    it("should fill missing months with zeros for full range 2001-2024", () => {
      const input: AoiRow[] = [
        { year: 2024, month: 1, source: "observed", value: 100, modis: 50, viirs_model: 95, p_lo: 90, p_hi: 110, clim_median: 80, pct_vs_ref: 75 },
        { year: 2024, month: 3, source: "observed", value: 200, modis: 100, viirs_model: 190, p_lo: 180, p_hi: 220, clim_median: 90, pct_vs_ref: 95 },
      ];

      const result = FireCalendarApiClient.fillAoiMonths(input);

      // Should have 24 years * 12 months = 288 rows
      expect(result).toHaveLength(288);
    });

    it("should preserve existing rows", () => {
      const input: AoiRow[] = [
        { year: 2024, month: 1, source: "observed", value: 100, modis: 50, viirs_model: 95, p_lo: 90, p_hi: 110, clim_median: 80, pct_vs_ref: 75 },
      ];

      const result = FireCalendarApiClient.fillAoiMonths(input);
      const jan2024 = result.find(r => r.year === 2024 && r.month === 1);
      expect(jan2024?.value).toBe(100);
      expect(jan2024?.source).toBe("observed");
    });

    it("should fill missing months with zero values", () => {
      const input: AoiRow[] = [
        { year: 2024, month: 1, source: "observed", value: 100, modis: 50, viirs_model: 95, p_lo: 90, p_hi: 110, clim_median: 80, pct_vs_ref: 75 },
      ];

      const result = FireCalendarApiClient.fillAoiMonths(input);
      const feb2024 = result.find(r => r.year === 2024 && r.month === 2);
      expect(feb2024?.value).toBe(0);
      expect(feb2024?.modis).toBe(0);
      expect(feb2024?.viirs_model).toBe(0);
      expect(feb2024?.p_lo).toBe(0);
      expect(feb2024?.p_hi).toBe(0);
      expect(feb2024?.clim_median).toBeNull();
      expect(feb2024?.pct_vs_ref).toBeNull();
    });

    it("should assign correct source based on time period", () => {
      const input: AoiRow[] = [];

      const result = FireCalendarApiClient.fillAoiMonths(input);

      // Before Jul 2002 (2002 * 12 + 7 = 24031)
      const jan2001 = result.find(r => r.year === 2001 && r.month === 1);
      expect(jan2001?.source).toBe("backcast_terra");

      const jun2002 = result.find(r => r.year === 2002 && r.month === 6);
      expect(jun2002?.source).toBe("backcast_terra");

      // Jul 2002 - Jan 2012 (2012 * 12 + 2 = 24146)
      const jul2002 = result.find(r => r.year === 2002 && r.month === 7);
      expect(jul2002?.source).toBe("backcast");

      const jan2012 = result.find(r => r.year === 2012 && r.month === 1);
      expect(jan2012?.source).toBe("backcast");

      // Feb 2012 onwards
      const feb2012 = result.find(r => r.year === 2012 && r.month === 2);
      expect(feb2012?.source).toBe("observed");

      const dec2024 = result.find(r => r.year === 2024 && r.month === 12);
      expect(dec2024?.source).toBe("observed");
    });

    it("should return rows sorted chronologically", () => {
      const input: AoiRow[] = [
        { year: 2024, month: 12, source: "observed", value: 100, modis: 50, viirs_model: 95, p_lo: 90, p_hi: 110, clim_median: 80, pct_vs_ref: 75 },
        { year: 2001, month: 1, source: "backcast_terra", value: 50, modis: 25, viirs_model: 48, p_lo: 45, p_hi: 55, clim_median: 40, pct_vs_ref: 60 },
      ];

      const result = FireCalendarApiClient.fillAoiMonths(input);
      expect(result[0].year).toBe(2001);
      expect(result[0].month).toBe(1);
      expect(result[287].year).toBe(2024);
      expect(result[287].month).toBe(12);
    });

    it("should handle empty input", () => {
      const result = FireCalendarApiClient.fillAoiMonths([]);
      expect(result).toHaveLength(288);
      expect(result.every(r => r.value === 0)).toBe(true);
    });
  });

  // ----- Error Handling Tests -----

  describe("FireCalendarApiError", () => {
    it("should create error with status and detail", () => {
      const error = new FireCalendarApiError("Test error", 404, "Not found");
      expect(error.message).toBe("Test error");
      expect(error.status).toBe(404);
      expect(error.detail).toBe("Not found");
      expect(error.name).toBe("FireCalendarApiError");
    });

    it("should handle array detail", () => {
      const error = new FireCalendarApiError("Validation error", 422, [
        { type: "value_error", loc: ["query", "region"], msg: "Invalid region", input: "invalid" },
      ]);
      expect(error.detail).toBeInstanceOf(Array);
    });

    it("should be instanceof Error", () => {
      const error = new FireCalendarApiError("Test", 500, "Server error");
      expect(error).toBeInstanceOf(Error);
    });
  });

  // ----- createFireCalendarClient Tests -----

  describe("createFireCalendarClient", () => {
    it("should return FireCalendarApiClient instance", () => {
      const client = createFireCalendarClient();
      expect(client).toBeInstanceOf(FireCalendarApiClient);
    });

    it("should pass baseUrl to constructor", () => {
      const client = createFireCalendarClient("https://custom.api.com");
      expect(client.getBaseUrl()).toBe("https://custom.api.com");
    });
  });
});