// Generate a standalone page listing every comment that the static site
// publishes, grouped by photo, to review them before publishing.
//
// Usage: node import/review-comments.mjs [output.html] [--new=<id>,<id>...]
//   --new highlights the given comments (e.g. newly approved ones).
//   (default: ../naturailes-comments-review.html, next to the repository)
//
// To unpublish a comment, add its id to import/excluded-comments.json and run
// node import/convert.mjs. The page has checkboxes that build that list.

import fs from "node:fs";
import path from "node:path";
import { readData, makeUrlString } from "./common.mjs";

const root = path.join(import.meta.dirname, "..");
const args = process.argv.slice(2);
const out = path.resolve(args.find(a => !a.startsWith("--")) || path.join(root, "..", "naturailes-comments-review.html"));
const highlighted = new Set((args.find(a => a.startsWith("--new="))?.slice(6).split(",") ?? []).map(Number));
const data = readData();
const excluded = data.excluded;

const escapeHtml = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const cats = new Map(data.categories.map(c => [c.id, c]));
const posts = data.posts.map(p => ({ ...p, comments: data.comments.filter(c => c.post === p.id) }))
  .filter(p => p.comments.length).sort((a, b) => a.id - b.id);
for (const p of posts) {
  const slug = makeUrlString(p.title);
  p.page = `c${p.id}${slug ? "-" + slug : ""}.html`;
  p.label = cats.get(p.cat).name.replace(/^./, c => c.toUpperCase());
}
// Links go to the built site (_site/, see npm run build).
const rel = file => path.relative(path.dirname(out), path.join(root, file)).split(path.sep).join("/");
const thumb = post => {
  const file = path.join(root, "photos", `${post.id}-mini.jpg`);
  return fs.existsSync(file) ? `data:image/jpeg;base64,${fs.readFileSync(file).toString("base64")}` : "";
};
const site = { comments: data.comments };

const sections = posts.map(post => `
<section>
 <a href="${rel("_site/" + post.page)}"><img class="thumb" src="${thumb(post)}" alt="" /></a>
 <h2><a href="${rel("_site/" + post.page)}">${escapeHtml(post.label)} : ${escapeHtml(post.title)}</a>
  <small>(post ${post.id}, ${escapeHtml(post.page)})</small></h2>
 ${post.comments.map(c => `
 <div class="comment${highlighted.has(c.id) ? " new" : ""}" id="comment-${c.id}">
  <label><input type="checkbox" value="${c.id}" /> exclude comment <b>${c.id}</b></label>
  <h3>${c.title} — <em>${c.author}</em>, ${c.date} ${c.time}</h3>
  ${c.message}
 </div>`).join("")}
</section>`).join("");

const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8" />
<title>Natur'Ailes.org — comments to review (${site.comments.length})</title>
<style>
 body { font-family: Georgia, serif; max-width: 60em; margin: 1em auto; padding: 0 1em; }
 section { border-top: 2px solid #999; padding: 1em 0; overflow: auto; }
 .thumb { float: left; margin: 0 1em 1em 0; max-width: 150px; }
 h2 { font-size: 1.1em; margin: 0 0 .5em; } h2 small { font-weight: normal; color: #777; }
 .comment { margin-left: 170px; border-left: 3px solid #ddd; padding-left: .8em; margin-bottom: 1em; }
 .comment h3 { font-size: 1em; font-weight: normal; margin: .2em 0; }
 .comment p { margin: .3em 0; white-space: pre-line; }
 .comment.new { border-left-color: #e90; background: #fff4e0; }
 .comment.excluded { opacity: .4; text-decoration: line-through; }
 #list { position: sticky; top: 0; background: #ffd; padding: .5em; border: 1px solid #cc9; }
 textarea { width: 100%; }
</style>
</head>
<body>
<h1>Comments published on the static site: ${site.comments.length} comments on ${posts.length} photos</h1>
${highlighted.size ? `<p>Highlighted: ${[...highlighted].sort((a, b) => a - b).map(id => `<a href="#comment-${id}">${id}</a>`).join(", ")}.</p>` : ""}
<p>These are the comments that were validated on the old site${excluded.length ? `, minus the ${excluded.length} already listed in excluded-comments.json` : ""}.
Check the ones that shouldn't be kept, then copy the list below into
<code>import/excluded-comments.json</code> in the repository, and run <code>node import/convert.mjs</code>.</p>
<div id="list">import/excluded-comments.json: <textarea rows="2" readonly></textarea></div>
${sections}
<script>
 const initial = ${JSON.stringify(excluded)};
 const update = () => {
   const ids = [...initial, ...[...document.querySelectorAll("input:checked")].map(i => Number(i.value))];
   document.querySelector("textarea").value = JSON.stringify([...new Set(ids)].sort((a, b) => a - b));
   for (const i of document.querySelectorAll("input")) i.closest(".comment").classList.toggle("excluded", i.checked);
 };
 document.addEventListener("change", update);
 update();
</script>
</body>
</html>
`;

fs.writeFileSync(out, html);
console.log(`${site.comments.length} comments on ${posts.length} photos -> ${out}`);
