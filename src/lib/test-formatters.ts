import { 
  normalizeTime, 
  formatTimeDisplay, 
  normalizeDate, 
  formatDateDisplay, 
  formatDateTimeCombined, 
  normalizeCustomerName, 
  normalizePrice, 
  formatPriceDisplay, 
  normalizeVehicle, 
  normalizeStatus,
  cleanLocation 
} from './bookingFormatters';

console.log("=== TIME PARSING TESTS ===");
const timeCases = [
  "10:30 AM",
  "10:30 AM A",
  "8:00p.m.",
  "8:00 p.m.",
  "10.30",
  "22:30",
  "10:30AM",
  "1030",
  "20:00",
  "800pm",
  "10:30 (Boarding: 10:00)"
];

timeCases.forEach(tc => {
  const norm = normalizeTime(tc);
  const dispEn = formatTimeDisplay(tc, "en");
  const dispEs = formatTimeDisplay(tc, "es");
  console.log(`Raw: "${tc}" => Normalized: "${norm}" | EN: "${dispEn}" | ES: "${dispEs}"`);
});

console.log("\n=== DATE PARSING TESTS ===");
const dateCases = [
  "01/07/2026",
  "1 July 2026",
  "July 1, 2026",
  "2026-07-01",
  "Thu 01 Jul",
  "01-07-2026"
];

dateCases.forEach(dc => {
  const norm = normalizeDate(dc);
  const dispEn = formatDateDisplay(dc, "en");
  const dispEs = formatDateDisplay(dc, "es");
  const combEn = formatDateTimeCombined(dc, "10:30 AM", "en");
  const combEs = formatDateTimeCombined(dc, "10:30 AM", "es");
  console.log(`Raw: "${dc}" => Norm: "${norm}" | EN: "${dispEn}" | Combined EN: "${combEn}" | Combined ES: "${combEs}"`);
});

console.log("\n=== CUSTOMER NAME TESTS ===");
const nameCases = [
  "john doe",
  "Lead Traveler Name: Craig Hardman Craig Hardman",
  "Traveler Names: Rhonda Hendee (Adults: 2)",
  "CINDY EINBINDER"
];
nameCases.forEach(nc => {
  console.log(`Raw: "${nc}" => Cleaned: "${normalizeCustomerName(nc)}"`);
});

console.log("\n=== PRICE TESTS ===");
const priceCases = ["€37.50", "37,50 €", "EUR 78,72", 37.5, "37.5"];
priceCases.forEach(pc => {
  console.log(`Raw: "${pc}" => Numeric: ${normalizePrice(pc)} | Display: "${formatPriceDisplay(pc)}"`);
});

console.log("\n=== VEHICLE & STATUS TESTS ===");
console.log('Vehicle "economy car":', normalizeVehicle("economy car"));
console.log('Vehicle "Business Van":', normalizeVehicle("Business Van"));
console.log('Status "CONFIRMED":', normalizeStatus("CONFIRMED"));
console.log('Status "pending":', normalizeStatus("pending"));
