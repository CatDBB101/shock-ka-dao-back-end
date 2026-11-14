# คู่มือ API และข้อมูลสำหรับทีมเว็บ

## 1. ภาพรวมระบบ

เว็บไม่ได้รันโมเดลเอง โมเดลคำนวณทุกช่องทุกเดือนไว้ล่วงหน้าแล้ว เว็บแค่อ่านไฟล์ข้อมูล 4 ไฟล์ มี 2 วิธีให้เลือก ตัวเลขที่ได้เหมือนกันทุกหลัก:

|                                 | ทาง A · Bucket + DuckDB-WASM           | ทาง B · REST API                                      |
| ------------------------------- | -------------------------------------- | ----------------------------------------------------- |
| เซิร์ฟเวอร์                     | ไม่มี (ไฟล์สาธารณะอย่างเดียว)          | FastAPI ใน Docker                                     |
| ค่าใช้จ่าย                      | ฟรี                                    | Hugging Face Space ต้องใช้ PRO หรือบริการ Docker อื่น |
| สถานะ                           | bucket สร้างแล้ว รออัปโหลด             | ทดสอบในเครื่องผ่านแล้ว ยังไม่ deploy                  |
| ครั้งแรกที่เปิดหน้าเลือกพื้นที่ | เบราว์เซอร์โหลด parquet (สูงสุด 41 MB) | เร็ว เซิร์ฟเวอร์คำนวณให้                              |
| FIRMS MAP\_KEY                  | มองเห็นได้ในเบราว์เซอร์                | ซ่อนอยู่ฝั่งเซิร์ฟเวอร์                               |
| เหมาะกับ                        | เดโม hackathon (แนะนำ)                 | ใช้ระยะยาว หรือให้คนอื่นเรียก API                     |

&#91;embedded content: สถาปัตยกรรม FireCalendar+ · 2 ทางเลือกสำหรับทีมเว็บ\]

อ่านภาพ: แถวบนทำครั้งเดียวฝั่ง backend ได้ไฟล์ 4 ไฟล์ จากนั้นแยกเป็นทาง A หรือ B เส้นประคือการเรียกจุดไฟดิบจาก NASA ตอนผู้ใช้กดดาวน์โหลด CSV เท่านั้น

## 2. สัญญาข้อมูล (Data contract)

ทุกตัวเลขคือ **จำนวนจุดไฟที่ VIIRS S-NPP (375 ม.) น่าจะตรวจพบ** เฉพาะไฟพืชพรรณ รวมกลางวันและกลางคืน หน่วยเวลาคือเดือน ปี 2001–2024 ทุกแถวบอกที่มาของตัวเลขไว้ใน `source` เว็บจึงแสดงค่าที่วัดจริงกับค่าที่คำนวณต่างกันได้

### 2.1 ไฟล์ 4 ไฟล์ที่เว็บใช้

| ไฟล์                   | ขนาด    | จำนวนแถว                      | ใช้กับหน้าไหน                                    | อ่านด้วย                                        |
| ---------------------- | ------- | ----------------------------- | ------------------------------------------------ | ----------------------------------------------- |
| `manifest.json`        | 1 KB    | –                             | Evidence, footer เลขรุ่น                         | `fetch` ธรรมดา                                  |
| `calendar_region.json` | 340 KB  | 1,152 (4 ภูมิภาค × 288 เดือน) | หน้าแรก, ปฏิทินรายภูมิภาค, กราฟความต่อเนื่อง     | `fetch` ธรรมดา                                  |
| `cell_index.parquet`   | 0.98 MB | 122,824 ช่อง                  | แผนที่, การเลือกกรอบ lat/lon                     | DuckDB-WASM (ทาง A) หรือ API (ทาง B)            |
| `cell_month.parquet`   | 41 MB   | 7,526,543                     | ปฏิทินของพื้นที่ที่ผู้ใช้เลือกเอง, แผนที่รายช่อง | DuckDB-WASM หรือ API ห้ามโหลดทั้งไฟล์ด้วย fetch |

### 2.2 ค่าคงที่ (enum)

| ชื่อ     | ค่าที่เป็นไปได้  | ความหมาย                                                                          |
| -------- | ---------------- | --------------------------------------------------------------------------------- |
| `Region` | `africa`         | แองโกลา                                                                           |
|          | `south_america`  | อาร์เจนตินา + บราซิล                                                              |
|          | `canada_usa`     | แคนาดา + สหรัฐฯ                                                                   |
|          | `australia`      | ออสเตรเลีย                                                                        |
| `Source` | `observed`       | VIIRS วัดจริง (ก.พ. 2012 เป็นต้นไป) → สีเต็ม                                      |
|          | `backcast`       | แปลงจาก MODIS Terra+Aqua (ก.ค. 2002–ม.ค. 2012) → สี + ลายทแยง + ช่วงความไม่แน่นอน |
|          | `backcast_terra` | แปลงจาก Terra ดวงเดียว (พ.ย. 2000–มิ.ย. 2002) → ลายทแยงอ่อน + ป้าย "แม่นน้อยกว่า" |

### 2.3 `calendar_region.json` ทุกคอลัมน์

ระดับบนสุดของไฟล์: `data_version`, `model_id`, `generated`, `unit`, `sources` (คำอธิบาย source), `model_version`, `season` (ฤดูไฟต่อภูมิภาค), `rows` (อาร์เรย์ 1,152 แถว)

| คอลัมน์           | ชนิด   | หน่วย / ช่วง | ความหมายและการใช้บนเว็บ                                                   |
| ----------------- | ------ | ------------ | ------------------------------------------------------------------------- |
| `region`          | Region | 4 ค่า        | ภูมิภาค                                                                   |
| `year`            | int    | 2001–2024    | ปี (แถวของปฏิทิน)                                                         |
| `month`           | int    | 1–12         | เดือน (คอลัมน์ของปฏิทิน)                                                  |
| `source`          | Source | 3 ค่า        | ที่มาของค่า ใช้เลือกลาย/สี                                                |
| `value`           | float  | จุดไฟ ≥ 0    | **ตัวเลขหลัก** ใช้ระบายสีช่องปฏิทิน (observed = ค่าวัด, อื่นๆ = ค่าโมเดล) |
| `p_lo`            | float  | จุดไฟ        | ขอบล่างช่วงความไม่แน่นอน \~80% (= value เมื่อ observed)                   |
| `p_hi`            | float  | จุดไฟ        | ขอบบน (= value เมื่อ observed)                                            |
| `modis`           | int    | จุดไฟ MODIS  | ค่า MODIS ดิบ ใช้กับปุ่ม "ก่อนปรับเทียบ"                                  |
| `viirs_model`     | float  | จุดไฟ        | ค่าโมเดลแม้ในเดือนที่มี VIIRS จริง ใช้วาดกราฟตรวจความต่อเนื่อง            |
| `viirs_obs`       | int    | จุดไฟ        | ค่า VIIRS จริง (0 ก่อน ก.พ. 2012)                                         |
| `clim_median`     | float  | จุดไฟ        | มัธยฐานของเดือนนี้ในปี 2013–2024 (ค่า "ปกติ")                             |
| `ratio_vs_median` | float  | เท่า         | value ÷ clim\_median เช่น 2.05 = มากกว่าปกติ 2 เท่า                       |
| `pct_vs_ref`      | float  | 0–100        | สูงกว่าเดือนเดียวกันใน 2013–2024 กี่ % ของปี **≥ 90 = เดือนวิกฤต**        |

