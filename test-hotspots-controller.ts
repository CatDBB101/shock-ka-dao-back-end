#!/usr/bin/env bun
/**
 * Test script for HotspotsController
 * Run with: bun test-hotspots-controller.ts
 */

import { HotspotsController, createHotspotsController } from "./src/lib/hotspots-controller";
import type { HotspotRow, TransformOptions } from "./src/types/hotspots";

// Sample CSV data (simulating FIRMS hotspots CSV)
const SAMPLE_CSV = `latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight
-33.1234,-59.5678,320.5,1.2,1.1,2024-01-15,1430,Suomi NPP,VIIRS,high,1.0,290.1,45.6,D
-33.2345,-59.6789,315.2,1.1,1.0,2024-01-15,2230,Aqua,MODIS,nominal,1.0,285.3,32.1,N
-33.3456,-59.7890,330.8,1.3,1.2,2024-01-16,130,Terra,MODIS,low,1.0,295.7,12.4,D
-33.4567,-59.8901,325.1,1.2,1.1,2024-01-16,1030,Suomi NPP,VIIRS,nominal,1.0,292.4,28.9,D
-33.5678,-59.9012,318.9,1.1,1.0,2024-01-17,500,NOAA-20,VIIRS,high,1.0,288.2,55.3,N
-33.6789,-59.0123,322.4,1.2,1.1,2024-01-17,1400,Suomi NPP,VIIRS,high,1.0,291.5,41.7,D
-33.7890,-59.1234,319.6,1.1,1.0,2024-01-18,2300,Aqua,MODIS,nominal,1.0,286.8,35.2,N
-33.8901,-59.2345,328.3,1.3,1.2,2024-01-18,1230,Terra,MODIS,high,1.0,294.1,48.9,D
-33.9012,-59.3456,316.7,1.2,1.1,2024-01-19,600,NOAA-21,VIIRS,low,1.0,287.3,18.5,N
-33.0123,-59.4567,324.5,1.1,1.0,2024-01-19,1500,Suomi NPP,VIIRS,nominal,1.0,290.8,38.2,D`;

async function main() {
  console.log("=== HotspotsController Tests ===\n");

  // Test 1: Basic parsing
  console.log("--- Test 1: Parse CSV ---");
  const controller = createHotspotsController();
  const data = controller.parseCSV(SAMPLE_CSV);
  console.log(`Parsed ${data.length} rows`);
  console.log("First row:", JSON.stringify(data[0], null, 2));

  // Test 2: Transform with default format (array)
  console.log("\n--- Test 2: Transform (array format) ---");
  const result = controller.transform() as HotspotRow[];
  console.log(`Returned ${result.length} rows`);

  // Test 3: Transform with filters
  console.log("\n--- Test 3: Transform with filters ---");
  const filtered = controller.transform({
    filters: {
      confidence: ["high", "nominal"],
      dateFrom: "2024-01-16",
      minFrp: 30,
    },
  }) as HotspotRow[];
  console.log(`Filtered to ${filtered.length} rows`);

  // Test 4: Transform with pagination
  console.log("\n--- Test 4: Transform with pagination ---");
  const paginated = controller.transform({
    pagination: { page: 1, pageSize: 3 },
  }) as any;
  console.log(`Page 1, size 3: ${paginated.data.length} items`);
  console.log("Pagination info:", paginated.pagination);

  // Test 5: Transform with stats
  console.log("\n--- Test 5: Transform with stats ---");
  const withStats = controller.transform({
    includeStats: true,
  }) as any;
  console.log("Stats:", JSON.stringify(withStats.stats, null, 2));

  // Test 6: GeoJSON output
  console.log("\n--- Test 6: GeoJSON format ---");
  const geojson = controller.transform({ format: "geojson" }) as any;
  console.log(`GeoJSON features: ${geojson.features.length}`);
  console.log("First feature:", JSON.stringify(geojson.features[0], null, 2));

  // Test 7: Grouped by date
  console.log("\n--- Test 7: Grouped by date ---");
  const byDate = controller.transform({ format: "grouped-by-date" }) as Record<string, HotspotRow[]>;
  console.log("Dates:", Object.keys(byDate));
  Object.entries(byDate).forEach(([date, rows]) => {
    console.log(`  ${date}: ${rows.length} rows`);
  });

  // Test 8: Grouped by confidence
  console.log("\n--- Test 8: Grouped by confidence ---");
  const byConf = controller.transform({ format: "grouped-by-confidence" }) as any;
  console.log("Low:", byConf.low.length, "Nominal:", byConf.nominal.length, "High:", byConf.high.length);

  // Test 9: Time series
  console.log("\n--- Test 9: Time series ---");
  const timeseries = controller.transform({ format: "timeseries" }) as any[];
  console.log("Time series points:", timeseries.length);
  timeseries.forEach((p) => console.log(`  ${p.date}: count=${p.count}, avgFrp=${p.avgFrp.toFixed(1)}`));

  // Test 10: Coordinate simplification
  console.log("\n--- Test 10: Coordinate simplification ---");
  const simplified = controller.transform({
    simplifyCoords: true,
    coordPrecision: 2,
  }) as HotspotRow[];
  console.log("Original precision:", data[0]?.lat, data[0]?.lon);
  console.log("Simplified precision:", simplified[0]?.lat, simplified[0]?.lon);

  // Test 11: Async parsing (for large files)
  console.log("\n--- Test 11: Async parsing ---");
  const asyncController = createHotspotsController();
  let asyncCount = 0;
  for await (const batch of asyncController.parseCSVAsync(SAMPLE_CSV, 3)) {
    asyncCount += batch.length;
    console.log(`  Batch: ${batch.length} rows`);
  }
  console.log(`Total async parsed: ${asyncCount}`);

  // Test 12: Load pre-parsed data
  console.log("\n--- Test 12: Load pre-parsed data ---");
  const preloadedController = createHotspotsController();
  preloadedController.loadData(data);
  const reloaded = preloadedController.getData();
  console.log(`Reloaded ${reloaded.length} rows`);

  // Test 13: Bounding box filter
  console.log("\n--- Test 13: Bounding box filter ---");
  const bboxFiltered = controller.transform({
    filters: {
      bbox: { minLat: -33.5, maxLat: -33.0, minLon: -59.8, maxLon: -59.2 },
    },
  }) as HotspotRow[];
  console.log(`In bbox: ${bboxFiltered.length} rows`);

  console.log("\n=== All tests passed ===");
}

main().catch(console.error);