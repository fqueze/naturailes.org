import fs from "node:fs";
import path from "node:path";
import site from "./_data/site.js";
import categories from "./_data/categories.json" with { type: "json" };
import oldImageUrls from "./_data/oldImageUrls.json" with { type: "json" };
import { buildSite, smile, escapeHtml, ucfirst } from "./lib/site.js";

export default function (eleventyConfig) {
  for (const file of ["css.css", "favicon.ico", "xsl_mop-up.js", "img", "smileys", "photos", "CNAME", ".nojekyll"])
    eleventyConfig.addPassthroughCopy(file);

  // Everything the templates need, computed from the posts.
  let model;
  eleventyConfig.addCollection("site", api =>
    model = buildSite(api.getFilteredByGlob("posts/*.md"), categories, site, oldImageUrls));

  // Images at old URLs: copies of the published files.
  eleventyConfig.on("eleventy.after", ({ directories }) => {
    for (const { from, to } of model.imageCopies) {
      const dest = path.join(directories.output, to);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(from, dest);
    }
  });

  eleventyConfig.addFilter("smile", (text, base) => smile(text, base));
  eleventyConfig.addFilter("ucfirst", ucfirst);
  eleventyConfig.addFilter("xml", s => escapeHtml(s));
  eleventyConfig.addFilter("srcset", post => post.sizes.map(s => `${s.file} ${s.width}w`).join(", "));
  // Displayed width: fits beside the menu and below the title, like the old site.
  eleventyConfig.addFilter("sizesAttr", post => {
    const big = post.sizes.at(-1);
    return `min(calc(100vw - 190px), calc((100vh - 96px) * ${(big.width / big.height).toFixed(3)}), ${big.width}px)`;
  });

  return { templateFormats: ["njk", "md"] };
}