`season[region]` = `{ peak_month, start_month, end_month, method }` เช่น africa = พีค 8 เริ่ม 5 จบ 9; south\_america = 9 / 7 / 12; canada\_usa = 8 / 4 / 10; australia = 10 / 4 / 12

### 2.4 `cell_index.parquet` และ `cell_month.parquet`

| ไฟล์        | คอลัมน์ (ชนิด)                                                                                                                                                                                       | หมายเหตุ                                                                               |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| cell\_index | `h3` (string), `region` (string), `lat` (float32), `lon` (float32)                                                                                                                                   | `h3` เป็น string เช่น `85020113fffffff` ใช้กับ h3-js ได้ตรง, lat/lon = จุดกึ่งกลางช่อง |
| cell\_month | `h3` (string), `region` (string), `year` (int16), `month` (int8), `source` (string), `value` (float32), `modis` (int32), `viirs_model` (float32), `viirs_obs` (int32, **null** เมื่อไม่ใช่ observed) | เรียงตาม h3, year, month · **เก็บแบบบาง (sparse)**: เดือนที่แทบไม่มีไฟถูกตัดออก        |

**กฎสำคัญของข้อมูลแบบบาง:** ถ้าช่องหนึ่งไม่มีแถวของเดือนหนึ่ง ให้ถือเป็น **0** ถ้าช่องนั้นอยู่ใน cell\_index แต่ถ้าไม่อยู่ใน cell\_index เลย ให้แสดง **"ไม่มีข้อมูล"** (อยู่นอก 6 ประเทศ) ห้ามแสดงเป็น 0

### 2.5 `manifest.json`

| คีย์                        | ตัวอย่าง                                       | ใช้ทำอะไร                                                         |
| --------------------------- | ---------------------------------------------- | ----------------------------------------------------------------- |
| `data_version`              | `12bdb9ea0385`                                 | แสดงที่ footer, ต่อท้าย URL เพื่อล้าง cache เมื่อข้อมูลเปลี่ยน    |
| `model_id`, `model_version` | `v3-0afab45b08c6`, `v3`                        | หน้า Evidence                                                     |
| `generated`                 | `2026-11-14`                                   | วันที่สร้างข้อมูล                                                 |
| `files`                     | ชื่อไฟล์ 3 ไฟล์                                | อย่า hardcode ชื่อไฟล์ ให้อ่านจากตรงนี้                           |
| `final_test_poisson_dev`    | `1.0883`                                       | คะแนนข้อสอบปลายภาค (ยิ่งต่ำยิ่งดี)                                |
| `known_limitations`         | อาร์เรย์ข้อความ 4 ข้อ                          | แสดงทุกข้อบนหน้า Evidence                                         |
| `calendar_interval_ratios`  | `africa: {q10: 0.638, q50: 1.002, q90: 1.289}` | ตัวคูณช่วงความไม่แน่นอน: p\_lo = value × q10, p\_hi = value × q90 |

แก้ manifest ให้ตรงกับไฟล์จริงแล้ววันนี้: ชื่อไฟล์ใน `files` และลบข้อความเก่า "land cover not yet included" (รุ่น v3 ใช้ชนิดพื้นที่แล้ว) ไฟล์ใหม่อยู่ในโฟลเดอร์ firecalendar-handoff-files

### 2.6 TypeScript types (คัดลอกไปใช้ได้เลย ไฟล์ `src/types/firecalendar.ts`)

```typescript
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
  files: { calendar_region: string; cell_month: string; cell_index: string };
  final_test_poisson_dev: number;
  known_limitations: string[];
  calendar_interval_ratios: Record<Region, IntervalRatio>;
}

/** One month of a user-drawn box (from DuckDB or the API). */
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

export interface Box {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}
```

## 3. ทาง A · Bucket + DuckDB-WASM (ไม่ต้องมีเซิร์ฟเวอร์)

ทางนี้เว็บ React อ่านไฟล์ตรงจาก Hugging Face bucket แล้วคำนวณในเบราว์เซอร์ ไม่มี backend ให้ดูแล ไม่มีค่าเซิร์ฟเวอร์ ฝั่ง backend มีงานเดียวคืออัปโหลดไฟล์ให้ครบ

### 3.1 งานของฝั่ง backend (Ploy) ทำครั้งเดียว

1. เปิด https://huggingface.co/buckets/Ploychomphoo/firecalendar-data (bucket สาธารณะ สร้างแล้ว ตอนนี้ยังว่าง)
2. กด Upload แล้วลาก 4 ไฟล์: `manifest.json`, `calendar_region.json`, `cell_index.parquet`, `cell_month.parquet` (จากโฟลเดอร์ firecalendar-handoff-files)
   - หรือใช้คำสั่ง: `pip install -U huggingface_hub` → `hf auth login` → `hf buckets sync ./firecalendar-bucket hf://buckets/Ploychomphoo/firecalendar-data`
3. ทดสอบ: เปิด `https://huggingface.co/buckets/Ploychomphoo/firecalendar-data/resolve/manifest.json` ต้องเห็น JSON
4. ส่งลิงก์ BASE ให้เพื่อน: `https://huggingface.co/buckets/Ploychomphoo/firecalendar-data/resolve`

### 3.2 งานของฝั่ง frontend (เพื่อน)

1. ติดตั้ง: `npm i @duckdb/duckdb-wasm@1.29.0` (ล็อกเวอร์ชันนี้ ไฟล์ client ทดสอบกับรุ่นนี้)
2. คัดลอก `firecalendar-client.ts` ไปไว้ที่ `src/lib/firecalendar-client.ts` และ types จากข้อ 2.6 ไปที่ `src/types/firecalendar.ts`
3. ตั้ง `BASE` ในไฟล์ client เป็นลิงก์ bucket (ค่าเริ่มต้นตั้งไว้แล้ว) หรือย้ายไปเป็นตัวแปร `VITE_FC_BASE` ใน `.env`
4. เรียกฟังก์ชันตามตารางข้างล่าง

