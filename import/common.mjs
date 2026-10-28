// Shared by the import scripts: the exported data, and the old engine's slugs.
import fs from "node:fs";
import path from "node:path";

const read = file => JSON.parse(fs.readFileSync(path.join(import.meta.dirname, file), "utf8"));

// Exported data, without the comments listed in excluded-comments.json.
export function readData() {
  const excluded = new Set(read("excluded-comments.json"));
  return {
    categories: read("data/categories.json"),
    posts: read("data/posts.json"),
    comments: read("data/comments.json").filter(c => !excluded.has(c.id)),
    excluded: [...excluded],
  };
}

const accents = "ÀÁÂÃÄÅàáâãäåÒÓÔÕÖØòóôõöøÈÉÊËéèêëÇçÌÍÎÏìíîïÙÚÛÜùúûüÿÑñ";
const noAccents = "AAAAAAaaaaaaOOOOOOooooooEEEEeeeeCcIIIIiiiiUUUUuuuuyNn";

// makeUrlString() of the old engine (url.inc.php): "Équidés" -> "equides".
export function makeUrlString(txt) {
  txt = txt.replace(/&(amp|lt|gt|quot|#039);/g, (m, e) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#039": "'" })[e])
           .replace(/<[^>]*>/g, "");
  txt = [...txt].map(c => { const i = accents.indexOf(c); return i < 0 ? c : noAccents[i]; }).join("");
  txt = txt.replace(/[A-Z]/g, c => c.toLowerCase());
  return txt.replace(/[^a-z0-9]+/g, "-").replace(/(^-)|(-$)/g, "");
}
