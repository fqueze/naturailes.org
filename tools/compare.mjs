// Compare the old dynamic site with the static output in _site/.
//
// Usage: node tools/compare.mjs [old-site-url] [--refresh] [--verbose]
//   old-site-url defaults to $NATURAILES_OLD_URL or http://localhost:8105/
//
// Crawls the old site (starting from the home page, the feeds and every page
// of _site/, see npm run build), then checks that every URL that answered 200
// there exists in _site/ (served by a tiny local static server, following
// <meta http-equiv="refresh"> redirect pages), and compares the visible text
// of each page, ignoring admin links and the comment form.
// The old site's responses are cached in .cache/old-site.json; use --refresh
// to crawl it again.

import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const docs = path.join(root, "_site");
const cacheFile = path.join(root, ".cache", "old-site.json");
const args = process.argv.slice(2);
const verbose = args.includes("--verbose");
const oldBase = args.find(a => !a.startsWith("--")) || process.env.NATURAILES_OLD_URL || "http://localhost:8105/";

// URLs that only exist for admins, or that the static site drops on purpose.
// resolution.js was only used by the copy protection scheme.
const ignored = /^resolution\.js$|^(edit|del)\d+\.html$|^(poster|postimg|login|logout|heberg)\.html$|^v-?\d+\.html$|^(comm|acc|cat)\d+[ar]\d+\.html$|^login\/|^p\d+.*\.jpe?g$|^f[a-z][a-z0-9]{5}(\.jpg)?$|^photo\//;

// ---------------------------------------------------------------------------
// Fetching and crawling

async function get(base, url) {
  const res = await fetch(new URL(url, base), { redirect: "manual" });
  const type = res.headers.get("content-type") || "";
  const buf = Buffer.from(await res.arrayBuffer());
  const isText = /text|xml|javascript|css/.test(type) || /\.(html|rss|xsl|css|js)$/.test(url);
  return {
    status: res.status,
    location: res.headers.get("location"),
    body: isText ? buf.toString("utf8") : null,
    size: buf.length,
  };
}

function links(body) {
  const found = [];
  for (const m of body.matchAll(/(?:href|src)="([^"]*)"|<(?:link|guid)>([^<]*)</g))
    found.push(decode(m[1] ?? m[2]));
  return found;
}

function localPath(link, base) {
  let u;
  try { u = new URL(link, base); } catch { return null; }
  const b = new URL(base);
  if (u.host === "www.naturailes.org") u = new URL(u.pathname + u.search, base);
  if (u.origin !== b.origin) return null;
  return decodeURIComponent(u.pathname.slice(1)) + u.search;
}

async function crawlOld() {
  if (!args.includes("--refresh") && fs.existsSync(cacheFile))
    return JSON.parse(fs.readFileSync(cacheFile, "utf8"));
  const pages = {};
  const queue = ["", "flux.rss", "flux.xsl", "css.css", "favicon.ico", ...siteFiles().filter(f => /\.(html|rss|jpg)$/.test(f) && !f.startsWith("photos/") && f !== "index.html")];
  const seen = new Set(queue);
  while (queue.length) {
    const batch = queue.splice(0, 8);
    await Promise.all(batch.map(async url => {
      const r = await get(oldBase, url);
      pages[url] = { status: r.status, location: r.location, body: r.body, size: r.size };
      if (!r.body) return;
      // Photo pages are cut into one-time tiles stored in photo/tmp until
      // fetched; fetch them so that crawling leaves no files behind.
      const tiles = [...r.body.matchAll(/url\('(f[a-z0-9]{6}\.jpg)'\)/g)].map(m => m[1]);
      for (const t of tiles) await get(oldBase, t);
      if (r.status !== 200) return;
      for (const l of links(r.body)) {
        const p = localPath(l, new URL(url, oldBase));
        if (p === null || seen.has(p) || ignored.test(p) || p.includes("?")) continue;
        seen.add(p);
        queue.push(p);
      }
    }));
    process.stdout.write(`\rcrawled ${Object.keys(pages).length}, queued ${queue.length}   `);
  }
  process.stdout.write("\n");
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify(pages));
  return pages;
}

function siteFiles(dir = docs) {
  return fs.readdirSync(dir, { withFileTypes: true, recursive: true }).filter(f => f.isFile())
    .map(f => path.relative(docs, path.join(f.parentPath, f.name)).split(path.sep).join("/"));
}

// ---------------------------------------------------------------------------
// Static server for _site/, behaving like GitHub Pages for our files.

function serveDocs() {
  const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript",
                  ".jpg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".ico": "image/x-icon",
                  ".rss": "application/rss+xml", ".xsl": "application/xml" };
  const server = http.createServer((req, res) => {
    let p = path.join(docs, decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (!p.startsWith(docs)) p = docs;
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, "index.html");
    if (!fs.existsSync(p)) { res.writeHead(404); res.end("not found"); return; }
    res.writeHead(200, { "content-type": types[path.extname(p)] || "application/octet-stream" });
    fs.createReadStream(p).pipe(res);
  });
  return new Promise(resolve => server.listen(0, "127.0.0.1", () =>
    resolve({ server, base: `http://127.0.0.1:${server.address().port}/` })));
}