### 3.3 ฟังก์ชันใน `firecalendar-client.ts`

| ฟังก์ชัน                                           | รับ                                                                                       | คืน                                         | ทำงานอย่างไร                                                                                     |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `getManifest()`                                    | –                                                                                         | `Promise<Manifest>`                         | `fetch` manifest.json ครั้งเดียวแล้วเก็บไว้ในหน่วยความจำ                                         |
| `getCalendarRegion()`                              | –                                                                                         | `Promise<CalendarFile>`                     | `fetch` calendar\_region.json (340 KB) ทั้งไฟล์ แล้วกรองภูมิภาคเองฝั่งเว็บ                       |
| `getCalendarAoi(box, start, end)`                  | `Box`, `"YYYY-MM"`, `"YYYY-MM"` (ค่าเริ่มต้น 2001-01 ถึง 2024-12)                         | `Promise<AoiRow[]>` (+ `region`, `n_cells`) | ส่ง SQL ให้ DuckDB-WASM รวมค่าทุกช่องที่จุดกึ่งกลางอยู่ในกรอบ แล้วคำนวณ p\_lo/p\_hi จาก manifest |
| `getHotspotsCsv(box, start, end, mapKey, source?)` | `Box`, `"YYYY-MM-DD"` ×2 (≤ 60 วัน), FIRMS MAP\_KEY, source (ค่าเริ่มต้น `VIIRS_SNPP_SP`) | `Promise<string>` (CSV)                     | เรียก FIRMS area API ทีละ 5 วัน แล้วต่อ CSV ให้มี header เดียว                                   |

ข้อควรระวังของ `getHotspotsCsv`: MAP\_KEY จะมองเห็นได้ในเบราว์เซอร์ ใช้ key ฟรีที่ขอจาก https://firms.modaps.eosdis.nasa.gov/api/map\_key เท่านั้น ถ้าไม่อยากให้เห็น key ให้ใช้ endpoint `/v1/hotspots.csv` ของทาง B แทน

### 3.4 SQL ที่ `getCalendarAoi` ส่งให้ DuckDB (อธิบายทีละบรรทัด)

```sql
-- 1) หาช่อง H3 ที่จุดกึ่งกลางอยู่ในกรอบ
WITH cells AS (
  SELECT h3, region FROM read_parquet('{BASE}/cell_index.parquet')
  WHERE lat BETWEEN :min_lat AND :max_lat AND lon BETWEEN :min_lon AND :max_lon),
-- 2) ดึงข้อมูลรายเดือนของช่องเหล่านั้น
m AS (SELECT * FROM read_parquet('{BASE}/cell_month.parquet')
      WHERE h3 IN (SELECT h3 FROM cells)),
-- 3) รวมทุกช่องเป็นยอดรายเดือน ในช่วงที่ขอ (t = year*12 + month)
agg AS (SELECT year, month, sum(value) AS value, sum(modis) AS modis,
               sum(viirs_model) AS viirs_model, mode(source) AS source
        FROM m WHERE year*12+month BETWEEN :t0 AND :t1 GROUP BY ALL),
-- 4) ยอดของปีอ้างอิง 2013-2024 (ไม่สนช่วงที่ขอ)
ref AS (SELECT year, month, sum(value) AS v FROM m
        WHERE year BETWEEN 2013 AND 2024 GROUP BY ALL),
-- 5) ค่าปกติ = มัธยฐานของแต่ละเดือน
clim AS (SELECT month, median(v) AS clim_median FROM ref GROUP BY month)
-- 6) ผลลัพธ์ + เปอร์เซ็นไทล์เทียบปีอ้างอิง
SELECT a.year, a.month, a.source, a.value, a.modis, a.viirs_model, c.clim_median,
  (SELECT 100.0 * count(*) FILTER (WHERE r.v <= a.value) / count(*)
     FROM ref r WHERE r.month = a.month) AS pct_vs_ref,
  (SELECT mode(region) FROM cells) AS region,
  (SELECT count(*) FROM cells) AS n_cells
FROM agg a LEFT JOIN clim c USING (month) ORDER BY a.year, a.month;
```

หลังได้ผล ฝั่ง client คำนวณช่วงความไม่แน่นอน: ถ้า `source = observed` → `p_lo = p_hi = value` ไม่อย่างนั้น `p_lo = value × q10`, `p_hi = value × q90` ของภูมิภาคนั้นจาก `manifest.calendar_interval_ratios`

### 3.5 ตัวอย่างผลลัพธ์จริง

กรอบรอบเมืองโรซาริโอ อาร์เจนตินา (`minLat −34.5, minLon −61, maxLat −32.5, maxLon −58.5`) เดือน ส.ค. 2022 ได้ 282 ช่อง:

```json
[
  {
    "year": 2022,
    "month": 8,
    "source": "observed",
    "value": 6593,
    "modis": 1310,
    "viirs_model": 5456.01,
    "clim_median": 299,
    "pct_vs_ref": 91.67,
    "p_lo": 6593,
    "p_hi": 6593,
    "region": "south_america",
    "n_cells": 282
  }
]
```

อ่านว่า: ส.ค. 2022 พื้นที่นี้มีไฟ 6,593 จุด (VIIRS วัดจริง) สูงกว่า ส.ค. ปีอื่นๆ ใน 2013–2024 ราว 92% ของปี จึงเป็นเดือนวิกฤต

### 3.6 เรื่องที่ต้องทดสอบก่อนใช้จริง

- **CORS และ Range request:** DuckDB-WASM อ่าน parquet เป็นช่วงๆ ผ่าน HTTP Range ยังไม่ได้ทดสอบกับลิงก์ bucket จริง ถ้าเบราว์เซอร์ขึ้น error CORS ให้ใช้ทางสำรองข้างล่าง
- **ทางสำรอง (ง่ายที่สุด):** วาง 4 ไฟล์ไว้ในโฟลเดอร์ `public/data/` ของโปรเจกต์ React แล้วตั้ง `BASE = "/data"` ไฟล์จะมาจากโดเมนเดียวกับเว็บ ไม่มีปัญหา CORS
- **ขนาดที่โหลด:** ครั้งแรกอาจโหลด cell\_month.parquet บางส่วนหรือทั้งไฟล์ (สูงสุด 41 MB) แสดง loading ระหว่างรอ หน้าปฏิทินภูมิภาคใช้แค่ JSON 340 KB จึงเปิดเร็ว

## 4. ทาง B · REST API (FastAPI)

API มี 5 เส้นทาง ทุกเส้นเป็น **GET** อ่านอย่างเดียว ไม่มี request body ไม่ต้อง login ส่งค่าผ่าน query string เท่านั้น ตัวอย่างทุกตัวด้านล่างมาจากการรัน API จริงในเครื่องเมื่อ 14 พ.ย. 2026

