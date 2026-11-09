const fs = require("fs");
const assert = require("assert");
const s = fs.readFileSync(require("path").join(__dirname, "..", "app.v0-5-5.js"), "utf8");
const start = s.lastIndexOf(";(()=>{");
assert(start > 0, "roast iife");
const tail = s.slice(start);
const banned = /\b(damn|hell|crap|stupid|idiot|dumb|hate you|shut up|sucks)\b/i;
const win = { __bearRoast: null };
eval(tail.replaceAll("window.__bearRoast", "win.__bearRoast"));
const roast = win.__bearRoast;
assert(typeof roast === "function");
assert(roast.count >= 80, "need 80 lines, got " + roast.count);

const modes = ["fetch", "worldsniff", "flagfetch", "shapes", "citysniff", "globehunt", "frazzle", "numberless", "packgroups"];
const rand = Math.random;
Math.random = () => 0.99;
for (const mode of modes) {
  for (const streak of [1, 2, 4]) {
    const seen = [];
    let repeatAt = -1;
    for (let i = 0; i < 40; i++) {
      const line = roast(mode, streak);
      assert(line && line.length <= 78, mode + " streak " + streak + " bad " + JSON.stringify(line));
      assert(!banned.test(line), line);
      if (seen.includes(line)) { repeatAt = i; break; }
      seen.push(line);
    }
    assert(seen.length >= 3, mode + " streak " + streak + " pool too small " + seen.length);
    assert(repeatAt === seen.length, mode + " repeated before the pool cycled");
  }
  const mild = roast(mode, 1);
  const mean = roast(mode, 4);
  assert(mild !== mean || roast.count < 2, "escalation should leave the mild pool");
}
Math.random = rand;
let piled = 0;
for (let i = 0; i < 80; i++) if (roast("worldsniff", 3).includes("Kenai")) piled++;
assert(piled > 0 && piled < 70, "Kenai should pile on sometimes, got " + piled);
console.log("bear roast tests passed", roast.count, "lines");