// ---------------------------------------------------------------------------
// Visible text

function decode(s) {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") return String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1)));
    return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " }[e.toLowerCase()] ?? m;
  });
}

function visibleText(html) {
  html = html
    .replace(/^[\s\S]*?<\/head>/i, "")                         // head (the old pages have two)
    .replace(/<\/head>/gi, "")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<div class="comm">\s*<h3>Déposer un commentaire[\s\S]*?<\/form>\s*<\/div>/, "")
    .replace(/<a [^>]*><em>(Editer|Supprimer|Accepter|Rejeter)<\/em><\/a>/g, "")
    .replace(/<img [^>]*alt="([^"]*)"[^>]*>/g, (m, alt) => /^smileys\//.test(m.match(/src="([^"]*)"/)?.[1] ?? "") ? alt : "");
  return decode(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function feedText(xml) {
  const items = [...xml.matchAll(/<(title|link|guid|description|pubDate|dc:creator)>([\s\S]*?)<\/\1>/g)];
  return items.map(([, tag, v]) => {
    v = decode(v.trim());
    if (tag === "description") v = visibleText("</head>" + v);
    if (tag === "link" || tag === "guid") v = v.replace(/^https?:/, "");
    return `${tag}: ${v}`;
  }).join("\n");
}

// The old "n" pages counted all comments, including unpublished ones and spam,
// and offered to comment; the static pages only count published comments.
const withoutCommentCount = t =>
  t.replace(/(Posté le \S+ à \S+ par \S+ \.) (\d+ commentaires?|Commenter)(?= Accueil)/, "$1");

function redirectTarget(body) {
  const m = body && body.match(/<meta http-equiv="refresh" content="0; url=([^"]+)"/);
  return m ? decode(m[1]) : null;
}

function firstDiff(a, b) {
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  const from = Math.max(0, i - 60);
  return `\n    old: …${a.slice(from, i + 100)}…\n    new: …${b.slice(from, i + 100)}…`;
}

// ---------------------------------------------------------------------------

const old = await crawlOld();
const { server, base: newBase } = await serveDocs();

const urls = Object.keys(old).filter(u => !ignored.test(u)).sort();
const counts = { ok200: 0, redirects: 0, missing: 0, same: 0, countOnly: 0, different: 0 };
const missing = [], different = [];

for (const url of urls) {
  const o = old[url];
  if (o.status !== 200) continue;
  counts.ok200++;
  let n = await get(newBase, url);
  if (n.status !== 200) { missing.push(url); counts.missing++; continue; }
  let target = redirectTarget(n.body);
  if (target) {
    counts.redirects++;
    n = await get(newBase, localPath(target, new URL(url, newBase)) ?? target);
    if (n.status !== 200) { missing.push(`${url} -> ${target} (broken redirect)`); counts.missing++; continue; }
  }
  if (!o.body) { counts.same++; continue; }    // binary file: existence is enough
  let a, b;
  if (/\.rss2?$/.test(url)) { a = feedText(o.body); b = feedText(n.body); }
  else if (/\.(css|js|xsl)$/.test(url)) { counts.same++; continue; }
  else { a = visibleText(o.body); b = visibleText(n.body); }
  if (a === b) counts.same++;
  else if (withoutCommentCount(a) === withoutCommentCount(b)) counts.countOnly++;
  else { counts.different++; different.push(`${url}${target ? ` (via ${target})` : ""}${firstDiff(a, b)}`); }
}

// Pages of the static site that the old site didn't have (sanity check).
const extra = siteFiles().filter(f => /\.(html|rss)$/.test(f) && !(f in old) && f !== "index.html");

server.close();
console.log(`Old site: ${urls.length} URLs crawled, ${counts.ok200} answered 200.`);
console.log(`Static site: ${counts.ok200 - counts.missing} of them exist (${counts.redirects} as redirect pages), ${counts.missing} missing.`);
console.log(`Text comparison: ${counts.same} identical, ${counts.countOnly} differing only by the comment count` +
            ` of "n" pages (the old one included unpublished comments), ${counts.different} different.`);
console.log(`Static pages not found on the old site: ${extra.length}`);
if (missing.length) console.log("\nMissing:\n  " + missing.join("\n  "));
if (different.length) console.log(`\nDifferent:\n  ` + (verbose ? different : different.slice(0, 20)).join("\n  ") +
                                  (!verbose && different.length > 20 ? `\n  … and ${different.length - 20} more (use --verbose)` : ""));
if (verbose && extra.length) console.log("\nExtra:\n  " + extra.join("\n  "));