- **Base URL:** ตอนทดสอบ `http://localhost:7860` · ถ้าขึ้น Hugging Face Space จะเป็น `https://ploychomphoo-firecalendar-api.hf.space` (ชื่อตาม Space ที่สร้าง)
- **เอกสารอัตโนมัติ:** เปิด `{BASE}/docs` จะเห็น Swagger UI ลองกดเรียกได้ และ `{BASE}/openapi.json` สำหรับสร้าง type อัตโนมัติ (เช่น `npx openapi-typescript {BASE}/openapi.json -o src/types/api.ts`)
- **รูปแบบคำตอบ:** JSON (UTF-8) ยกเว้น `/health` (ข้อความ) และ `/v1/hotspots.csv` (CSV)
- **CORS:** เปิดทุกโดเมน (`access-control-allow-origin: *`) จำกัดได้ด้วยตัวแปร `CORS_ORIGINS`
- **เวอร์ชัน:** อยู่ใน path `/v1/` ถ้าเปลี่ยนรูปแบบคำตอบในอนาคตจะเป็น `/v2/`

### 4.1 ภาพรวม endpoint

| Method | Path                  | Auth                                   | คืน              | ใช้กับหน้า                       |
| ------ | --------------------- | -------------------------------------- | ---------------- | -------------------------------- |
| GET    | `/health`             | ไม่ต้อง                                | `ok`             | ตรวจว่า API ตื่นไหม              |
| GET    | `/v1/meta`            | ไม่ต้อง                                | `Meta`           | Evidence, footer, ตั้งค่าหน้าแรก |
| GET    | `/v1/calendar/region` | ไม่ต้อง                                | `RegionCalendar` | ปฏิทินภูมิภาค                    |
| GET    | `/v1/calendar/aoi`    | ไม่ต้อง                                | `AoiCalendar`    | ปฏิทินของกรอบที่ผู้ใช้วาด        |
| GET    | `/v1/hotspots.csv`    | ไม่ต้อง (เซิร์ฟเวอร์ถือ FIRMS key เอง) | ไฟล์ CSV         | ปุ่มดาวน์โหลดจุดไฟดิบ            |

### 4.2 GET /health

- **Query:** ไม่มี · **200:** `text/plain` คำว่า `ok`
- ใช้ปลุก Space ที่หลับอยู่ก่อนเปิดหน้า (Space ฟรีหลับเมื่อไม่มีคนใช้ ครั้งแรกอาจช้าหลายสิบวินาที)

```bash
curl https://ploychomphoo-firecalendar-api.hf.space/health
# ok
```

### 4.3 GET /v1/meta

- **Query:** ไม่มี · **200:** `Meta` = ทุกคีย์ของ manifest.json + คีย์เสริม 7 ตัวด้านล่าง

| คีย์เสริม       | ชนิด                                     | ความหมาย                              |
| --------------- | ---------------------------------------- | ------------------------------------- |
| `unit`          | string                                   | หน่วยของตัวเลข                        |
| `sources`       | Record\<Source, string>                  | คำอธิบายแต่ละ source (ใช้เป็น legend) |
| `season`        | Record\<Region, Season>                  | ฤดูไฟต่อภูมิภาค                       |
| `regions`       | Region\[\]                               | รายชื่อภูมิภาค (สร้างแท็บจากตรงนี้)   |
| `years`         | \[number, number\]                       | `[2001, 2024]`                        |
| `coverage_bbox` | {min\_lat, max\_lat, min\_lon, max\_lon} | กรอบที่มีข้อมูล ใช้ตั้งขอบแผนที่      |
| `n_cells`       | number                                   | 122,824                               |

```bash
curl https://ploychomphoo-firecalendar-api.hf.space/v1/meta
```

```json
{
  "data_version": "12bdb9ea0385",
  "model_id": "v3-0afab45b08c6",
  "model_version": "v3",
  "generated": "2026-11-14",
  "files": {
    "calendar_region": "calendar_region.json",
    "cell_month": "cell_month.parquet",
    "cell_index": "cell_index.parquet"
  },
  "final_test_poisson_dev": 1.0883056172339125,
  "known_limitations": [
    "largest fire months underestimated ...",
    "Terra-only period ...",
    "cell-level 80% intervals ...",
    "monthly unit, 6 countries ..."
  ],
  "calendar_interval_ratios": {
    "africa": { "q10": 0.6383, "q50": 1.002, "q90": 1.2889 },
    "...": {}
  },
  "unit": "VIIRS S-NPP-equivalent fire-pixel detections (375 m), vegetation fires, day+night",
  "sources": {
    "observed": "measured by VIIRS S-NPP",
    "backcast": "reconstructed from MODIS Terra+Aqua",
    "backcast_terra": "reconstructed from MODIS Terra only (less accurate)"
  },
  "season": {
    "africa": {
      "peak_month": 8,
      "start_month": 5,
      "end_month": 9,
      "method": "cumulative 10-90% ..."
    },
    "...": {}
  },
  "regions": ["africa", "south_america", "canada_usa", "australia"],
  "years": [2001, 2024],
  "coverage_bbox": {
    "min_lat": -54.91,
    "max_lat": 82.56,
    "min_lon": -176.57,
    "max_lon": 179.52
  },
  "n_cells": 122824
}
```

### 4.4 GET /v1/calendar/region

| Query    | ชนิด      | จำเป็น | ค่าเริ่มต้น | กฎ                                    |
| -------- | --------- | ------ | ----------- | ------------------------------------- |
| `region` | Region    | ใช่    | –           | หนึ่งใน 4 ค่า ไม่งั้น 422             |
| `start`  | `YYYY-MM` | ไม่    | `2001-01`   | รับ `YYYY-MM-DD` ได้ (ใช้แค่ปี-เดือน) |
| `end`    | `YYYY-MM` | ไม่    | `2024-12`   | ต้องไม่ก่อน start ไม่งั้น 400         |

**200:** `{ region, season, rows: CalendarRow[] }` เรียงตามปี เดือน ครบทุกเดือน (ไม่มีเดือนหาย)

```bash
curl "https://ploychomphoo-firecalendar-api.hf.space/v1/calendar/region?region=south_america&start=2010-08&end=2010-09"
```

