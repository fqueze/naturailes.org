// Export the public content of the old PHP/MySQL site to import/data/*.json.
//
// Usage:
//   NATURAILES_MYSQL="--defaults-file=/path/to/my.cnf -uroot naturailes" \
//   NATURAILES_PHOTOS=/path/to/old/site/photo \
//   node import/export-data.mjs
//
// Only public content is exported: categories that are not private, their
// posts, and the comments that were validated (comm.valid >= 1, i.e. accepted
// by an admin; 0 = pending, negative = rejected or spam). Comment e-mail
// addresses, IPs and user agents are not exported.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const mysqlArgs = process.env.NATURAILES_MYSQL;
const photoDir = process.env.NATURAILES_PHOTOS;
if (!mysqlArgs || !photoDir) {
  console.error("Set NATURAILES_MYSQL (mysql client arguments, including the database name)\n" +
                "and NATURAILES_PHOTOS (the old site's photo/ directory).");
  process.exit(1);
}

const outDir = path.join(import.meta.dirname, "data");

// Each query returns one JSON object per row. The tables are latin1; reading
// them through a utf8mb4 connection gives correctly encoded text.
function query(sql) {
  const out = execFileSync("mysql", [
    ...mysqlArgs.split(/\s+/).filter(Boolean),
    "--default-character-set=utf8mb4", "--batch", "--raw", "--skip-column-names",
    "-e", sql,
  ], { encoding: "utf8", maxBuffer: 1 << 28 });
  return out.split("\n").filter(Boolean).map(line => JSON.parse(line));
}

const categories = query(`
  SELECT JSON_OBJECT('id', id, 'name', nom, 'desc', \`desc\`, 'photo', photo = 1)
  FROM cat WHERE prive = 0 ORDER BY id`);

const posts = query(`
  SELECT JSON_OBJECT('id', p.Id, 'pos', p.Pos, 'cat', p.IdCat, 'title', p.Titre,
                     'message', p.message, 'date', DATE_FORMAT(p.Date, '%Y-%m-%d'),
                     'time', TIME_FORMAT(p.Heure, '%H:%i:%s'),
                     'author', u.Pseudo, 'email', u.email, 'commAuto', p.CommAuto = 1)
  FROM posts p JOIN cat c ON c.id = p.IdCat JOIN userlist u ON u.Id = p.IdUser
  WHERE c.prive = 0 ORDER BY p.Pos DESC`);

for (const post of posts) {
  const info = path.join(photoDir, "info", String(post.id));
  if (fs.existsSync(info)) {
    const [w, h] = fs.readFileSync(info, "utf8").trim().split("x").map(Number);
    post.width = w;
    post.height = h;
  } else {
    console.warn(`No photo info for post ${post.id}`);
  }
}

const comments = query(`
  SELECT JSON_OBJECT('id', m.Id, 'post', m.IdPost, 'author', m.pseudo, 'title', m.titre,
                     'message', m.Message, 'date', DATE_FORMAT(m.Date, '%Y-%m-%d'),
                     'time', TIME_FORMAT(m.Heure, '%H:%i:%s'))
  FROM comm m JOIN posts p ON p.Id = m.IdPost JOIN cat c ON c.id = p.IdCat
  WHERE m.valid >= 1 AND c.prive = 0 ORDER BY m.Id`);

for (const [name, data] of Object.entries({ categories, posts, comments })) {
  fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(data, null, 1) + "\n");
  console.log(`${name}: ${data.length}`);
}
