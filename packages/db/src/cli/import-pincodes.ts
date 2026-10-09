/**
 * Import the India Post "All India Pincode Directory" CSV (data.gov.in) into `pincodes`.
 *
 *   pnpm --filter @food-del/db run import:pincodes -- ./all_india_pincode.csv
 *
 * The directory lists post offices, several per pincode; we keep one row per pincode, prefer a
 * delivery office for the area name, and map districts to our commercial metros. Rows for
 * pincodes outside launch cities are imported with no city so the storefront can say "not yet".
 * Re-running is safe: existing pincodes are updated, ODA flags are left alone.
 */
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { createDb } from "../client";
import { cities, pincodes } from "../schema";
import { databaseUrl } from "./env";

const STATE_CODES: Record<string, string> = {
  "ANDAMAN AND NICOBAR ISLANDS": "AN",
  "ANDHRA PRADESH": "AP",
  "ARUNACHAL PRADESH": "AR",
  ASSAM: "AS",
  BIHAR: "BR",
  CHANDIGARH: "CH",
  CHHATTISGARH: "CG",
  "DADRA AND NAGAR HAVELI AND DAMAN AND DIU": "DH",
  "THE DADRA AND NAGAR HAVELI AND DAMAN AND DIU": "DH",
  DELHI: "DL",
  GOA: "GA",
  GUJARAT: "GJ",
  HARYANA: "HR",
  "HIMACHAL PRADESH": "HP",
  "JAMMU AND KASHMIR": "JK",
  JHARKHAND: "JH",
  KARNATAKA: "KA",
  KERALA: "KL",
  LADAKH: "LA",
  LAKSHADWEEP: "LD",
  "MADHYA PRADESH": "MP",
  MAHARASHTRA: "MH",
  MANIPUR: "MN",
  MEGHALAYA: "ML",
  MIZORAM: "MZ",
  NAGALAND: "NL",
  ODISHA: "OD",
  PUDUCHERRY: "PY",
  PUNJAB: "PB",
  RAJASTHAN: "RJ",
  SIKKIM: "SK",
  "TAMIL NADU": "TN",
  TELANGANA: "TG",
  TRIPURA: "TR",
  "UTTAR PRADESH": "UP",
  UTTARAKHAND: "UK",
  "WEST BENGAL": "WB",
};

/** Districts (upper case, as India Post spells them) that make up each commercial metro. */
const CITY_DISTRICTS: Record<string, string[]> = {
  kolkata: ["KOLKATA"],
  hyderabad: ["HYDERABAD"],
  "delhi-ncr": [
    "CENTRAL DELHI",
    "EAST DELHI",
    "NEW DELHI",
    "NORTH DELHI",
    "NORTH EAST DELHI",
    "NORTH WEST DELHI",
    "SHAHDARA",
    "SOUTH DELHI",
    "SOUTH EAST DELHI",
    "SOUTH WEST DELHI",
    "WEST DELHI",
    "GURGAON",
    "GURUGRAM",
    "GAUTAM BUDDHA NAGAR",
  ],
  bengaluru: ["BENGALURU", "BENGALURU URBAN", "BANGALORE", "BANGALORE URBAN"],
  mumbai: ["MUMBAI", "MUMBAI CITY", "MUMBAI SUBURBAN"],
  chennai: ["CHENNAI"],
  pune: ["PUNE"],
};

/** Minimal RFC 4180 parser (quoted fields, escaped quotes). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const file = process.argv[2];
if (!file) {
  console.error("Usage: import-pincodes <path-to-india-post-directory.csv>");
  process.exit(1);
}

const [header, ...data] = parseCsv(readFileSync(file, "utf8"));
const col = (name: string) => {
  const i = header!.findIndex((h) => h.trim().toLowerCase() === name);
  if (i < 0) throw new Error(`Column "${name}" not found in ${header!.join(", ")}`);
  return i;
};
const iPin = col("pincode");
const iOffice = col("officename");
const iDelivery = header!.findIndex((h) => /^delivery(status)?$/i.test(h.trim()));
const iDistrict = col("district");
const iState = col("statename");

interface Row {
  pincode: string;
  areaName: string;
  district: string;
  stateCode: string;
  isDeliveryOffice: boolean;
}

const byPincode = new Map<string, Row>();
const unknownStates = new Set<string>();
for (const r of data) {
  const pincode = r[iPin]?.trim() ?? "";
  if (!/^[1-9]\d{5}$/.test(pincode)) continue;
  const stateName = (r[iState] ?? "").trim().toUpperCase().replace(/&/g, "AND");
  const stateCode = STATE_CODES[stateName];
  if (!stateCode) {
    unknownStates.add(stateName);
    continue;
  }
  const row: Row = {
    pincode,
    areaName: (r[iOffice] ?? "").replace(/\s+(B\.?O|S\.?O|H\.?O|G\.?P\.?O)\.?$/i, "").trim(),
    district: (r[iDistrict] ?? "").trim().toUpperCase(),
    stateCode,
    isDeliveryOffice: iDelivery >= 0 && /^delivery$/i.test((r[iDelivery] ?? "").trim()),
  };
  const prev = byPincode.get(pincode);
  if (!prev || (!prev.isDeliveryOffice && row.isDeliveryOffice)) byPincode.set(pincode, row);
}

const { db, close } = createDb(databaseUrl(), { max: 1 });
try {
  const cityRows = await db.select({ id: cities.id, slug: cities.slug }).from(cities);
  const cityByDistrict = new Map<string, string>();
  for (const c of cityRows)
    for (const d of CITY_DISTRICTS[c.slug] ?? []) cityByDistrict.set(d, c.id);

  const rows = [...byPincode.values()].map((r) => ({
    pincode: r.pincode,
    cityId: cityByDistrict.get(r.district) ?? null,
    areaName: r.areaName || null,
    district: r.district.replace(/\b\w+/g, (w) => w[0] + w.slice(1).toLowerCase()),
    stateCode: r.stateCode,
  }));
  for (let i = 0; i < rows.length; i += 2000) {
    await db
      .insert(pincodes)
      .values(rows.slice(i, i + 2000))
      .onConflictDoUpdate({
        target: pincodes.pincode,
        set: {
          cityId: sql`excluded.city_id`,
          areaName: sql`excluded.area_name`,
          district: sql`excluded.district`,
          stateCode: sql`excluded.state_code`,
        },
      });
  }
  const mapped = rows.filter((r) => r.cityId).length;
  console.log(`Imported ${rows.length} pincodes (${mapped} in launch cities).`);
  if (unknownStates.size) console.warn("Skipped unknown states:", [...unknownStates].join(", "));
  console.log("Remember to regenerate lanes for newly mapped pincodes (admin → Lanes → Rebuild).");
} finally {
  await close();
}