```json
{
  "region": "south_america",
  "season": {
    "peak_month": 9,
    "start_month": 7,
    "end_month": 12,
    "method": "cumulative 10-90% ..."
  },
  "rows": [
    {
      "region": "south_america",
      "year": 2010,
      "month": 8,
      "source": "backcast",
      "value": 591271.75,
      "modis": 169291,
      "viirs_model": 591271.75,
      "viirs_obs": 0,
      "p_lo": 451326.28,
      "p_hi": 672166.71,
      "clim_median": 287929.5,
      "pct_vs_ref": 100.0,
      "ratio_vs_median": 2.05
    },
    {
      "region": "south_america",
      "year": 2010,
      "month": 9,
      "source": "backcast",
      "value": 806317.13,
      "modis": 218254,
      "viirs_model": 806317.13,
      "viirs_obs": 0,
      "p_lo": 615473.52,
      "p_hi": 916633.56,
      "clim_median": 395560.5,
      "pct_vs_ref": 100.0,
      "ratio_vs_median": 2.04
    }
  ]
}
```

อ่านว่า: ส.ค. 2010 อเมริกาใต้มีไฟราว 591,000 จุด (แปลงจาก MODIS ช่วงที่น่าจะเป็น 451,000–672,000) มากกว่าปกติ 2 เท่า สูงกว่าทุกปีอ้างอิง → เดือนวิกฤต

### 4.5 GET /v1/calendar/aoi

| Query                | ชนิด      | จำเป็น | กฎ                                                             |
| -------------------- | --------- | ------ | -------------------------------------------------------------- |
| `min_lat`, `max_lat` | number    | ใช่    | −90 ถึง 90 และ min < max                                       |
| `min_lon`, `max_lon` | number    | ใช่    | −180 ถึง 180 และ min < max (กรอบที่ข้ามเส้น 180° ยังไม่รองรับ) |
| `start`, `end`       | `YYYY-MM` | ไม่    | ค่าเริ่มต้น 2001-01 / 2024-12                                  |

**ทำงานอย่างไร:** เลือกช่อง H3 ที่จุดกึ่งกลางอยู่ในกรอบ → รวมค่ารายเดือน → ใส่ช่วงความไม่แน่นอนตามภูมิภาคที่มีช่องมากที่สุด → คำนวณค่าปกติและเปอร์เซ็นไทล์จากปี 2013–2024 ทั้งชุด (ไม่ขึ้นกับ start/end)

**200:** `{ cells: number, region: Region, note: string, rows: AoiRow[] }` — เดือนที่ทั้งกรอบไม่มีไฟเลยจะ **ไม่มีแถว** ฝั่งเว็บต้องเติมเป็น 0 เอง (ดูข้อ 5)

```bash
curl "https://ploychomphoo-firecalendar-api.hf.space/v1/calendar/aoi?min_lat=-34.5&min_lon=-61&max_lat=-32.5&max_lon=-58.5&start=2022-08&end=2022-08"
```

```json
{
  "cells": 282,
  "region": "south_america",
  "note": "ranges use region-level monthly ratios; single cells are uncertain",
  "rows": [
    {
      "year": 2022,
      "month": 8,
      "value": 6593.0,
      "modis": 1310,
      "viirs_model": 5456.01,
      "source": "observed",
      "p_lo": 6593.0,
      "p_hi": 6593.0,
      "clim_median": 299.0,
      "pct_vs_ref": 91.67
    }
  ]
}
```

### 4.6 GET /v1/hotspots.csv

| Query                                      | ชนิด         | จำเป็น | กฎ                                                                                                                                                            |
| ------------------------------------------ | ------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `min_lat`, `min_lon`, `max_lat`, `max_lon` | number       | ใช่    | เหมือน aoi                                                                                                                                                    |
| `start`, `end`                             | `YYYY-MM-DD` | ใช่    | 1–60 วัน และ start ≤ end                                                                                                                                      |
| `source`                                   | string       | ไม่    | ค่าเริ่มต้น `VIIRS_SNPP_SP` · เลือกได้: `MODIS_SP`, `MODIS_NRT`, `VIIRS_SNPP_SP`, `VIIRS_SNPP_NRT`, `VIIRS_NOAA20_SP`, `VIIRS_NOAA20_NRT`, `VIIRS_NOAA21_NRT` |

**200:** `text/csv` พร้อม header `Content-Disposition: attachment; filename="firms_{source}_{start}_{end}.csv"` เบราว์เซอร์จะดาวน์โหลดทันที คอลัมน์เป็นของ FIRMS (latitude, longitude, bright\_ti4, scan, track, acq\_date, acq\_time, satellite, confidence, version, bright\_ti5, frp, daynight) ถ้า FIRMS ตอบพลาดบางช่วง จะมีบรรทัดขึ้นต้นด้วย `#` บอกช่วงที่หาย ต้องตั้ง secret `FIRMS_MAP_KEY` บน Space ก่อน ไม่งั้นได้ 503

```bash
curl -OJ "https://ploychomphoo-firecalendar-api.hf.space/v1/hotspots.csv?min_lat=-34.5&min_lon=-61&max_lat=-32.5&max_lon=-58.5&start=2022-08-01&end=2022-08-10"
```

บนเว็บไม่ต้อง fetch ให้ใช้ `<a href={hotspotsCsvUrl(box, start, end)} download>` จากไฟล์ `firecalendar-api-client.ts`

### 4.7 ไฟล์ client ของทาง B (`firecalendar-api-client.ts`)

| ฟังก์ชัน                                   | เรียก                 | คืน                       |
| ------------------------------------------ | --------------------- | ------------------------- |
| `getMeta()`                                | `/v1/meta`            | `Promise<Meta>`           |
| `getRegionCalendar(region, start?, end?)`  | `/v1/calendar/region` | `Promise<RegionCalendar>` |
| `getAoiCalendar(box, start?, end?)`        | `/v1/calendar/aoi`    | `Promise<AoiCalendar>`    |
| `hotspotsCsvUrl(box, start, end, source?)` | สร้าง URL เท่านั้น    | `string`                  |

ตั้ง `VITE_FIRECALENDAR_API=https://ploychomphoo-firecalendar-api.hf.space` ใน `.env` ถ้าไม่ตั้งจะใช้ `http://localhost:7860` ทุกฟังก์ชันโยน `Error("FireCalendar API {path}: {detail}")` เมื่อสถานะไม่ใช่ 2xx

### 4.8 รัน API ในเครื่องตัวเอง (สำหรับทดสอบก่อนขึ้นจริง)

```bash
cd space
pip install -r requirements.txt     # fastapi, uvicorn, polars, h3, httpx, numpy
# data/ ต้องมี manifest.json, calendar_region.json, cell_month.parquet, cell_index.parquet
uvicorn app:app --port 7860
# หรือด้วย Docker
docker build -t firecalendar-api . && docker run -p 7860:7860 -e FIRMS_MAP_KEY=xxxx firecalendar-api
```

## 5. ข้อผิดพลาดและกรณีขอบ

ทุก error ของ API มี body เป็น JSON ที่มีคีย์ `detail` เสมอ แต่มี 2 รูปแบบ: ข้อความ (400/404/503) และอาร์เรย์ (422 จาก FastAPI) ฝั่งเว็บควรรองรับทั้งสอง

