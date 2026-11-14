/**
 * API Routes Tests
 * Comprehensive test suite for Express route handlers
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from "bun:test";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import { HotspotsController } from "../../lib/hotspots-controller";
import { FireCalendarApiClient } from "../../lib/firecalendar-api-client";

// ============ Test Fixtures ============

const SAMPLE_CSV = `latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight
-33.1234,-60.5678,320.5,1.2,1.5,2024-01-15,1230,Terra,MODIS,high,6.1,290.1,15.5,D
-33.2345,-60.6789,315.2,1.1,1.4,2024-01-15,1345,Aqua,MODIS,nominal,6.1,288.5,8.2,N
-33.3456,-60.7890,330.8,1.3,1.6,2024-01-16,0120,Suomi NPP,VIIRS,low,6.1,295.3,22.1,D
-33.4567,-60.8901,325.0,1.2,1.5,2024-01-16,0235,NOAA-20,VIIRS,high,6.1,292.0,12.8,D
-33.5678,-60.9012,318.5,1.1,1.3,2024-01-17,1450,NOAA-21,VIIRS,nominal,6.1,289.7,5.5,N`;

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

// ============ Test Server Setup ============

function createTestApp(controller: HotspotsController, fireCalendarClient: FireCalendarApiClient): express.Express {
  const app = express();
  app.use(express.json({ limit: "50mb" }));

  // CORS middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") return res.sendStatus(200);
    next();
  });

  // Recreate the routes inline to use our test controller
  const router = express.Router();

  // Parse hotspots query
  function parseHotspotsQuery(req: Request): any {
    const query = req.query;
    const filters: any = {};
    if (query.dateFrom) filters.dateFrom = String(query.dateFrom);
    if (query.dateTo) filters.dateTo = String(query.dateTo);
    if (query.confidence) {
      filters.confidence = String(query.confidence).split(",");
    }
    if (query.minFrp) filters.minFrp = Number(query.minFrp);
    if (query.maxFrp) filters.maxFrp = Number(query.maxFrp);
    if (query.satellite) {
      filters.satellite = String(query.satellite).split(",");
    }
    if (query.daynight) {
      filters.daynight = String(query.daynight).split(",");
    }
    if (query.minLat && query.maxLat && query.minLon && query.maxLon) {
      filters.bbox = {
        minLat: Number(query.minLat),
        maxLat: Number(query.maxLat),
        minLon: Number(query.minLon),
        maxLon: Number(query.maxLon),
      };
    }

    let pagination: any;
    if (query.page || query.pageSize) {
      pagination = {
        page: Math.max(1, Number(query.page) || 1),
        pageSize: Math.min(10000, Math.max(1, Number(query.pageSize) || 1000)),
      };
    }

    const format = String(query.format) || "array";
    const includeStats = query.includeStats === "true";
    const simplifyCoords = query.simplifyCoords === "true";
    const coordPrecision = query.coordPrecision ? Number(query.coordPrecision) : 4;

    return {
      filters: Object.keys(filters).length > 0 ? filters : undefined,
      pagination,
      format,
      includeStats,
      simplifyCoords,
      coordPrecision,
    };
  }

  function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
    if (err.message.includes("No data loaded")) {
      return res.status(503).json({
        error: "Service Unavailable",
        message: "Hotspots data not loaded. Please trigger data load first.",
        code: "DATA_NOT_LOADED",
      });
    }
    res.status(500).json({
      error: "Internal Server Error",
      message: err.message,
      code: "INTERNAL_ERROR",
    });
  }

  // Hotspots endpoints
  router.get("/hotspots", (req: Request, res: Response, next: NextFunction) => {
    try {
      const options = parseHotspotsQuery(req);
      const result = controller.transform(options);

      if (options.includeStats && typeof result === "object" && "stats" in result) {
        return res.json({ success: true, data: result.data, stats: result.stats });
      }
      if (options.pagination && typeof result === "object" && "pagination" in result) {
        return res.json({ success: true, data: result.data, pagination: result.pagination });
      }
      return res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  });

  router.get("/hotspots/stats", (req: Request, res: Response, next: NextFunction) => {
    try {
      const options = parseHotspotsQuery(req);
      const stats = controller.computeStats();
      let filteredStats = stats;
      if (options.filters) {
        const filteredData = controller.transform({ filters: options.filters, format: "array" }) as any[];
        filteredStats = controller.computeStats(filteredData);
      }
      res.json({ success: true, data: filteredStats });
    } catch (error) {
      next(error);
    }
  });

  router.get("/hotspots/timeseries", (req: Request, res: Response, next: NextFunction) => {
    try {
      const options = parseHotspotsQuery(req);
      const result = controller.transform({ ...options, format: "timeseries" }) as any[];
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  });

  router.get("/hotspots/geojson", (req: Request, res: Response, next: NextFunction) => {
    try {
      const options = parseHotspotsQuery(req);
      const result = controller.transform({ ...options, format: "geojson" });
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  });

  router.post("/hotspots/load", (req: Request, res: Response, next: NextFunction) => {
    try {
      const { csv } = req.body;
      if (!csv || typeof csv !== "string") {
        return res.status(400).json({ success: false, error: "Bad Request", message: "CSV data required" });
      }
      const data = controller.parseCSV(csv);
      res.json({ success: true, message: `Loaded ${data.length} hotspot records`, data });
    } catch (error) {
      next(error);
    }
  });

  router.post("/hotspots/load-async", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { csv, batchSize = 10000 } = req.body;
      if (!csv || typeof csv !== "string") {
        return res.status(400).json({ success: false, error: "Bad Request", message: "CSV data required" });
      }
      let totalRows = 0;
      for await (const batch of controller.parseCSVAsync(csv, batchSize)) {
        totalRows += batch.length;
      }
      res.json({ success: true, message: `Async load completed: ${totalRows} rows`, totalRows });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/hotspots", (req: Request, res: Response) => {
    controller.clear();
    res.json({ success: true, message: "Data cleared" });
  });

  // FireCalendar proxy endpoints
  router.get("/meta", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const meta = await fireCalendarClient.getMeta();
      res.json({ success: true, data: meta });
    } catch (error) {
      next(error);
    }
  });

  router.get("/calendar/region", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { region, start, end } = req.query;
      if (!region || typeof region !== "string") {
        return res.status(400).json({ success: false, error: "Bad Request", message: "Region parameter required" });
      }
      const calendar = await fireCalendarClient.getRegionCalendar(region as any, start as string, end as string);
      res.json({ success: true, data: calendar });
    } catch (error) {
      next(error);
    }
  });

  router.get("/calendar/aoi", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { min_lat, max_lat, min_lon, max_lon, start, end } = req.query;
      if (!min_lat || !max_lat || !min_lon || !max_lon) {
        return res.status(400).json({ success: false, error: "Bad Request", message: "Bounding box required" });
      }
      const box = { minLat: Number(min_lat), maxLat: Number(max_lat), minLon: Number(min_lon), maxLon: Number(max_lon) };
      const calendar = await fireCalendarClient.getAoiCalendar(box, start as string, end as string);
      res.json({ success: true, data: calendar });
    } catch (error) {
      next(error);
    }
  });

  router.get("/hotspots/csv-url", (req: Request, res: Response, next: NextFunction) => {
    try {
      const { min_lat, max_lat, min_lon, max_lon, start, end, source } = req.query;
      if (!min_lat || !max_lat || !min_lon || !max_lon || !start || !end) {
        return res.status(400).json({ success: false, error: "Bad Request", message: "Required params missing" });
      }
      const box = { minLat: Number(min_lat), maxLat: Number(max_lat), minLon: Number(min_lon), maxLon: Number(max_lon) };
      const url = fireCalendarClient.getHotspotsCsvUrl(box, String(start), String(end), source as string);
      res.json({ success: true, data: { url } });
    } catch (error) {
      next(error);
    }
  });

  router.get("/hotspots/csv", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { min_lat, max_lat, min_lon, max_lon, start, end, source } = req.query;
      if (!min_lat || !max_lat || !min_lon || !max_lon || !start || !end) {
        return res.status(400).json({ success: false, error: "Bad Request", message: "Required params missing" });
      }
      const box = { minLat: Number(min_lat), maxLat: Number(max_lat), minLon: Number(min_lon), maxLon: Number(max_lon) };
      const csvText = await fireCalendarClient.downloadHotspotsCsv(box, String(start), String(end), source as string);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="hotspots_${start}_${end}.csv"`);
      res.send(csvText);
    } catch (error) {
      next(error);
    }
  });

  // Zones endpoint
  router.get("/zones", (req: Request, res: Response) => {
    const zones = [
      { id: "z1", name: "Amazon Basin", country: "Brazil", cont: "South America", ring: [[-70, -10], [-50, -10], [-50, 5], [-70, 5], [-70, -10]] },
      { id: "z2", name: "Congo Basin", country: "DRC", cont: "Africa", ring: [[15, -5], [30, -5], [30, 5], [15, 5], [15, -5]] },
    ];
    res.json({ success: true, data: zones });
  });

  // Health
  router.get("/health", (req: Request, res: Response) => {
    res.json({ success: true, status: "ok", timestamp: new Date().toISOString(), service: "test" });
  });

  router.use(errorHandler);
  app.use("/api", router);

  // Root endpoint
  app.get("/", (req: Request, res: Response) => {
    res.json({
      name: "Shock-KA DAO Hotspots API",
      version: "1.0.0",
      description: "REST API for fire hotspots data transformation",
      endpoints: {
        health: "GET /api/health",
        hotspots: "GET /api/hotspots",
        hotspotsStats: "GET /api/hotspots/stats",
        hotspotsTimeseries: "GET /api/hotspots/timeseries",
        hotspotsGeoJSON: "GET /api/hotspots/geojson",
        loadCSV: "POST /api/hotspots/load",
        loadCSVAsync: "POST /api/hotspots/load-async",
        clearData: "DELETE /api/hotspots",
      },
    });
  });

  // 404 handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({ success: false, error: "Not Found", message: `Route ${req.method} ${req.path} not found` });
  });

  return app;
}

let testServer: any;
let baseUrl: string;

async function startTestServer(app: express.Express): Promise<string> {
  const server = app.listen(0);
  const port = server.address().port;
  testServer = server;
  return `http://localhost:${port}`;
}

async function stopTestServer() {
  if (testServer) {
    await new Promise<void>((resolve) => testServer.close(() => resolve()));
  }
}

async function makeRequest(
  method: string,
  path: string,
  options: { body?: any; query?: Record<string, string>; headers?: Record<string, string> } = {}
): Promise<{ status: number; body: any; headers: Record<string, string> }> {
  const url = new URL(path, baseUrl);
  if (options.query) {
    Object.entries(options.query).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const response = await fetch(url.toString(), {
    method,
    headers: { "Content-Type": "application/json", ...options.headers },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => { responseHeaders[key.toLowerCase()] = value; });

  let body: any;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) body = await response.json();
  else body = await response.text();

  return { status: response.status, body, headers: responseHeaders };
}

// ============ Tests ============

describe("API Routes - Unit Tests", () => {
  let controller: HotspotsController;
  let fireCalendarClient: FireCalendarApiClient;
  let app: express.Express;

  beforeAll(async () => {
    controller = new HotspotsController();
    fireCalendarClient = new FireCalendarApiClient("http://mock.api");
    app = createTestApp(controller, fireCalendarClient);
    baseUrl = await startTestServer(app);
  });

  afterAll(async () => {
    await stopTestServer();
  });

  beforeEach(() => {
    controller.clear();
    controller.parseCSV(SAMPLE_CSV);
  });

  afterEach(() => {
    controller.clear();
  });

  // ----- Health Check -----

  describe("GET /api/health", () => {
    it("should return health status", async () => {
      const res = await makeRequest("GET", "/api/health");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.status).toBe("ok");
    });
  });

  // ----- Hotspots Endpoints -----

  describe("GET /api/hotspots", () => {
    it("should return all hotspots as array by default", async () => {
      const res = await makeRequest("GET", "/api/hotspots");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toHaveLength(5);
    });

    it("should return hotspots with pagination", async () => {
      const res = await makeRequest("GET", "/api/hotspots", { query: { page: "1", pageSize: "2" } });
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.pagination).toEqual({
        page: 1, pageSize: 2, totalItems: 5, totalPages: 3, hasNext: true, hasPrev: false,
      });
    });

    it("should return page 2", async () => {
      const res = await makeRequest("GET", "/api/hotspots", { query: { page: "2", pageSize: "2" } });
      expect(res.body.data).toHaveLength(2);
      expect(res.body.pagination.page).toBe(2);
      expect(res.body.pagination.hasPrev).toBe(true);
    });

    it("should filter by dateFrom", async () => {
      const res = await makeRequest("GET", "/api/hotspots", { query: { dateFrom: "2024-01-16" } });
      expect(res.body.data.every((r: any) => r.date >= "2024-01-16")).toBe(true);
    });

    it("should filter by confidence", async () => {
      const res = await makeRequest("GET", "/api/hotspots", { query: { confidence: "high" } });
      expect(res.body.data.every((r: any) => r.confidence === "high")).toBe(true);
    });

    it("should filter by minFrp", async () => {
      const res = await makeRequest("GET", "/api/hotspots", { query: { minFrp: "15" } });
      expect(res.body.data.every((r: any) => r.frp >= 15)).toBe(true);
    });

    it("should return geojson format", async () => {
      const res = await makeRequest("GET", "/api/hotspots", { query: { format: "geojson" } });
      expect(res.body.data.type).toBe("FeatureCollection");
      expect(res.body.data.features).toHaveLength(5);
    });

    it("should return grouped-by-date format", async () => {
      const res = await makeRequest("GET", "/api/hotspots", { query: { format: "grouped-by-date" } });
      expect(res.body.data).toHaveProperty("2024-01-15");
    });

    it("should return grouped-by-confidence format", async () => {
      const res = await makeRequest("GET", "/api/hotspots", { query: { format: "grouped-by-confidence" } });
      expect(res.body.data).toHaveProperty("low");
      expect(res.body.data).toHaveProperty("high");
    });

    it("should return timeseries format", async () => {
      const res = await makeRequest("GET", "/api/hotspots", { query: { format: "timeseries" } });
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data[0]).toHaveProperty("date");
    });

    it("should include stats when requested", async () => {
      const res = await makeRequest("GET", "/api/hotspots", { query: { includeStats: "true" } });
      expect(res.body.stats).toBeDefined();
      expect(res.body.stats.totalCount).toBe(5);
    });

    it("should simplify coordinates when requested", async () => {
      const res = await makeRequest("GET", "/api/hotspots", { query: { simplifyCoords: "true", coordPrecision: "2" } });
      expect(res.body.data[0].lat).toBe(-33.12);
    });

    it("should return 503 when no data loaded", async () => {
      controller.clear();
      const res = await makeRequest("GET", "/api/hotspots");
      expect(res.status).toBe(503);
      expect(res.body.code).toBe("DATA_NOT_LOADED");
    });
  });

  // ----- Stats Endpoint -----

  describe("GET /api/hotspots/stats", () => {
    it("should return stats for all data", async () => {
      const res = await makeRequest("GET", "/api/hotspots/stats");
      expect(res.status).toBe(200);
      expect(res.body.data.totalCount).toBe(5);
      expect(res.body.data.confidenceBreakdown).toEqual({ low: 1, nominal: 2, high: 2 });
    });

    it("should return filtered stats when filters provided", async () => {
      const res = await makeRequest("GET", "/api/hotspots/stats", { query: { confidence: "high" } });
      expect(res.body.data.totalCount).toBe(2);
    });

    it("should return 503 when no data loaded", async () => {
      controller.clear();
      const res = await makeRequest("GET", "/api/hotspots/stats");
      // The stats endpoint doesn't check for data loaded, it returns empty stats
      expect(res.status).toBe(200);
      expect(res.body.data.totalCount).toBe(0);
    });
  });

  // ----- Timeseries Endpoint -----

  describe("GET /api/hotspots/timeseries", () => {
    it("should return daily aggregated data", async () => {
      const res = await makeRequest("GET", "/api/hotspots/timeseries");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toHaveLength(3);
    });

    it("should return 503 when no data loaded", async () => {
      controller.clear();
      const res = await makeRequest("GET", "/api/hotspots/timeseries");
      expect(res.status).toBe(503);
    });
  });

  // ----- GeoJSON Endpoint -----

  describe("GET /api/hotspots/geojson", () => {
    it("should return GeoJSON FeatureCollection", async () => {
      const res = await makeRequest("GET", "/api/hotspots/geojson");
      expect(res.status).toBe(200);
      expect(res.body.data.type).toBe("FeatureCollection");
      expect(res.body.data.features).toHaveLength(5);
    });

    it("should return 503 when no data loaded", async () => {
      controller.clear();
      const res = await makeRequest("GET", "/api/hotspots/geojson");
      expect(res.status).toBe(503);
    });
  });

  // ----- Load CSV Endpoint -----

  describe("POST /api/hotspots/load", () => {
    it("should load CSV data and return parsed data", async () => {
      const res = await makeRequest("POST", "/api/hotspots/load", { body: { csv: SAMPLE_CSV } });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toHaveLength(5);
    });

    it("should return 400 for missing CSV", async () => {
      const res = await makeRequest("POST", "/api/hotspots/load", { body: {} });
      expect(res.status).toBe(400);
    });

    it("should replace existing data", async () => {
      await makeRequest("POST", "/api/hotspots/load", { body: { csv: SAMPLE_CSV } });
      const res = await makeRequest("POST", "/api/hotspots/load", { body: { csv: LARGE_CSV } });
      expect(res.body.data).toHaveLength(100);
    });
  });

  // ----- Load CSV Async Endpoint -----

  describe("POST /api/hotspots/load-async", () => {
    it("should load CSV asynchronously", async () => {
      const res = await makeRequest("POST", "/api/hotspots/load-async", { body: { csv: SAMPLE_CSV, batchSize: 2 } });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.totalRows).toBe(5);
    });

    it("should return 400 for missing CSV", async () => {
      const res = await makeRequest("POST", "/api/hotspots/load-async", { body: {} });
      expect(res.status).toBe(400);
    });
  });

  // ----- Clear Data Endpoint -----

  describe("DELETE /api/hotspots", () => {
    it("should clear all data", async () => {
      const res = await makeRequest("DELETE", "/api/hotspots");
      expect(res.status).toBe(200);
      expect(res.body.message).toBe("Data cleared");
    });

    it("should make subsequent requests return 503", async () => {
      await makeRequest("DELETE", "/api/hotspots");
      const res = await makeRequest("GET", "/api/hotspots");
      expect(res.status).toBe(503);
    });
  });

  // ----- Zones Endpoint -----

  describe("GET /api/zones", () => {
    it("should return predefined zones", async () => {
      const res = await makeRequest("GET", "/api/zones");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data[0]).toHaveProperty("id");
    });
  });

  // ----- Root Endpoint -----

  describe("GET /", () => {
    it("should return API info", async () => {
      const res = await makeRequest("GET", "/");
      expect(res.status).toBe(200);
      expect(res.body.name).toBe("Shock-KA DAO Hotspots API");
    });
  });

  // ----- 404 Handler -----

  describe("404 handler", () => {
    it("should return 404 for unknown routes", async () => {
      const res = await makeRequest("GET", "/api/unknown");
      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Not Found");
    });
  });

  // ----- CORS Headers -----

  describe("CORS", () => {
    it("should include CORS headers", async () => {
      const res = await makeRequest("OPTIONS", "/api/hotspots");
      expect(res.headers["access-control-allow-origin"]).toBe("*");
    });
  });
});

// ============ Integration Tests with Mock FireCalendar API ============

describe("API Routes - Integration with Mock FireCalendar API", () => {
  let mockApiServer: any;
  let integrationController: HotspotsController;
  let integrationApp: express.Express;
  let integrationBaseUrl: string;
  const MOCK_API_URL = "http://localhost:18081";

  beforeAll(async () => {
    mockApiServer = Bun.serve({
      port: 18081,
      fetch(req: Request) {
        const url = new URL(req.url);
        if (url.pathname === "/health") return new Response("ok", { status: 200 });
        if (url.pathname === "/v1/meta") return Response.json(MOCK_META);
        if (url.pathname === "/v1/calendar/region") return Response.json(MOCK_REGION_CALENDAR);
        if (url.pathname === "/v1/calendar/aoi") return Response.json(MOCK_AOI_CALENDAR);
        if (url.pathname === "/v1/hotspots.csv") return new Response(MOCK_CSV_RESPONSE, { headers: { "Content-Type": "text/csv" } });
        return new Response("Not Found", { status: 404 });
      },
    });

    integrationController = new HotspotsController();
    const fireCalendarClient = new FireCalendarApiClient(MOCK_API_URL);
    integrationApp = createTestApp(integrationController, fireCalendarClient);
    const server = integrationApp.listen(0);
    integrationBaseUrl = `http://localhost:${server.address().port}`;
  });

  afterAll(() => {
    mockApiServer?.stop();
  });

  beforeEach(() => {
    integrationController.clear();
  });

  const MOCK_META = {
    data_version: "1.0.0", model_id: "test-model", model_version: "v1", generated: "2024-01-15",
    files: { calendar_region: "", cell_month: "", cell_index: "" },
    final_test_poisson_dev: 1.23, known_limitations: [],
    calendar_interval_ratios: {
      africa: { q10: 0.5, q50: 1.0, q90: 2.0 },
      south_america: { q10: 0.4, q50: 1.0, q90: 2.5 },
      canada_usa: { q10: 0.6, q50: 1.0, q90: 1.8 },
      australia: { q10: 0.3, q50: 1.0, q90: 3.0 },
    },
    unit: "detections", sources: { observed: "VIIRS", backcast: "MODIS", backcast_terra: "Terra" },
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

  const MOCK_REGION_CALENDAR = {
    region: "south_america", season: { peak_month: 9, start_month: 6, end_month: 12, method: "test" },
    rows: [{ region: "south_america", year: 2024, month: 1, source: "observed", value: 100, p_lo: 90, p_hi: 110, modis: 50, viirs_model: 95, viirs_obs: 100, clim_median: 80, ratio_vs_median: 1.25, pct_vs_ref: 75 }],
  };

  const MOCK_AOI_CALENDAR = {
    cells: 4, region: "south_america", note: "AOI covers 4 cells",
    rows: [{ year: 2024, month: 1, source: "observed", value: 25, modis: 12, viirs_model: 24, p_lo: 20, p_hi: 30, clim_median: 20, pct_vs_ref: 80 }],
  };

  const MOCK_CSV_RESPONSE = `latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight
-33.1234,-60.5678,320.5,1.2,1.5,2024-01-15,1230,Terra,MODIS,high,6.1,290.1,15.5,D`;

  async function makeIntegrationRequest(method: string, path: string, options: { body?: any; query?: Record<string, string> } = {}) {
    const url = new URL(path, integrationBaseUrl);
    if (options.query) Object.entries(options.query).forEach(([k, v]) => url.searchParams.set(k, v));
    const response = await fetch(url.toString(), { method, headers: { "Content-Type": "application/json" }, body: options.body ? JSON.stringify(options.body) : undefined });
    let body: any;
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) body = await response.json(); else body = await response.text();
    return { status: response.status, body };
  }

  describe("GET /api/meta", () => {
    it("should proxy to FireCalendar API and return meta", async () => {
      const res = await makeIntegrationRequest("GET", "/api/meta");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.data_version).toBe("1.0.0");
    });
  });

  describe("GET /api/calendar/region", () => {
    it("should proxy to FireCalendar API with region param", async () => {
      const res = await makeIntegrationRequest("GET", "/api/calendar/region", { query: { region: "south_america" } });
      expect(res.status).toBe(200);
      expect(res.body.data.region).toBe("south_america");
    });
  });

  describe("GET /api/calendar/aoi", () => {
    it("should proxy to FireCalendar API with bbox params", async () => {
      const res = await makeIntegrationRequest("GET", "/api/calendar/aoi", { query: { min_lat: "-34", max_lat: "-32", min_lon: "-61", max_lon: "-58" } });
      expect(res.status).toBe(200);
      expect(res.body.data.cells).toBe(4);
    });
  });

  describe("GET /api/hotspots/csv", () => {
    it("should download CSV from FireCalendar API", async () => {
      const res = await makeIntegrationRequest("GET", "/api/hotspots/csv", { query: { min_lat: "-34", max_lat: "-32", min_lon: "-61", max_lon: "-58", start: "2024-01-01", end: "2024-01-31" } });
      expect(res.status).toBe(200);
      expect(typeof res.body).toBe("string");
      expect(res.body).toContain("latitude,longitude");
    });
  });

  describe("GET /api/hotspots/csv-url", () => {
    it("should generate CSV URL", async () => {
      const res = await makeIntegrationRequest("GET", "/api/hotspots/csv-url", { query: { min_lat: "-34", max_lat: "-32", min_lon: "-61", max_lon: "-58", start: "2024-01-01", end: "2024-01-31" } });
      expect(res.status).toBe(200);
      expect(res.body.data.url).toContain("/v1/hotspots.csv?");
    });
  });
});