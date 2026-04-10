import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const res = await fetch("https://queue-times.com/parks.json");
const groups = await res.json();
const qtParks = groups.flatMap(g => g.parks ?? []);
const qtByName = new Map(qtParks.map(p => [p.name.toLowerCase().trim(), p]));

const { data: parks } = await sb.from("parks").select("id, name, country, latitude, longitude, queue_times_park_id");
const bad = parks.filter(p => p.country === p.name || p.country === "Unknown");

function countryFromCoords(lat, lng) {
  if (lat === 0 && lng === 0) return null;
  if (lat > 24 && lat < 50 && lng > -130 && lng < -60) return "United States";
  if (lat > 42 && lat < 56 && lng > -141 && lng < -52) return "Canada";
  if (lat > 14 && lat < 33 && lng > -118 && lng < -86) return "Mexico";
  if (lat > 49 && lat < 59 && lng > -8 && lng < 2) return "United Kingdom";
  if (lat > 42 && lat < 51.5 && lng > -5 && lng < 8) return "France";
  if (lat > 47 && lat < 55 && lng > 5.5 && lng < 15) return "Germany";
  if (lat > 46.5 && lat < 47.9 && lng > 5.9 && lng < 10.5) return "Switzerland";
  if (lat > 50.5 && lat < 51.6 && lng > 2.5 && lng < 6.5) return "Belgium";
  if (lat > 51 && lat < 54 && lng > 3 && lng < 7.5) return "Netherlands";
  if (lat > 55 && lat < 58 && lng > 8 && lng < 13) return "Denmark";
  if (lat > 55 && lat < 69 && lng > 11 && lng < 24) return "Sweden";
  if (lat > 59 && lat < 71 && lng > 4 && lng < 31) return "Norway";
  if (lat > 59 && lat < 70 && lng > 20 && lng < 30) return "Finland";
  if (lat > 46 && lat < 49 && lng > 9 && lng < 17) return "Austria";
  if (lat > 36 && lat < 44 && lng > -10 && lng < 4) return "Spain";
  if (lat > 36 && lat < 47 && lng > 6 && lng < 19) return "Italy";
  if (lat > 49 && lat < 55 && lng > 14 && lng < 24) return "Poland";
  if (lat > 47 && lat < 50 && lng > 14 && lng < 19) return "Czech Republic";
  if (lat > 24 && lat < 46 && lng > 122 && lng < 146) return "Japan";
  if (lat > 33 && lat < 39 && lng > 124 && lng < 130) return "South Korea";
  if (lat > 18 && lat < 54 && lng > 73 && lng < 135) return "China";
  if (lat > 1 && lat < 7 && lng > 100 && lng < 105) return "Malaysia";
  if (lat > 20 && lat < 32 && lng > 42 && lng < 57) return "United Arab Emirates";
  if (lat > -47 && lat < -10 && lng > 112 && lng < 179) return "Australia";
  if (lat > -35 && lat < 5 && lng > -75 && lng < -34) return "Brazil";
  if (lat > -55 && lat < -22 && lng > -73 && lng < -53) return "Argentina";
  if (lat > -5 && lat < 13 && lng > -85 && lng < -77) return "Costa Rica";
  if (lat > 13 && lat < 18 && lng > -92 && lng < -88) return "Guatemala";
  if (lat > 38 && lat < 42 && lng > 20 && lng < 30) return "Turkey";
  if (lat > 31 && lat < 33.5 && lng > 34 && lng < 36) return "Israel";
  if (lat > 8 && lat < 21 && lng > 98 && lng < 106) return "Thailand";
  if (lat > -11 && lat < 6 && lng > 95 && lng < 141) return "Indonesia";
  if (lat > 22 && lat < 24 && lng > 113 && lng < 115) return "Hong Kong";
  if (lat > 1 && lat < 2 && lng > 103 && lng < 104.5) return "Singapore";
  if (lat > 8 && lat < 22 && lng > 105 && lng < 110) return "Vietnam";
  return null;
}

let fixed = 0;
let unfixed = [];

for (const park of bad) {
  let country = null;
  
  if (park.queue_times_park_id) {
    const qt = qtParks.find(p => p.id === park.queue_times_park_id);
    if (qt) country = qt.country;
  }
  
  if (!country) {
    const qt = qtByName.get(park.name.toLowerCase().trim());
    if (qt) country = qt.country;
  }

  if (!country) {
    country = countryFromCoords(park.latitude, park.longitude);
  }

  if (country) {
    await sb.from("parks").update({ country }).eq("id", park.id);
    fixed++;
  } else {
    unfixed.push(`${park.name} (${park.latitude},${park.longitude})`);
  }
}

console.log("Fixed: " + fixed);
console.log("Unfixed: " + unfixed.length);
for (const u of unfixed) console.log("  " + u);

// Verify
const { data: remaining } = await sb.from("parks").select("id, name, country").or("country.eq.Unknown,country.eq.name");
const stillBad = (await sb.from("parks").select("id, name, country")).data.filter(p => p.country === p.name);
console.log("\nParks still with country=name: " + stillBad.length);