### 5.1 รหัสสถานะและข้อความจริง

| สถานะ | เกิดเมื่อ                                                                       | `detail` ที่ได้จริง                                                                                                      | หน้าเว็บควรแสดง                            |
| ----- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| 400   | รูปแบบเดือนผิด                                                                  | `start must look like YYYY-MM or YYYY-MM-DD, got '2024-13'`                                                              | "เลือกเดือนใหม่"                           |
| 400   | start หลัง end                                                                  | `start is after end`                                                                                                     | สลับให้อัตโนมัติก่อนส่ง                    |
| 400   | min ≥ max                                                                       | `min_lat/min_lon must be smaller than max_lat/max_lon`                                                                   | ให้วาดกรอบใหม่                             |
| 400   | จุดไฟดิบเกิน 60 วัน                                                             | `date range must be 1-60 days and start <= end`                                                                          | "เลือกได้ไม่เกิน 60 วัน"                   |
| 404   | กรอบไม่มีช่องที่มีข้อมูล                                                        | `no covered cells in this box (this version covers Angola, Argentina, Brazil, Canada, United States, Australia)`         | "พื้นที่นี้ยังไม่มีข้อมูล" + รายชื่อประเทศ |
| 422   | ค่าไม่ผ่านกฎชนิด (ภูมิภาคผิด, lat > 90, ขาด query ที่จำเป็น)                    | อาร์เรย์ เช่น `[{"type":"literal_error","loc":["query","region"],"msg":"Input should be 'africa', ...","input":"asia"}]` | เป็นบั๊กฝั่งเว็บ ควรตรวจค่าก่อนส่ง         |
| 503   | ยังไม่ตั้ง FIRMS key                                                            | `raw hotspot export is not configured: set the FIRMS_MAP_KEY secret on the Space`                                        | ซ่อนปุ่มดาวน์โหลด                          |
| 500   | ไฟล์ข้อมูลบนเซิร์ฟเวอร์หายหรือเสีย (API ไม่ตอบเลย หรือได้ 502 จาก Hugging Face) | API จะไม่เปิดตั้งแต่แรก (log: `missing data file ...`)                                                                   | "ระบบไม่พร้อม" + ปุ่มลองใหม่               |

### 5.2 ฟังก์ชันอ่าน error ทั้ง 2 รูปแบบ

```typescript
export async function readApiError(r: Response): Promise<string> {
  try {
    const body = await r.json();
    if (typeof body.detail === "string") return body.detail; // 400 / 404 / 503
    if (Array.isArray(body.detail))
      // 422
      return body.detail
        .map((d: any) => `${d.loc?.at(-1)}: ${d.msg}`)
        .join("; ");
  } catch {
    /* not JSON */
  }
  return `HTTP ${r.status}`;
}
```

### 5.3 กรณีขอบที่ต้องจัดการฝั่งเว็บ

1. **เดือนที่หายไปในกรอบที่ผู้ใช้วาด:** ทั้งทาง A และ B คืนเฉพาะเดือนที่มีไฟ ให้สร้างตาราง 288 เดือนเต็มแล้วเติม `value = 0` (โค้ดในข้อ 6) ช่องที่เติมให้ใช้ `source` ตามช่วงเวลา (ก่อน ก.ค. 2002 = backcast\_terra, ก่อน ก.พ. 2012 = backcast, หลังจากนั้น = observed)
2. **เปอร์เซ็นไทล์ของกรอบเล็ก:** ปีอ้างอิงที่ไม่มีไฟเลยไม่ถูกนับในการคำนวณ `pct_vs_ref` กับ `clim_median` กรอบเล็กที่ไฟน้อยจึงอาจได้ค่าสูงเกินจริง แนะนำแสดง "เดือนวิกฤต" เมื่อ `cells ≥ 20` เท่านั้น และค่า `null` ให้แสดง "–"
3. **กรอบที่ครอบหลายภูมิภาค:** ช่วงความไม่แน่นอนใช้ตัวคูณของภูมิภาคที่มีช่องมากที่สุด (`region` ในคำตอบ) แสดงข้อความ `note` ใต้กราฟ
4. **กรอบใหญ่มาก:** ทำงานได้แต่ช้าลง แนะนำให้ใช้ปฏิทินภูมิภาคแทนเมื่อกรอบกว้างเกิน \~20° × 20°
5. **กรอบข้ามเส้นแบ่งเขตวัน (180°):** ยังไม่รองรับ ให้แบ่งเป็นสองกรอบแล้วรวมผลเอง (กระทบแค่บางส่วนของอลาสก้า)
6. **ค่าทศนิยม:** `value` ของ backcast เป็นทศนิยม (ค่าคาดหมาย) ตอนแสดงให้ปัดเป็นจำนวนเต็ม และใส่คำว่า "ประมาณ" นำหน้า
7. **ช่วงความไม่แน่นอนของช่องเดียว:** ไม่ควรแสดง p\_lo/p\_hi บนแผนที่รายช่อง เพราะตัวคูณคำนวณมาจากระดับภูมิภาค (ช่วงรายช่องครอบคลุมจริงแค่ 58–65%)
8. **ปี 2001 ช่วง Terra ดับ:** เดือน มิ.ย.–ก.ค. 2001 ค่าต่ำกว่าจริงแต่ยังไม่มีธงในข้อมูล แนะนำใส่หมายเหตุบนหน้า Evidence

## 6. ตัวอย่างโค้ด React

โค้ดนี้ผ่านการตรวจ TypeScript แบบ strict กับ React 18 แล้ว ไฟล์เต็มอยู่ในโฟลเดอร์ firecalendar-handoff-files: `firecalendar-react-examples.tsx` และ `firecalendar-types.ts` ตัวอย่างใช้ทาง A (`BASE = "/data"` หรือลิงก์ bucket) ถ้าใช้ทาง B ให้สลับ fetch เป็นฟังก์ชันใน `firecalendar-api-client.ts`

### 6.1 ตัวช่วยจัดการข้อมูล

