// Turns the posts/*.md collection into what the templates need (home and
// category pages, photo pages, feeds, redirects), reproducing the old PHP
// engine's URLs and rules.

import fs from "node:fs";
import path from "node:path";
import { photoSizes, photoFile, thumbFile } from "./photos.js";

const root = path.join(import.meta.dirname, "..");

// --- Helpers ported from the PHP code ----------------------------------------

export const ucfirst = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

export function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// PHP's strtr($text, $array): at each position, replace the longest matching
// key; replaced text is not scanned again.
function strtr(text, map) {
  const keys = Object.keys(map).sort((a, b) => b.length - a.length);
  let out = "";
  for (let i = 0; i < text.length;) {
    const key = keys.find(k => text.startsWith(k, i));
    if (key) { out += map[key]; i += key.length; }
    else out += text[i++];
  }
  return out;
}

// Smileys of the [default] section of smileys/theme, as smile.php did.
const smileys = (() => {
  const lines = fs.readFileSync(path.join(root, "smileys", "theme"), "utf8").split("\n");
  let i = lines.findIndex(l => /\[[a-z]+\]$/i.test(l.trim())) + 1;
  const map = {};
  for (; i < lines.length && lines[i].trim() !== ""; i++) {
    const [file, ...codes] = lines[i].trim().split(/\t+/);
    for (const code of codes)
      map[code] = `<img src="smileys/${escapeHtml(file.replace("! ", ""))}" alt="${escapeHtml(code)}" />`;
  }
  return map;
})();

// smile() from smile.php: smileys, and non-breaking spaces before ! ? :
export function smile(text, base = "") {
  let html = strtr(text, smileys);
  html = strtr(html, { " !": "&nbsp;!", " ?": "&nbsp;?", " :": "&nbsp;:" });
  if (base) html = html.replaceAll('src="smileys/', `src="${base}smileys/`);
  return html;
}

// date('r') for a date and time ("YYYY-MM-DD HH:MM:SS") in French local time.
export function rfc2822(dateTime) {
  const [y, mo, d, h, mi, s] = dateTime.split(/[- :]/).map(Number);
  const local = Date.UTC(y, mo - 1, d, h, mi, s);
  const offsetAt = t => {
    const name = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Paris", timeZoneName: "longOffset" })
      .formatToParts(new Date(t)).find(p => p.type === "timeZoneName").value;
    const m = name.match(/GMT([+-])(\d\d):(\d\d)/);
    return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
  };
  const offset = offsetAt(local - offsetAt(local) * 60000);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const pad = n => String(n).padStart(2, "0");
  return `${days[new Date(local).getUTCDay()]}, ${pad(d)} ${months[mo - 1]} ${y} ${pad(h)}:${pad(mi)}:${pad(s)} ` +
         `${offset < 0 ? "-" : "+"}${pad(Math.floor(Math.abs(offset) / 60))}${pad(Math.abs(offset) % 60)}`;
}

// YAML timestamps without timezone are read as UTC: get back the wall time.
const wallTime = d => d.toISOString().slice(0, 19).replace("T", " ");

// --- Site model ---------------------------------------------------------------

