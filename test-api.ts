#!/usr/bin/env bun
/**
 * Test script for FireCalendar API client
 * Run with: bun test-api.ts
 *
 * Make sure the API is running at FIRECALENDAR_API_URL (default: http://localhost:7860)
 * Or set FIRECALENDAR_API_URL to the deployed API (e.g., https://ploychomphoo-firecalendar-api.hf.space)
 */

import {
  FireCalendarApiClient,
  createFireCalendarClient,
  FireCalendarApiError,
} from "./src/lib/firecalendar-api-client";
import type { Region, Box } from "./src/types/firecalendar";

async function main() {
  // Default to the documented example API if available, otherwise localhost
  const defaultUrl = "https://ploychomphoo-firecalendar-api.hf.space";
  const baseUrl = process.env.FIRECALENDAR_API_URL || defaultUrl;
  console.log(`Testing FireCalendar API at: ${baseUrl}\n`);

  const client = createFireCalendarClient(baseUrl);

  // Helper to run a test and catch connection errors
  async function runTest(name: string, fn: () => Promise<void>) {
    console.log(`=== ${name} ===`);
    try {
      await fn();
    } catch (error) {
      if (error instanceof FireCalendarApiError) {
        console.log(`✗ API Error (${error.status}): ${error.detail}`);
      } else if (
        error instanceof TypeError &&
        error.message.includes("ECONNREFUSED")
      ) {
        console.log(`✗ Connection refused - is the API running at ${baseUrl}?`);
        console.log(`  Set FIRECALENDAR_API_URL to a running API endpoint`);
      } else {
        console.error(`✗ Error:`, error);
      }
    }
    console.log();
  }

  // Test 1: Health check
  await runTest("Test 1: Health Check", async () => {
    const healthy = await client.healthCheck();
    console.log(healthy ? "✓ Health check passed" : "✗ Health check failed");
  });

  // Test 2: Get Meta
  await runTest("Test 2: Get Meta", async () => {
    const meta = await client.getMeta();
    console.log("✓ Meta retrieved:");
    console.log(`  data_version: ${meta.data_version}`);
    console.log(`  model_version: ${meta.model_version}`);
    console.log(`  regions: ${meta.regions.join(", ")}`);
    console.log(`  years: ${meta.years[0]}-${meta.years[1]}`);
    console.log(`  n_cells: ${meta.n_cells}`);
    console.log(
      `  coverage_bbox: [${meta.coverage_bbox.min_lat}, ${meta.coverage_bbox.min_lon}, ${meta.coverage_bbox.max_lat}, ${meta.coverage_bbox.max_lon}]`,
    );
  });

  // Test 3: Get Region Calendar
  await runTest(
    "Test 3: Get Region Calendar (south_america, 2010-08 to 2010-09)",
    async () => {
      const calendar = await client.getRegionCalendar(
        "south_america",
        "2010-08",
        "2010-09",
      );
      console.log("✓ Region calendar retrieved:");
      console.log(`  region: ${calendar.region}`);
      console.log(
        `  season: peak=${calendar.season.peak_month}, start=${calendar.season.start_month}, end=${calendar.season.end_month}`,
      );
      console.log(`  rows: ${calendar.rows.length}`);
      calendar.rows.forEach((row) => {
        console.log(
          `    ${row.year}-${String(row.month).padStart(2, "0")}: value=${row.value}, source=${row.source}, pct_vs_ref=${row.pct_vs_ref}`,
        );
      });
    },
  );

  // Test 4: Get AOI Calendar (Rosario, Argentina area)
  const rosarioBox: Box = {
    minLat: -34.5,
    minLon: -61,
    maxLat: -32.5,
    maxLon: -58.5,
  };

  await runTest(
    "Test 4: Get AOI Calendar (Rosario, Argentina, Aug 2022)",
    async () => {
      const aoi = await client.getAoiCalendar(rosarioBox, "2022-08", "2022-08");
      console.log("✓ AOI calendar retrieved:");
      console.log(`  cells: ${aoi.cells}`);
      console.log(`  region: ${aoi.region}`);
      console.log(`  note: ${aoi.note}`);
      console.log(`  rows: ${aoi.rows.length}`);
      aoi.rows.forEach((row) => {
        console.log(
          `    ${row.year}-${String(row.month).padStart(2, "0")}: value=${row.value}, source=${row.source}, clim_median=${row.clim_median}, pct_vs_ref=${row.pct_vs_ref}`,
        );
      });

      // Test fillAoiMonths
      const filled = FireCalendarApiClient.fillAoiMonths(aoi.rows);
      console.log(`\n  Filled months: ${filled.length} (should be 288)`);
      const aug2022 = filled.find((r) => r.year === 2022 && r.month === 8);
      console.log(
        `  Aug 2022 after fill: value=${aug2022?.value}, source=${aug2022?.source}`,
      );
    },
  );

  // Test 5: Hotspots CSV URL
  await runTest("Test 5: Hotspots CSV URL", async () => {
    const csvUrl = client.getHotspotsCsvUrl(
      rosarioBox,
      "2022-08-01",
      "2022-08-10",
    );
    console.log("✓ Hotspots CSV URL generated:");
    console.log(`  ${csvUrl}`);
  });

  // Test 6: Error handling (invalid region)
  await runTest("Test 6: Error Handling (invalid region)", async () => {
    try {
      await client.getRegionCalendar("invalid_region" as Region);
      console.log("✗ Should have thrown error");
    } catch (error) {
      if (error instanceof FireCalendarApiError) {
        console.log("✓ Error handled correctly:");
        console.log(`  status: ${error.status}`);
        console.log(`  detail: ${JSON.stringify(error.detail)}`);
      } else {
        throw error;
      }
    }
  });

  console.log("=== All tests completed ===");
}

main().catch(console.error);