```typescript
// เดือนนี้มาจากแหล่งไหน (ใช้ตอนเติมเดือนที่หาย)
export function sourceFor(year: number, month: number): Source {
  const t = year * 12 + month;
  if (t < 2002 * 12 + 7) return "backcast_terra"; // ก่อน ก.ค. 2002
  if (t < 2012 * 12 + 2) return "backcast"; // ก่อน ก.พ. 2012
  return "observed";
}

// สร้างตารางครบ 288 เดือน เดือนที่ไม่มีแถว = 0
export function fillMonths<
  T extends { year: number; month: number; value: number },
>(rows: T[]): (T | AoiRow)[] {
  const byKey = new Map(rows.map((r) => [r.year * 12 + r.month, r]));
  const out: (T | AoiRow)[] = [];
  for (let y = 2001; y <= 2024; y++)
    for (let m = 1; m <= 12; m++) {
      out.push(
        byKey.get(y * 12 + m) ?? {
          year: y,
          month: m,
          source: sourceFor(y, m),
          value: 0,
          modis: 0,
          viirs_model: 0,
          p_lo: 0,
          p_hi: 0,
          clim_median: null,
          pct_vs_ref: null,
        },
      );
    }
  return out;
}

// แบ่งสี 5 ระดับจาก quantile ของ log(value+1) (ค่าไฟกระจายกว้างมาก สเกลเส้นตรงจะเห็นแต่เดือนพีค)
export function colourSteps(
  values: number[],
): (v: number) => 0 | 1 | 2 | 3 | 4 {
  const lv = values.map((v) => Math.log10(v + 1)).sort((a, b) => a - b);
  const q = (p: number) => lv[Math.floor(p * (lv.length - 1))] ?? 0;
  const cuts = [q(0.2), q(0.45), q(0.7), q(0.9)];
  return (v) =>
    cuts.filter((c) => Math.log10(v + 1) > c).length as 0 | 1 | 2 | 3 | 4;
}
```

### 6.2 Hook โหลดปฏิทินภูมิภาค

```typescript
export function useRegionCalendar(region: Region) {
  const [file, setFile] = useState<CalendarFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`${BASE}/calendar_region.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<CalendarFile>;
      })
      .then((f) => {
        if (alive) setFile(f);
      })
      .catch((e) => {
        if (alive) setError(String(e));
      });
    return () => {
      alive = false;
    };
  }, []); // โหลดครั้งเดียว เปลี่ยนภูมิภาคไม่ต้องโหลดใหม่
  const rows = useMemo<CalendarRow[]>(
    () => file?.rows.filter((r) => r.region === region) ?? [],
    [file, region],
  );
  return {
    rows,
    season: file?.season[region],
    sources: file?.sources,
    error,
    loading: !file && !error,
  };
}
```

### 6.3 คอมโพเนนต์ปฏิทิน 24 ปี × 12 เดือน

```tsx
const MONTHS = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];
const LABEL: Record<Source, string> = {
  observed: "VIIRS วัดจริง",
  backcast: "แปลงจาก MODIS",
  backcast_terra: "แปลงจาก Terra (แม่นน้อยกว่า)",
};

type Cell = {
  year: number;
  month: number;
  source: Source;
  value: number;
  p_lo: number;
  p_hi: number;
  pct_vs_ref: number | null;
};

export function CalendarGrid({
  rows,
  onPick,
}: {
  rows: Cell[];
  onPick?: (c: Cell) => void;
}) {
  const step = useMemo(() => colourSteps(rows.map((r) => r.value)), [rows]);
  return (
    <div
      role="grid"
      style={{
        display: "grid",
        gridTemplateColumns: "48px repeat(12, 1fr)",
        gap: 3,
      }}
    >
      <div />
      {MONTHS.map((m) => (
        <div key={m} role="columnheader">
          {m}
        </div>
      ))}
      {Array.from({ length: 24 }, (_, i) => 2001 + i).map((y) => [
        <div key={`y${y}`} role="rowheader">
          {y}
        </div>,
        ...rows
          .filter((r) => r.year === y)
          .sort((a, b) => a.month - b.month)
          .map((r) => (
            <button
              key={`${y}-${r.month}`}
              role="gridcell"
              className={`fc-cell lvl-${step(r.value)} src-${r.source}${(r.pct_vs_ref ?? 0) >= 90 ? " critical" : ""}`}
              title={
                `${MONTHS[r.month - 1]} ${y}: ~${Math.round(r.value).toLocaleString()} จุด (${LABEL[r.source]})` +
                (r.source === "observed"
                  ? ""
                  : ` ช่วง ${Math.round(r.p_lo).toLocaleString()}–${Math.round(r.p_hi).toLocaleString()}`)
              }
              onClick={() => onPick?.(r)}
            />
          )),
      ])}
    </div>
  );
}
```

CSS ที่ควรมี: `.lvl-0` ถึง `.lvl-4` = สีอ่อน→เข้ม, `.src-backcast` = ลายทแยง (`repeating-linear-gradient`), `.src-backcast_terra` = ลายทแยงถี่กว่า, `.critical` = กรอบหนา ดูตัวอย่างสีได้จากหน้า "FireCalendar+ ฉบับเข้าใจง่าย"

### 6.4 หน้าต่างๆ

```tsx
export function RegionCalendarPage({ region }: { region: Region }) {
  const { rows, season, error, loading } = useRegionCalendar(region);
  if (loading) return <p>กำลังโหลด…</p>;
  if (error) return <p role="alert">โหลดปฏิทินไม่สำเร็จ: {error}</p>;
  return (
    <section>
      {season && (
        <p>
          ฤดูไฟ: {MONTHS[season.start_month - 1]}–{MONTHS[season.end_month - 1]}{" "}
          · พีค {MONTHS[season.peak_month - 1]}
        </p>
      )}
      <CalendarGrid rows={rows} />
    </section>
  );
}

// fetchAoi = getCalendarAoi (ทาง A) หรือ b => getAoiCalendar(b).then(r => r.rows) (ทาง B)
export function AoiCalendarPage({
  box,
  fetchAoi,
}: {
  box: Box;
  fetchAoi: (b: Box) => Promise<AoiRow[]>;
}) {
  const [rows, setRows] = useState<AoiRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setRows(null);
    setErr(null);
    fetchAoi(box)
      .then((r) => setRows(fillMonths(r) as AoiRow[]))
      .catch((e) => setErr(String(e)));
  }, [box.minLat, box.minLon, box.maxLat, box.maxLon]);
  if (err) return <p role="alert">{err}</p>;
  if (!rows) return <p>กำลังคำนวณพื้นที่ที่เลือก…</p>;
  return <CalendarGrid rows={rows} />;
}

