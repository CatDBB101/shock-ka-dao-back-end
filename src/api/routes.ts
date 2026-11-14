/**
 * API Routes
 * Express route handlers - thin layer that delegates to HotspotsController
 * NO business logic, NO data transformation - only HTTP handling
 */

import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { HotspotsController, createHotspotsController } from "../lib/hotspots-controller";
import { FireCalendarApiClient, createFireCalendarClient } from "../lib/firecalendar-api-client";
import type {
  TransformOptions,
  HotspotFilters,
  PaginationParams,
  OutputFormat,
  BoundingBox,
} from "../types/hotspots";
import type { Box, Region } from "../types/firecalendar";

const router = Router();

// Singleton controller instance (stateless, reusable)
const controller = createHotspotsController();

// FireCalendar API client for proxying calendar/meta endpoints
const fireCalendarClient = createFireCalendarClient();

// ============ Middleware ============

/**
 * Parse and validate query parameters for hotspots endpoints
 */
function parseHotspotsQuery(req: Request): TransformOptions {
  const query = req.query;

  // Filters
  const filters: HotspotFilters = {};
  if (query.dateFrom) filters.dateFrom = String(query.dateFrom);
  if (query.dateTo) filters.dateTo = String(query.dateTo);
  if (query.confidence) {
    const conf = String(query.confidence).split(",") as ("low" | "nominal" | "high")[];
    filters.confidence = conf;
  }
  if (query.minFrp) filters.minFrp = Number(query.minFrp);
  if (query.maxFrp) filters.maxFrp = Number(query.maxFrp);
  if (query.satellite) {
    filters.satellite = String(query.satellite).split(",");
  }
  if (query.daynight) {
    filters.daynight = String(query.daynight).split(",") as ("D" | "N")[];
  }
  if (query.minLat && query.maxLat && query.minLon && query.maxLon) {
    filters.bbox = {
      minLat: Number(query.minLat),
      maxLat: Number(query.maxLat),
      minLon: Number(query.minLon),
      maxLon: Number(query.maxLon),
    };
  }

  // Pagination
  let pagination: PaginationParams | undefined;
  if (query.page || query.pageSize) {
    pagination = {
      page: Math.max(1, Number(query.page) || 1),
      pageSize: Math.min(10000, Math.max(1, Number(query.pageSize) || 1000)),
    };
  }

  // Format
  const format = (query.format as OutputFormat) || "array";

  // Options
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

/**
 * Error handler middleware
 */
function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  console.error(`[API Error] ${req.method} ${req.path}:`, err.message);

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

// ============ Routes ============

/**
 * GET /api/hotspots
 * Get hotspots data with filtering, pagination, and formatting options
 *
 * Query Parameters:
 * - dateFrom, dateTo: YYYY-MM-DD
 * - confidence: comma-separated (low,nominal,high)
 * - minFrp, maxFrp: numbers
 * - satellite: comma-separated
 * - daynight: comma-separated (D,N)
 * - minLat, maxLat, minLon, maxLon: for bbox filter
 * - page, pageSize: pagination
 * - format: array|geojson|grouped-by-date|grouped-by-confidence|timeseries
 * - includeStats: true|false
 * - simplifyCoords: true|false
 * - coordPrecision: number (default 4)
 */
router.get("/hotspots", (req: Request, res: Response, next: NextFunction) => {
  try {
    const options = parseHotspotsQuery(req);
    const result = controller.transform(options);

    // Handle different response shapes
    if (options.includeStats && typeof result === "object" && "stats" in result) {
      return res.json({
        success: true,
        data: result.data,
        stats: result.stats,
      });
    }

    // For paginated results
    if (options.pagination && typeof result === "object" && "pagination" in result) {
      return res.json({
        success: true,
        data: result.data,
        pagination: result.pagination,
      });
    }

    // Default array or formatted response
    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/hotspots/stats
 * Get statistics for current loaded data (with optional filters)
 */
router.get("/hotspots/stats", (req: Request, res: Response, next: NextFunction) => {
  try {
    const options = parseHotspotsQuery(req);
    const stats = controller.computeStats();

    // If filters provided, compute stats on filtered data
    let filteredStats = stats;
    if (options.filters) {
      const filteredData = controller.transform({
        filters: options.filters,
        format: "array",
      }) as any[];
      filteredStats = controller.computeStats(filteredData);
    }

    res.json({
      success: true,
      data: filteredStats,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/hotspots/timeseries
 * Get time series aggregation (daily counts + FRP stats)
 * Convenience endpoint for charts
 */
router.get("/hotspots/timeseries", (req: Request, res: Response, next: NextFunction) => {
  try {
    const options = parseHotspotsQuery(req);
    const result = controller.transform({
      ...options,
      format: "timeseries",
    }) as any[];

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/hotspots/geojson
 * Get data as GeoJSON FeatureCollection for mapping
 */
router.get("/hotspots/geojson", (req: Request, res: Response, next: NextFunction) => {
  try {
    const options = parseHotspotsQuery(req);
    const result = controller.transform({
      ...options,
      format: "geojson",
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/hotspots/load
 * Load CSV data into controller
 * Body: { csv: string } or multipart/form-data with file
 */
router.post("/hotspots/load", (req: Request, res: Response, next: NextFunction) => {
  try {
    const { csv } = req.body;

    if (!csv || typeof csv !== "string") {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "CSV data required in request body: { csv: string }",
      });
    }

    const count = controller.parseCSV(csv);

    res.json({
      success: true,
      message: `Loaded ${count} hotspot records`,
      count,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/hotspots/load-async
 * Load large CSV data asynchronously (streaming)
 * Body: { csv: string, batchSize?: number }
 * Returns: { success: true, message: "Processing started", totalRows: number }
 * Note: This is a simplified version - real implementation would use WebSocket/SSE for progress
 */
router.post("/hotspots/load-async", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { csv, batchSize = 10000 } = req.body;

    if (!csv || typeof csv !== "string") {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "CSV data required in request body: { csv: string, batchSize?: number }",
      });
    }

    let totalRows = 0;
    for await (const batch of controller.parseCSVAsync(csv, batchSize)) {
      totalRows += batch.length;
      // In real implementation, could push progress via WebSocket/SSE
    }

    res.json({
      success: true,
      message: `Async load completed: ${totalRows} rows`,
      totalRows,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/hotspots
 * Clear loaded data
 */
router.delete("/hotspots", (req: Request, res: Response) => {
  controller.clear();
  res.json({
    success: true,
    message: "Data cleared",
  });
});

/**
 * GET /api/meta
 * Proxy to FireCalendar API /v1/meta
 * Returns full metadata including manifest, regions, seasons, coverage
 */
router.get("/meta", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const meta = await fireCalendarClient.getMeta();
    res.json({
      success: true,
      data: meta,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/calendar/region
 * Proxy to FireCalendar API /v1/calendar/region
 * Query params: region, start (YYYY-MM), end (YYYY-MM)
 */
router.get("/calendar/region", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { region, start, end } = req.query;

    if (!region || typeof region !== "string") {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Region parameter is required",
      });
    }

    const calendar = await fireCalendarClient.getRegionCalendar(
      region as Region,
      start as string | undefined,
      end as string | undefined,
    );

    res.json({
      success: true,
      data: calendar,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/calendar/aoi
 * Proxy to FireCalendar API /v1/calendar/aoi
 * Query params: min_lat, max_lat, min_lon, max_lon, start (YYYY-MM), end (YYYY-MM)
 */
router.get("/calendar/aoi", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { min_lat, max_lat, min_lon, max_lon, start, end } = req.query;

    if (
      !min_lat ||
      !max_lat ||
      !min_lon ||
      !max_lon ||
      typeof min_lat !== "string" ||
      typeof max_lat !== "string" ||
      typeof min_lon !== "string" ||
      typeof max_lon !== "string"
    ) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Bounding box parameters (min_lat, max_lat, min_lon, max_lon) are required",
      });
    }

    const box: Box = {
      minLat: Number(min_lat),
      maxLat: Number(max_lat),
      minLon: Number(min_lon),
      maxLon: Number(max_lon),
    };

    const calendar = await fireCalendarClient.getAoiCalendar(
      box,
      start as string | undefined,
      end as string | undefined,
    );

    res.json({
      success: true,
      data: calendar,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/hotspots/csv-url
 * Generate URL for FIRMS hotspots CSV download from FireCalendar API
 * Query params: min_lat, max_lat, min_lon, max_lon, start (YYYY-MM-DD), end (YYYY-MM-DD), source?
 */
router.get("/hotspots/csv-url", (req: Request, res: Response) => {
  try {
    const { min_lat, max_lat, min_lon, max_lon, start, end, source } = req.query;

    if (
      !min_lat ||
      !max_lat ||
      !min_lon ||
      !max_lon ||
      !start ||
      !end ||
      typeof min_lat !== "string" ||
      typeof max_lat !== "string" ||
      typeof min_lon !== "string" ||
      typeof max_lon !== "string" ||
      typeof start !== "string" ||
      typeof end !== "string"
    ) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Required parameters: min_lat, max_lat, min_lon, max_lon, start, end",
      });
    }

    const box: Box = {
      minLat: Number(min_lat),
      maxLat: Number(max_lat),
      minLon: Number(min_lon),
      maxLon: Number(max_lon),
    };

    const url = fireCalendarClient.getHotspotsCsvUrl(box, start, end, source as string | undefined);

    res.json({
      success: true,
      data: { url },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/hotspots/csv
 * Download FIRMS hotspots CSV directly from FireCalendar API
 * Query params: min_lat, max_lat, min_lon, max_lon, start (YYYY-MM-DD), end (YYYY-MM-DD), source?
 */
router.get("/hotspots/csv", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { min_lat, max_lat, min_lon, max_lon, start, end, source } = req.query;

    if (
      !min_lat ||
      !max_lat ||
      !min_lon ||
      !max_lon ||
      !start ||
      !end ||
      typeof min_lat !== "string" ||
      typeof max_lat !== "string" ||
      typeof min_lon !== "string" ||
      typeof max_lon !== "string" ||
      typeof start !== "string" ||
      typeof end !== "string"
    ) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Required parameters: min_lat, max_lat, min_lon, max_lon, start, end",
      });
    }

    const box: Box = {
      minLat: Number(min_lat),
      maxLat: Number(max_lat),
      minLon: Number(min_lon),
      maxLon: Number(max_lon),
    };

    const csvText = await fireCalendarClient.downloadHotspotsCsv(
      box,
      start,
      end,
      source as string | undefined,
    );

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="hotspots_${start}_${end}.csv"`);
    res.send(csvText);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/zones
 * Get watch zones (predefined areas of interest for monitoring)
 * Returns static zones for now - could be extended to load from database/config
 */
router.get("/zones", (req: Request, res: Response) => {
  // Predefined watch zones (matching the mock-up)
  const zones = [
    {
      id: "z1",
      name: "Amazon Basin",
      country: "Brazil",
      cont: "South America",
      ring: [[-70, -10], [-50, -10], [-50, 5], [-70, 5], [-70, -10]],
    },
    {
      id: "z2",
      name: "Congo Basin",
      country: "DRC",
      cont: "Africa",
      ring: [[15, -5], [30, -5], [30, 5], [15, 5], [15, -5]],
    },
    {
      id: "z3",
      name: "Siberian Taiga",
      country: "Russia",
      cont: "Asia",
      ring: [[80, 55], [120, 55], [120, 65], [80, 65], [80, 55]],
    },
    {
      id: "z4",
      name: "Western US",
      country: "USA",
      cont: "North America",
      ring: [[-125, 32], [-105, 32], [-105, 49], [-125, 49], [-125, 32]],
    },
    {
      id: "z5",
      name: "Northern Australia",
      country: "Australia",
      cont: "Australia",
      ring: [[120, -20], [145, -20], [145, -10], [120, -10], [120, -20]],
    },
    {
      id: "z6",
      name: "Central Africa",
      country: "CAR",
      cont: "Africa",
      ring: [[15, 3], [25, 3], [25, 10], [15, 10], [15, 3]],
    },
    {
      id: "z7",
      name: "Indonesia",
      country: "Indonesia",
      cont: "Asia",
      ring: [[95, -10], [140, -10], [140, 5], [95, 5], [95, -10]],
    },
    {
      id: "z8",
      name: "Bolivia/Paraguay",
      country: "Bolivia",
      cont: "South America",
      ring: [[-65, -25], [-55, -25], [-55, -15], [-65, -15], [-65, -25]],
    },
    {
      id: "z9",
      name: "Zambia/Angola",
      country: "Zambia",
      cont: "Africa",
      ring: [[20, -18], [33, -18], [33, -8], [20, -8], [20, -18]],
    },
    {
      id: "z10",
      name: "Mekong Delta",
      country: "Vietnam",
      cont: "Asia",
      ring: [[100, 8], [110, 8], [110, 16], [100, 16], [100, 8]],
    },
    {
      id: "z11",
      name: "Central Savanna",
      country: "Congo (DRC)",
      cont: "Africa",
      ring: [[24, -9], [26, -9], [26, -7], [24, -7], [24, -9]],
    },
    {
      id: "z12",
      name: "Central Portugal",
      country: "Portugal",
      cont: "Europe",
      ring: [[-8.2, 39.8], [-7, 39.8], [-7, 41], [-8.2, 41], [-8.2, 39.8]],
    },
    {
      id: "z13",
      name: "Eastern Taiga",
      country: "Russia",
      cont: "Asia",
      ring: [[110, 56], [113, 56], [113, 58], [110, 58], [110, 56]],
    },
  ];

  res.json({
    success: true,
    data: zones,
  });
});

/**
 * GET /api/health
 * Health check endpoint
 */
router.get("/health", (req: Request, res: Response) => {
  res.json({
    success: true,
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "shock-ka-dao-hotspots-api",
  });
});

// Apply error handler
router.use(errorHandler);

export { router as apiRouter };
export { controller }; // Export for testing if needed