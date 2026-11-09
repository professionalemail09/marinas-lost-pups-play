const fs = require("fs");
const path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "app.v0-5-5.js"), "utf8");
function grab(name) {
  const start = src.indexOf("function " + name + "(");
  if (start < 0) throw new Error("missing " + name);
  let i = src.indexOf("{", start), depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error("unclosed " + name);
}
const aliasStart = src.indexOf("const wsAlias=");
const aliasEnd = src.indexOf("function wsNames", aliasStart);
eval(grab("wsNorm") + "\n" + grab("wsLev") + "\n" + src.slice(aliasStart, aliasEnd) + "\n" + grab("wsNames") + "\n" + grab("wsMatch"));
const C = ["France", "Iran", "Iraq", "Niger", "Nigeria", "Austria", "Australia", "United States", "United Kingdom", "Ivory Coast", "Czech Republic", "DR Congo", "Republic of the Congo", "Myanmar", "Brazil"].map(n => ({ n }));
const ans = n => C.find(c => c.n === n);
function check(label, input, answer, expect) {
  const m = wsMatch(input, C, ans(answer));
  const ok = !!m.ok === !!expect.ok && (!expect.country || (m.country && m.country.n === expect.country)) && (expect.typo == null || !!m.typo === !!expect.typo) && (expect.reason == null || m.reason === expect.reason);
  console.log((ok ? "PASS" : "FAIL") + "  " + label + "  -> " + JSON.stringify({ ok: m.ok, country: m.country && m.country.n, typo: m.typo, reason: m.reason, dist: m.dist }));
  if (!ok) process.exitCode = 1;
}
check("exact france", "france", "France", { ok: true, country: "France", typo: false });
check("typo frnace", "frnace", "France", { ok: true, country: "France", typo: true });
check("usa alias", "USA", "United States", { ok: true, country: "United States", typo: true });
check("america alias", "America", "United States", { ok: true, country: "United States" });
check("uk alias", "UK", "United Kingdom", { ok: true, country: "United Kingdom" });
check("england alias", "England", "United Kingdom", { ok: true, country: "United Kingdom" });
check("burma alias", "Burma", "Myanmar", { ok: true, country: "Myanmar" });
check("cote divoire", "Cote d'Ivoire", "Ivory Coast", { ok: true, country: "Ivory Coast" });
check("czechia", "Czechia", "Czech Republic", { ok: true, country: "Czech Republic" });
check("drc", "DRC", "DR Congo", { ok: true, country: "DR Congo" });
check("iraq is not iran", "Iraq", "Iran", { ok: false, country: "Iraq", reason: "wrong" });
check("iraaq is iraq", "iraaq", "Iraq", { ok: true, country: "Iraq", typo: true });
check("iraaq is not iran", "iraaq", "Iran", { ok: false, country: "Iraq" });
check("niger is the country niger", "niger", "Nigeria", { ok: false, country: "Niger", reason: "wrong" });
check("nigera ties niger and nigeria", "nigera", "Nigeria", { ok: false, reason: "tie" });
check("nigeriya is nigeria", "nigeriya", "Nigeria", { ok: true, country: "Nigeria", typo: true });
check("austria exact not australia", "Austria", "Australia", { ok: false, country: "Austria", reason: "wrong" });
check("austrlia ties austria", "austrlia", "Australia", { ok: false, reason: "tie" });
check("australiaa is australia", "australiaa", "Australia", { ok: true, country: "Australia", typo: true });
check("brazil wrong for france", "Brazil", "France", { ok: false, country: "Brazil", reason: "wrong" });
check("empty", "  ", "France", { ok: false, reason: "empty" });
check("the france", "the France", "France", { ok: true, country: "France", typo: false });
if (process.exitCode) console.log("SOME FAILED");
else console.log("all passed");