export function EvidencePage() {
  const m = useManifest();
  if (!m) return null;
  return (
    <section>
      <p>
        ข้อมูลรุ่น {m.data_version} · โมเดล {m.model_id} · สร้างเมื่อ{" "}
        {m.generated}
      </p>
      <p>
        คะแนนข้อสอบปลายภาค (Poisson deviance, ยิ่งต่ำยิ่งดี):{" "}
        {m.final_test_poisson_dev.toFixed(2)} เทียบวิธีคูณเลข 5.17
      </p>
      <ul>
        {m.known_limitations.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </section>
  );
}
```

### 6.5 สิ่งที่แต่ละหน้าต้องมี (ตาม ADR-014)

| หน้า                     | ข้อมูล                                            | สิ่งที่ต้องแสดง                                                        |
| ------------------------ | ------------------------------------------------- | ---------------------------------------------------------------------- |
| หน้าแรก / แท็บ 4 ภูมิภาค | calendar\_region.json                             | ปฏิทิน, ฤดูไฟ, legend ของ source, กรอบเดือนวิกฤต                       |
| เลือกพื้นที่เอง          | cell\_index + cell\_month (หรือ /v1/calendar/aoi) | กล่องกรอก lat/lon หรือลากบนแผนที่, จำนวนช่อง, ปฏิทิน, ปุ่มโหลด CSV     |
| กราฟความต่อเนื่อง        | calendar\_region.json (รวมรายปี)                  | เส้น `modis` (ก่อน) vs `value` (หลัง) vs `viirs_model` ช่วงที่มี VIIRS |
| Evidence                 | manifest.json                                     | เลขรุ่น, คะแนน, ข้อจำกัดทุกข้อ, ลิงก์กราฟ 13 และ 15                    |

## 7. Deploy, CORS, cache และเช็กลิสต์

### 7.1 Deploy ทาง B บน Hugging Face Space (ต้องมีบัญชี PRO หรือใช้บริการ Docker อื่น เช่น Render, Fly.io, Railway)

1. สร้าง Space ใหม่ เลือก SDK = Docker (ไฟล์ `README.md` มี `sdk: docker` และ `app_port: 7860` อยู่แล้ว)
2. อัปโหลด `app.py`, `Dockerfile`, `requirements.txt`, `README.md` และโฟลเดอร์ `data/` ที่มี 4 ไฟล์เดียวกับ bucket (ไฟล์ใหญ่กว่า 10 MB ต้องผ่าน Git LFS ซึ่ง `.gitattributes` ตั้งไว้แล้ว)
3. Settings → Variables and secrets: เพิ่ม secret `FIRMS_MAP_KEY` (ขอฟรีที่ firms.modaps.eosdis.nasa.gov/api/map\_key) และ variable `CORS_ORIGINS` = โดเมนเว็บจริง เช่น `https://firecalendar.vercel.app` (คั่นด้วย `,` ได้หลายโดเมน)
4. รอ build เสร็จ แล้วเปิด `{BASE}/health` ต้องได้ `ok` และ `{BASE}/docs` ต้องเห็น Swagger
5. ส่ง BASE URL ให้เพื่อนใส่ใน `VITE_FIRECALENDAR_API`

| ตัวแปร                                   | ที่              | ค่าเริ่มต้น                                  | จำเป็น                  |
| ---------------------------------------- | ---------------- | -------------------------------------------- | ----------------------- |
| `FIRMS_MAP_KEY`                          | backend (secret) | ไม่มี → /v1/hotspots.csv ตอบ 503             | เฉพาะถ้าให้โหลดจุดไฟดิบ |
| `CORS_ORIGINS`                           | backend          | `*`                                          | ควรตั้งตอนขึ้นจริง      |
| `FC_DATA_DIR`                            | backend          | `./data` (ใน Docker = `/home/user/app/data`) | ไม่                     |
| `VITE_FIRECALENDAR_API`                  | frontend `.env`  | `http://localhost:7860`                      | ทาง B                   |
| `VITE_FC_BASE` (ถ้าย้าย BASE ออกจากโค้ด) | frontend `.env`  | ลิงก์ bucket                                 | ทาง A                   |

### 7.2 Cache และการอัปเดตข้อมูล

- ข้อมูลเปลี่ยนก็ต่อเมื่อเทรนใหม่เท่านั้น (ไม่เปลี่ยนระหว่างวัน) จึง cache ได้นาน
- ทุกครั้งที่มีข้อมูลใหม่ `data_version` ใน manifest จะเปลี่ยน ให้เว็บต่อท้าย URL เช่น `calendar_region.json?v=12bdb9ea0385` เบราว์เซอร์จะโหลดใหม่เอง
- manifest.json อย่า cache (เป็นตัวบอกเวอร์ชัน)
- API ตอนนี้ไม่ได้ส่ง header Cache-Control ฝั่งเว็บควรเก็บผลในหน่วยความจำ (เช่น React Query `staleTime: Infinity`) เพื่อไม่เรียกซ้ำ
- ไม่มี rate limit ใน API แต่ FIRMS จำกัดการเรียกต่อ key จึงควรปิดปุ่มโหลด CSV ระหว่างที่กำลังโหลด

### 7.3 ความปลอดภัย

- ห้ามใส่ token Earthdata หรือ Hugging Face token ในโค้ดเว็บเด็ดขาด เว็บไม่จำเป็นต้องใช้
- FIRMS MAP\_KEY ในทาง A จะมองเห็นได้ในเบราว์เซอร์ ถ้าไม่ต้องการ ให้ใช้ทาง B ที่ key อยู่ฝั่งเซิร์ฟเวอร์
- API เป็นแบบอ่านอย่างเดียว (GET) ไม่มีการเขียนข้อมูลผู้ใช้ จึงไม่ต้องมี login

### 7.4 เช็กลิสต์ก่อนขึ้นจริง

**ฝั่ง backend (Ploy)**

- [ ] อัปโหลด 4 ไฟล์ขึ้น bucket และเปิด manifest.json ผ่านลิงก์ resolve ได้
- [ ] (ถ้าใช้ทาง B) deploy Space, ตั้ง FIRMS\_MAP\_KEY และ CORS\_ORIGINS, /health ตอบ ok
- [ ] ส่งลิงก์ BASE และไฟล์ใน firecalendar-handoff-files ให้เพื่อน

**ฝั่ง frontend (เพื่อน)**

- [ ] คัดลอก types + client + ตัวอย่าง React เข้าโปรเจกต์
- [ ] ปฏิทินภูมิภาคแสดงครบ 288 ช่องทั้ง 4 ภูมิภาค ลายทแยงตรงกับ source
- [ ] เลือกกรอบทดสอบรอบโรซาริโอ (−34.5, −61, −32.5, −58.5) เดือน ส.ค. 2022 ต้องได้ 6,593 จุด 282 ช่อง (ตัวเลขตรงกันทั้งทาง A และ B)
- [ ] กรอบนอกพื้นที่ (เช่น ประเทศไทย 10–12°N, 100–102°E) ต้องแสดง "ยังไม่มีข้อมูล" ไม่ใช่ปฏิทินศูนย์
- [ ] เปิด DevTools → Console ไม่มี error CORS
- [ ] หน้า Evidence แสดงข้อจำกัดครบ 4 ข้อและเลขรุ่น
- [ ] ทดสอบบนมือถือ: ปฏิทินเลื่อนแนวนอนได้ ไม่ล้นจอ
