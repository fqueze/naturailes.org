// Convert the exported data (import/data/*.json) to one posts/<id>-<slug>.md
// file per photo, and _data/categories.json.
//
// The post's HTML is the body; the validated comments (minus those listed in
// import/excluded-comments.json) go in the front matter.
//
// Usage: node import/convert.mjs

import fs from "node:fs";
import path from "node:path";
import { readData, makeUrlString } from "./common.mjs";

const root = path.join(import.meta.dirname, "..");
const { categories, posts, comments } = readData();

// JSON strings are valid YAML strings.
const str = JSON.stringify;
for (const d of ["_data", "posts"]) fs.mkdirSync(path.join(root, d), { recursive: true });

fs.writeFileSync(path.join(root, "_data", "categories.json"), JSON.stringify(
  categories.map(c => ({ id: c.id, name: c.name, desc: c.desc, slug: makeUrlString(c.name) })), null, 1) + "\n");

const dir = path.join(root, "posts");
for (const f of fs.readdirSync(dir)) if (f.endsWith(".md")) fs.rmSync(path.join(dir, f));
for (const post of posts) {
  const slug = makeUrlString(post.title);
  const lines = [
    "---",
    `id: ${post.id}`,
    `title: ${str(post.title)}`,
    `slug: ${str(slug)}`,
    `date: ${post.date}T${post.time}`,
    `category: ${post.cat}`,
    `author: ${post.author}`,
    `width: ${post.width}`,
    `height: ${post.height}`,
  ];
  const postComments = comments.filter(c => c.post === post.id);
  if (postComments.length) {
    lines.push("comments:");
    for (const c of postComments)
      lines.push(`  - id: ${c.id}`, `    author: ${str(c.author)}`, `    title: ${str(c.title)}`,
                 `    date: ${str(`${c.date} ${c.time}`)}`, `    message: ${str(c.message)}`);
  }
  lines.push("---", post.message, "");
  fs.writeFileSync(path.join(dir, `${post.id}${slug ? "-" + slug : ""}.md`), lines.join("\n"));
}
console.log(`${posts.length} posts, ${comments.length} comments`);
