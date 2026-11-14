/**
 * Express Server
 * Main entry point for the REST API server
 * Separates HTTP concerns from business logic (controller)
 */

import express from "express";
import type { Request, Response, NextFunction } from "express";
import path from "path";
import { fileURLToPath } from "url";
import { apiRouter } from "./routes";
import { FireCalendarApiClient, createFireCalendarClient } from "../lib/firecalendar-api-client";
import { HotspotsController } from "../lib/hotspots-controller";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "../../");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const FIRECALENDAR_API_URL = process.env.FIRECALENDAR_API_URL || "http://localhost:7860";

// ============ Middleware ============

app.use(express.json({ limit: "50mb" })); // Large CSV payloads
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// CORS for frontend
app.use((req: Request, res: Response, next: NextFunction) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Request logging
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// ============ Static Files ============

// Serve Earth Pulse HTML at /map
app.get("/map", (req: Request, res: Response) => {
  const htmlPath = path.join(PROJECT_ROOT, "Earth Pulse – MODIS · VIIRS Explorer (Mock-up)(2).html");
  res.sendFile(htmlPath);
});

// Also serve at root for convenience
app.get("/", (req: Request, res: Response) => {
  res.json({
    name: "Shock-KA DAO Hotspots API",
    version: "1.0.0",
    description: "REST API for fire hotspots data transformation",
    endpoints: {
      health: "GET /api/health",
      meta: "GET /api/meta",
      calendarRegion: "GET /api/calendar/region",
      calendarAoi: "GET /api/calendar/aoi",
      hotspots: "GET /api/hotspots",
      hotspotsStats: "GET /api/hotspots/stats",
      hotspotsTimeseries: "GET /api/hotspots/timeseries",
      hotspotsGeoJSON: "GET /api/hotspots/geojson",
      hotspotsCsvUrl: "GET /api/hotspots/csv-url",
      hotspotsCsv: "GET /api/hotspots/csv",
      zones: "GET /api/zones",
      loadCSV: "POST /api/hotspots/load",
      loadCSVAsync: "POST /api/hotspots/load-async",
      clearData: "DELETE /api/hotspots",
      earthPulseMap: "GET /map",
    },
  });
});

// ============ API Routes ============

app.use("/api", apiRouter);

// ============ Root & Info ============

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
    documentation: "/api/docs",
  });
});

// ============ Error Handling ============

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: "Not Found",
    message: `Route ${req.method} ${req.path} not found`,
  });
});

// Global error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error("[Server Error]:", err);
  res.status(500).json({
    success: false,
    error: "Internal Server Error",
    message: process.env.NODE_ENV === "development" ? err.message : "An unexpected error occurred",
  });
});

// ============ Server Startup ============

async function initializeData(): Promise<void> {
  console.log("Initializing hotspots data from FireCalendar API...");

  try {
    const apiClient = createFireCalendarClient(FIRECALENDAR_API_URL);

    // Health check
    const healthy = await apiClient.healthCheck();
    if (!healthy) {
      console.warn("⚠ FireCalendar API health check failed. Server will start but data loading may fail.");
      return;
    }

    // Download sample data (Rosario, Argentina area - last 30 days)
    const endDate = new Date().toISOString().split("T")[0] ?? "";
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0] ?? "";

    const box = {
      minLat: -34.5,
      minLon: -61.0,
      maxLat: -32.5,
      maxLon: -58.5,
    };

    console.log(`Downloading hotspots: ${startDate} to ${endDate}...`);
    const csvText = await apiClient.downloadHotspotsCsv(box, startDate, endDate);

    // Load into controller (access via routes module)
    const { controller } = await import("./routes");
    const count = controller.parseCSV(csvText);

    console.log(`✓ Loaded ${count} hotspot records`);
  } catch (error) {
    console.error("✗ Failed to initialize data:", error instanceof Error ? error.message : error);
    console.log("Server will start without preloaded data. Use POST /api/hotspots/load to load manually.");
  }
}

async function startServer(): Promise<void> {
  // Initialize data before starting server
  await initializeData();

  app.listen(PORT, () => {
    console.log(`\n🚀 Shock-KA DAO Hotspots API running on http://localhost:${PORT}`);
    console.log(`   API Base: http://localhost:${PORT}/api`);
    console.log(`   Health:   http://localhost:${PORT}/api/health`);
    console.log(`   Docs:     http://localhost:${PORT}/api/docs\n`);
  });
}

// Handle graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received. Shutting down gracefully...");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("SIGINT received. Shutting down gracefully...");
  process.exit(0);
});

// Start
startServer().catch(console.error);

export { app };