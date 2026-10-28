// List the old image URLs still in use, from the old site's Apache access
// log, to keep serving them (copies of the published images; see
// eleventy.config.js). Writes _data/oldImageUrls.json: { url: photo id }.
//
// Usage: node import/old-image-urls.mjs <access.log> [--since=2020] [--all]
//
// Old image URLs (see the old .htaccess):
//   p<id>-<slug>-<w>x<h>.jpg     resized photo (rewritten to photo/resized/<id>/l<w>x<h>.jpg)
//   photo/resized/<id>/l<w>x<h>.jpg
//   m<id>-<slug>.jpg, mini<id>.jpg, m<id>, ... and photo/mini/<id>: thumbnails
// URLs that answered 200 or 304 are kept if they had requests since --since
// from browsers (not bots) or with a referer from another site; --all keeps
// every URL that ever answered. Tiles (f<id>.jpg) were one-time URLs: skipped.

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { readData } from "./common.mjs";

const args = process.argv.slice(2);
const logFile = args.find(a => !a.startsWith("--"));
if (!logFile) { console.error("Usage: node import/old-image-urls.mjs <access.log> [--since=2020] [--all]"); process.exit(1); }
const since = Number(args.find(a => a.startsWith("--since="))?.slice(8) ?? 2020);
const keepAll = args.includes("--all");

const published = new Set(readData().posts.map(p => p.id));
const forms = [
  ["resized", /^p([1-9][0-9]*)(-[a-z0-9]+)*-([0-9]{2,4})x([0-9]{2,4})(\.jpe?g)?$/],
  ["resized", /^photo\/resized\/([1-9][0-9]*)\/l([0-9]+)x([0-9]+)\.jpg$/],
  ["thumbnail", /^m(?:ini)?([1-9][0-9]*)(-[a-z0-9]+)*(\.jpe?g)?$/],
  ["thumbnail", /^photo\/mini\/([1-9][0-9]*)$/],
];
const BOT = /bot|crawl|spider|slurp|scan|curl|wget|python|java|libwww|perl|ruby|php|go-http|okhttp|axios|node|headless|preview|fetch|dataset|research|archive|index|search|scrap|monitor|check|http/i;
const LINE = /^\S+ \S+ \S+ \[\d+\/\w+\/(\d{4}):[^\]]*\] "(?:GET|HEAD) ([^ "]+)[^"]*" (\d{3}) \S+ "([^"]*)" "([^"]*)"/;

const urls = new Map();   // url -> { id, form, hits, recent }
const lines = readline.createInterface({ input: fs.createReadStream(logFile) });
for await (const line of lines) {
  const m = LINE.exec(line);
  if (!m || !["200", "304", "206"].includes(m[3])) continue;
  const url = m[2].replace(/^https?:\/\/[^/]+/, "").split("?")[0].replace(/^\//, "");
  let id, form;
  for (const [name, re] of forms) { const f = re.exec(url); if (f) { id = Number(f[1]); form = name; break; } }
  if (!id) continue;
  const e = urls.get(url) ?? { id, form, hits: 0, recent: 0 };
  e.hits++;
  const [, year, , , referer, agent] = m;
  const browser = /^(Mozilla|Opera)\//.test(agent) && !BOT.test(agent);
  const external = referer !== "-" && !/^https?:\/\/[^/]*naturailes\.org\//.test(referer);
  if (Number(year) >= since && (browser || external)) e.recent++;
  urls.set(url, e);
}

const kept = {}, stats = {};
for (const [url, e] of [...urls].sort(([a], [b]) => a < b ? -1 : 1)) {
  const s = stats[e.form] ??= { found: 0, unpublished: 0, unused: 0, kept: 0 };
  s.found++;
  if (!published.has(e.id)) s.unpublished++;
  else if (!keepAll && !e.recent) s.unused++;
  else { s.kept++; kept[url] = e.id; }
}
const out = path.join(import.meta.dirname, "..", "_data", "oldImageUrls.json");
fs.writeFileSync(out, "{\n" + Object.entries(kept).map(([u, id]) => ` ${JSON.stringify(u)}: ${id}`).join(",\n") + "\n}\n");
console.log(`${Object.keys(kept).length} URLs -> ${out}`);
for (const [form, s] of Object.entries(stats))
  console.log(`${form}: ${s.found} found, ${s.unpublished} of unpublished photos, ` +
              `${keepAll ? 0 : s.unused} without browser or external traffic since ${since}, ${s.kept} kept`);
