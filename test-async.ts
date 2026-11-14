import { HotspotsController } from "./src/lib/hotspots-controller";

const SAMPLE_CSV = `latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight
-33.1234,-60.5678,320.5,1.2,1.5,2024-01-15,1230,Terra,MODIS,high,6.1,290.1,15.5,D
-33.2345,-60.6789,315.2,1.1,1.4,2024-01-15,1345,Aqua,MODIS,nominal,6.1,288.5,8.2,N
-33.3456,-60.7890,330.8,1.3,1.6,2024-01-16,0120,Suomi NPP,VIIRS,low,6.1,295.3,22.1,D
-33.4567,-60.8901,325.0,1.2,1.5,2024-01-16,0235,NOAA-20,VIIRS,high,6.1,292.0,12.8,D
-33.5678,-60.9012,318.5,1.1,1.3,2024-01-17,1450,NOAA-21,VIIRS,nominal,6.1,289.7,5.5,N`;

const controller = new HotspotsController();

console.log("=== Testing parseCSV ===");
const result = controller.parseCSV(SAMPLE_CSV);
console.log(`Parsed ${result.length} rows`);
console.log(result.map(r => `${r.date} ${r.time} ${r.confidence} ${r.satellite} ${r.frp}`));

controller.clear();

console.log("\n=== Testing parseCSVAsync ===");
const batches: any[] = [];
for await (const batch of controller.parseCSVAsync(SAMPLE_CSV, 2)) {
  console.log(`Batch: ${batch.length} rows`);
  batches.push(batch);
}

console.log(`\nTotal batches: ${batches.length}`);
console.log(`Total rows: ${batches.flat().length}`);
batches.flat().forEach((r, i) => console.log(`${i}: ${r.date} ${r.time} ${r.confidence} ${r.satellite} ${r.frp}`));
