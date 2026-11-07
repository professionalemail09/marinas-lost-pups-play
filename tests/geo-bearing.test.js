/* Great-circle checks for Globe Hunt / World Sniff.
   Distances must land within 2% of the reference kilometres.
   Bearings use the initial course from guess to target. */
const fs = require("fs");
const path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "app.v0-4-9.js"), "utf8");
const xm = src.match(/function X\(Q,oe\)\{[^}]+\}/);
const sm = src.match(/function se\(Q,oe\)\{[^}]+\}/);
if (!xm || !sm) {
  console.error("Could not find km/bearing functions in app.v0-4-9.js");
  process.exit(1);
}
const ae = Math.PI / 180;
const le = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
eval(xm[0]);
eval(sm[0]);
function compass(deg) {
  return le[Math.round(deg / 45) % 8];
}
const cases = [
  { name: "France -> Japan", from: [2.46, 46.62], to: [137.98, 36.64], km: 9749, dir: "NE" },
  { name: "USA -> Brazil", from: [-99.25, 39.58], to: [-53.1, -10.84], km: 7354, dir: "SE" },
  { name: "Canada -> Mexico", from: [-102.5, 58], to: [-102.52, 23.98], km: 3783, dir: "S" }
];
let failed = 0;
for (const c of cases) {
  const km = X(c.from, c.to);
  const br = se(c.from, c.to);
  const dir = compass(br);
  const err = Math.abs(km - c.km) / c.km;
  const ok = err <= 0.02 && dir === c.dir;
  console.log(
    (ok ? "PASS" : "FAIL") +
      "  " + c.name +
      "  " + km.toFixed(1) + " km (" + (err * 100).toFixed(2) + "%)" +
      "  bearing " + br.toFixed(1) + "° " + dir
  );
  if (!ok) failed++;
}
process.exit(failed ? 1 : 0);