export function buildSite(items, categoryList, site, oldImageUrls = {}) {
  const dash = slug => slug ? "-" + slug : "";
  const categories = categoryList.map(c => ({
    ...c, label: ucfirst(c.name), url: `t${c.id}${dash(c.slug)}.html`, feedUrl: `flux-c${c.id}-${c.slug}.rss`, posts: [],
  }));
  const catById = new Map(categories.map(c => [c.id, c]));

  // Photos, newest first.
  const posts = items.map(item => {
    const d = item.data, s = dash(d.slug);
    const [date, time] = wallTime(item.date).split(" ");
    const category = catById.get(d.category);
    if (!category) throw new Error(`${item.inputPath}: unknown category ${d.category}`);
    const post = {
      id: d.id, title: d.title, slug: s, date, time, category,
      author: d.author, email: site.authors[d.author],
      get message() { return item.templateContent.replace(/\n$/, ""); },
      urls: { a: `a${d.id}${s}.html`, c: `c${d.id}${s}.html`, n: `n${d.id}${s}.html` },
      thumb: `m${d.id}${s}.jpg`,
      sizes: photoSizes(d.width, d.height).map(size => ({ ...size, file: photoFile(d.id, size.width) })),
      comments: (d.comments || []).map(c => {
        const [date, time] = c.date.split(" ");
        return { ...c, date, time };
      }),
    };
    for (const file of [...post.sizes.map(s => s.file), thumbFile(d.id)])
      if (!fs.existsSync(path.join(root, file))) console.warn(`[site] ${file} is missing: run npm run photos`);
    return post;
  }).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time) || b.id - a.id);
  for (const post of posts) post.category.posts.push(post);

  // Previous (newer) and next (older) photos, within the category ("c" pages)
  // or among all photos ("a" pages, linked from the home page).
  const link = (list, i, kind) => i >= 0 && i < list.length ? { url: list[i].urls[kind], title: list[i].title } : null;
  posts.forEach((post, i) => {
    const list = post.category.posts, j = list.indexOf(post);
    post.nav = {
      a: { prev: link(posts, i - 1, "a"), next: link(posts, i + 1, "a") },
      c: { prev: link(list, j - 1, "c"), next: link(list, j + 1, "c") },
      n: { prev: null, next: null },
    };
  });

  // Sidebar: categories with photos, most photos first.
  const navCategories = categories.filter(c => c.posts.length)
    .sort((a, b) => b.posts.length - a.posts.length || a.name.localeCompare(b.name, "fr"));

  // Paginated thumbnail lists: home page (+ page<N>.html) and categories.
  const paginate = (list, url) => {
    const count = Math.max(1, Math.ceil(list.length / site.photosPerPage));
    return Array.from({ length: count }, (_, i) => ({
      number: i + 1, count, url: url(i + 1), pageUrl: url,
      posts: list.slice(i * site.photosPerPage, (i + 1) * site.photosPerPage),
    }));
  };
  const homePages = paginate(posts, p => `page${p}.html`).map(p => ({ ...p, url: p.number === 1 ? "index.html" : p.url }));
  const categoryPages = categories.flatMap(cat =>
    paginate(cat.posts, p => `t${cat.id}.${p}${dash(cat.slug)}.html`)
      .map(p => ({ ...p, category: cat, url: p.number === 1 ? cat.url : p.url })));

  // Photo pages: "a" (from the home page), "c" (from a category, with the
  // comments), "n" (without comments, linked from the feeds).
  const photoPages = posts.flatMap(post => ["a", "c", "n"].map(kind => ({ kind, post, url: post.urls[kind] })));

  // Feeds: the 20 most recent photos, for the whole site and per category.
  // Photos of the old site keep their old http links (category feeds linked
  // to n<id>-<slug>-<category>.html); newer ones link to https.
  const feedItems = (list, cat) => list.slice(0, site.feedItems).map(post => ({
    post,
    title: cat ? post.title : `${post.category.name} : ${post.title}`,
    guid: `${site.oldUrl}nocomm${post.id}${cat ? "-" + cat.id : ""}.html`,
    link: `${post.date} ${post.time}` <= site.lastOldPost
      ? `${site.oldUrl}n${post.id}${post.slug}${cat ? "-" + cat.id : ""}.html`
      : site.url + post.urls.n,
    date: rfc2822(`${post.date} ${post.time}`),
  }));
  const feeds = [
    { url: "flux.rss", title: "Natur'Ailes.org", link: site.url, desc: "Site des photos de Daniel Quèze", items: feedItems(posts) },
    ...categories.map(cat => ({
      url: cat.feedUrl, title: `Natur'Ailes.org - ${cat.name}`, link: site.url + cat.url,
      desc: `Natur'Ailes.org/${cat.name} : ${cat.desc}`, items: feedItems(cat.posts, cat),
    })),
  ];

  // Old URL forms, served as redirect pages.
  const redirects = [{ from: "page1.html", to: "./" }];
  for (const cat of categories)
    for (const from of [`t${cat.id}.html`, `cat${cat.id}.html`, `t${cat.id}.1${dash(cat.slug)}.html`])
      redirects.push({ from, to: cat.url });
  for (const post of posts) {
    const { a, c, n } = post.urls;
    const forms = [[`c${post.id}.html`, c], [`comm${post.id}.html`, c], [`a${post.id}.html`, a], [`acc${post.id}.html`, a],
                   [`n${post.id}.html`, n], [`nocomm${post.id}.html`, n],
                   // GUIDs and links of the category feeds
                   [`nocomm${post.id}-${post.category.id}.html`, n], [`n${post.id}${post.slug}-${post.category.id}.html`, n]];
    for (const [from, to] of forms) if (from !== to) redirects.push({ from, to });
  }

  // Images served at old URLs (copies of the published files): thumbnails
  // (m<id>-<slug>.jpg, mini<id>.jpg...), and the resized photos of the old
  // site (p<id>-<slug>-<w>x<h>.jpg...), still used by search engines and other
  // sites, which get the smallest published size at least as large.
  const postById = new Map(posts.map(p => [p.id, p]));
  const imageCopies = new Map(posts.flatMap(post =>
    [post.thumb, `mini${post.id}.jpg`].map(to => [to, thumbFile(post.id)])));
  for (const [url, id] of Object.entries(oldImageUrls)) {
    const post = postById.get(id);
    if (!post || imageCopies.has(url)) continue;
    const size = url.match(/(\d+)x(\d+)(\.jpe?g)?$/);
    if (!size) { imageCopies.set(url, thumbFile(id)); continue; }
    const [w, h] = [Number(size[1]), Number(size[2])];
    imageCopies.set(url, (post.sizes.find(s => s.width >= w && s.height >= h) ?? post.sizes.at(-1)).file);
  }

  return { categories, navCategories, posts, homePages, categoryPages, photoPages, feeds, redirects,
           imageCopies: [...imageCopies].map(([to, from]) => ({ from, to })) };
}
