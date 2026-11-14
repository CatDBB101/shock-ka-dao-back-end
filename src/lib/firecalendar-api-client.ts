/**
 * FireCalendar API Client
 * Implements all endpoints from the FireCalendar REST API (Path B)
 */

import type {
  Region,
  Source,
  Meta,
  RegionCalendar,
  AoiCalendar,
  AoiRow,
  Box,
  HotspotsQuery,
  ApiErrorResponse,
} from "../types/firecalendar";

const DEFAULT_BASE_URL = "http://localhost:7860";

export class FireCalendarApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly detail: string | string[],
  ) {
    super(message);
    this.name = "FireCalendarApiError";
  }
}

export class FireCalendarApiClient {
  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl =
      baseUrl || process.env.FIRECALENDAR_API_URL || DEFAULT_BASE_URL;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        ...init?.headers,
      },
      ...init,
    });

    if (!response.ok) {
      const errorDetail = await this.readApiError(response);
      throw new FireCalendarApiError(
        `FireCalendar API ${path}: ${errorDetail}`,
        response.status,
        errorDetail,
      );
    }

    // Handle CSV response (hotspots.csv)
    const contentType = response.headers.get("content-type");
    if (contentType?.includes("text/csv")) {
      return response.text() as unknown as T;
    }

    return response.json() as Promise<T>;
  }

  private async readApiError(response: Response): Promise<string> {
    try {
      const body = (await response.json()) as ApiErrorResponse;
      if (typeof body.detail === "string") {
        return body.detail;
      }
      if (Array.isArray(body.detail)) {
        return body.detail.map((d) => `${d.loc?.at(-1)}: ${d.msg}`).join("; ");
      }
    } catch {
      // Not JSON
    }
    return `HTTP ${response.status}`;
  }

  /**
   * Health check endpoint
   * GET /health
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: "GET",
      });
      const text = await response.text();
      return response.ok && text.trim() === "ok";
    } catch {
      return false;
    }
  }

  /**
   * Get full metadata including manifest, regions, seasons, and coverage
   * GET /v1/meta
   */
  async getMeta(): Promise<Meta> {
    return this.request<Meta>("/v1/meta");
  }

  /**
   * Get calendar data for a specific region
   * GET /v1/calendar/region?region={region}&start={YYYY-MM}&end={YYYY-MM}
   */
  async getRegionCalendar(
    region: Region,
    start?: string,
    end?: string,
  ): Promise<RegionCalendar> {
    const params = new URLSearchParams();
    params.set("region", region);
    if (start) params.set("start", start);
    if (end) params.set("end", end);

    return this.request<RegionCalendar>(
      `/v1/calendar/region?${params.toString()}`,
    );
  }

  /**
   * Get calendar data for a custom area of interest (bounding box)
   * GET /v1/calendar/aoi?min_lat={}&max_lat={}&min_lon={}&max_lon={}&start={}&end={}
   */
  async getAoiCalendar(
    box: Box,
    start?: string,
    end?: string,
  ): Promise<AoiCalendar> {
    const params = new URLSearchParams();
    params.set("min_lat", box.minLat.toString());
    params.set("max_lat", box.maxLat.toString());
    params.set("min_lon", box.minLon.toString());
    params.set("max_lon", box.maxLon.toString());
    if (start) params.set("start", start);
    if (end) params.set("end", end);

    return this.request<AoiCalendar>(`/v1/calendar/aoi?${params.toString()}`);
  }

  /**
   * Generate URL for downloading FIRMS hotspots CSV
   * GET /v1/hotspots.csv?min_lat={}&min_lon={}&max_lat={}&max_lon={}&start={}&end={}&source={}
   *
   * Note: This returns a URL string that can be used directly in an <a> tag with download attribute
   * The actual CSV download requires the FIRMS_MAP_KEY secret to be configured on the server
   */
  getHotspotsCsvUrl(
    box: Box,
    start: string,
    end: string,
    source?: string,
  ): string {
    const params = new URLSearchParams();
    params.set("min_lat", box.minLat.toString());
    params.set("min_lon", box.minLon.toString());
    params.set("max_lat", box.maxLat.toString());
    params.set("max_lon", box.maxLon.toString());
    params.set("start", start);
    params.set("end", end);
    if (source) params.set("source", source);

    return `${this.baseUrl}/v1/hotspots.csv?${params.toString()}`;
  }

  /**
   * Download FIRMS hotspots CSV directly
   * GET /v1/hotspots.csv
   * Returns CSV text
   */
  async downloadHotspotsCsv(
    box: Box,
    start: string,
    end: string,
    source?: string,
  ): Promise<string> {
    const params = new URLSearchParams();
    params.set("min_lat", box.minLat.toString());
    params.set("min_lon", box.minLon.toString());
    params.set("max_lat", box.maxLat.toString());
    params.set("max_lon", box.maxLon.toString());
    params.set("start", start);
    params.set("end", end);
    if (source) params.set("source", source);

    const response = await fetch(
      `${this.baseUrl}/v1/hotspots.csv?${params.toString()}`,
      {
        headers: {
          Accept: "text/csv",
        },
      },
    );

    if (!response.ok) {
      const errorDetail = await this.readApiError(response);
      throw new FireCalendarApiError(
        `FireCalendar API /v1/hotspots.csv: ${errorDetail}`,
        response.status,
        errorDetail,
      );
    }

    return response.text();
  }

  /**
   * Fill missing months in AOI calendar with zeros
   * Based on the documentation's fillMonths helper (section 6.1)
   */
  static fillAoiMonths(rows: AoiRow[]): AoiRow[] {
    const byKey = new Map(rows.map((r) => [r.year * 12 + r.month, r]));
    const out: AoiRow[] = [];

    for (let y = 2001; y <= 2024; y++) {
      for (let m = 1; m <= 12; m++) {
        const key = y * 12 + m;
        const existing = byKey.get(key);
        if (existing) {
          out.push(existing);
        } else {
          // Determine source based on time period
          const t = y * 12 + m;
          let source: Source;
          if (t < 2002 * 12 + 7) {
            source = "backcast_terra";
          } else if (t < 2012 * 12 + 2) {
            source = "backcast";
          } else {
            source = "observed";
          }

          out.push({
            year: y,
            month: m,
            source,
            value: 0,
            modis: 0,
            viirs_model: 0,
            p_lo: 0,
            p_hi: 0,
            clim_median: null,
            pct_vs_ref: null,
          });
        }
      }
    }
    return out;
  }

  /**
   * Get the base URL being used
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }
}

/**
 * Convenience function to create a client with default settings
 */
export function createFireCalendarClient(
  baseUrl?: string,
): FireCalendarApiClient {
  return new FireCalendarApiClient(baseUrl);
}
