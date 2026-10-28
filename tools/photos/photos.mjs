// Generate the published images from the originals, for every posts/*.md:
//   photos/<id>-<width>.jpg  resized (see lib/photos.js) and signed,
//   photos/<id>-mini.jpg     thumbnail (the old site's one when the private
//                            repository has it in mini/, else generated).
// Originals are read from originals/<id>.jpg (the private repository, as a
// git submodule). Existing images are kept: delete them to regenerate them.
// The output only depends on the originals, this script and its dependencies.
//
// Usage: npm install --prefix tools/photos (once), then
//   npm run photos [-- <id>...]     (all posts by default)

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import opentype from "opentype.js";
import sharp from "sharp";
import { photoSizes, photoFile, thumbFile } from "../../lib/photos.js";

const root = path.join(import.meta.dirname, "..", "..");
const originals = path.join(root, "originals");
const QUALITY = 80;
const THUMB_BOX = 150;
const AUTHOR = "Daniel Quèze";
const COPYRIGHT = "© Daniel Quèze";

// --- Signature ---------------------------------------------------------------
// Imitates the signature Daniel puts on his prints: a thin script font
// (Corinthia, SIL Open Font License, in fonts/), white with a soft black
// shadow towards the bottom left. Glyphs are converted to SVG paths so that
// the result doesn't depend on the fonts installed on the machine.

const font = opentype.parse(fs.readFileSync(path.join(import.meta.dirname, "fonts", "Corinthia-Regular.ttf")).buffer);

const signature = (() => {
  const size = 1000, scale = size / font.unitsPerEm;
  let x = 0, prev = null;
  const paths = [];
  for (const ch of "Daniel Quèze") {
    const glyph = font.charToGlyph(ch);
    if (prev) x += font.getKerningValue(prev, glyph) * scale;
    if (ch === " ") x += size * 0.25;   // the print signature has a wide space
    paths.push(glyph.getPath(x, 0, size));
    x += glyph.advanceWidth * scale;
    prev = glyph;
  }
  const boxes = paths.map(p => p.getBoundingBox()).filter(b => b.x2 > b.x1);
  const box = { x1: Math.min(...boxes.map(b => b.x1)), x2: Math.max(...boxes.map(b => b.x2)),
                y1: Math.min(...boxes.map(b => b.y1)), y2: Math.max(...boxes.map(b => b.y2)) };
  return { paths: paths.map(p => p.toPathData(1)).filter(Boolean), box };
})();

// On screen, the capitals should be about as tall as the letters of the
// site's title (img/titre.jpg: "N" is 22 CSS px tall). Photo pages show the
// photo as large as fits under the title: on most screens its height is the
// window's height minus 96px, whatever its orientation, and the browser picks
// the srcset file accordingly. So the capitals are 2.6% of the image's height
// (21px on screen in a 900px high window, 25px in a 1080px one), and never
// less than 12px for the smallest files.
// The gap between the end of the signature and the right edge is the same as
// between its baseline and the bottom edge (0.75 x the capital height, which
// leaves room for the descenders).
const CAP_HEIGHT = 566;      // height of "D" in the glyph outlines (size 1000)
export function signatureSvg(width, height) {
  const cap = Math.max(12, height * 0.026);
  const scale = cap / CAP_HEIGHT;
  const margin = cap * 0.75;
  const x = width - margin - signature.box.x2 * scale;
  const y = height - margin;    // baseline
  const f = n => (cap * n).toFixed(2);
  // A dense black shadow (the outline thickened a little, then blurred),
  // towards the bottom left, so that the text stays readable on light photos.
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <filter id="s" x="-10%" y="-40%" width="120%" height="180%">
    <feMorphology in="SourceAlpha" operator="dilate" radius="${f(0.03)}"/>
    <feGaussianBlur stdDeviation="${f(0.07)}"/>
    <feOffset dx="-${f(0.05)}" dy="${f(0.05)}" result="b"/>
    <feFlood flood-color="#000" flood-opacity="1"/>
    <feComposite in2="b" operator="in"/>
    <feMerge><feMergeNode/><feMergeNode/><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
  <g filter="url(#s)"><g transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${scale.toFixed(5)})" fill="#fff">
    ${signature.paths.map(d => `<path d="${d}"/>`).join("\n    ")}
  </g></g>
</svg>`);
}

// --- Metadata ------------------------------------------------------------------
// The published images only carry the copyright, the author, and the shooting
// information of the original: no serial numbers, GPS, owner, maker notes or
// embedded thumbnail.

const TYPE_SIZES = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
const IFD0_TAGS = [0x010f, 0x0110];   // Make, Model
const EXIF_TAGS = [
  0x829a, 0x829d, 0x8822, 0x8827,     // ExposureTime, FNumber, ExposureProgram, ISO
  0x9003, 0x9204, 0x9207,             // DateTimeOriginal, ExposureBiasValue, MeteringMode
  0x9209, 0x920a, 0xa402, 0xa403,     // Flash, FocalLength, ExposureMode, WhiteBalance
  0xa405, 0xa434,                     // FocalLengthIn35mmFormat, LensModel
];

// Reads the given tags of an IFD of a TIFF (EXIF) buffer, as raw values in
// little-endian order: { tag: { type, count, data } }.
function readIfd(tiff, offset, tags) {
  const le = tiff[2] === 0x2a;   // the magic number, more reliable than "II"/"MM"
  const u16 = o => le ? tiff.readUInt16LE(o) : tiff.readUInt16BE(o);
  const u32 = o => le ? tiff.readUInt32LE(o) : tiff.readUInt32BE(o);
  const entries = {}, offsets = {};
  for (let i = 0, n = u16(offset); i < n; i++) {
    const e = offset + 2 + i * 12, tag = u16(e), type = u16(e + 2), count = u32(e + 4);
    const size = TYPE_SIZES[type];
    offsets[tag] = size * count <= 4 ? e + 8 : u32(e + 8);
    if (!tags.includes(tag) || !size) continue;
    const at = size * count <= 4 ? e + 8 : u32(e + 8);
    const data = Buffer.from(tiff.subarray(at, at + size * count));
    if (!le && size > 1) {             // convert components to little-endian
      const unit = type === 5 || type === 10 ? 4 : size;
      for (let j = 0; j < data.length; j += unit) data.subarray(j, j + unit).reverse();
    }
    entries[tag] = { type, count, data };
  }
  return { entries, offsets, exifOffset: offsets[0x8769] && u32(offsets[0x8769]) };
}

// Builds a little-endian TIFF with IFD0 and an Exif IFD.
function writeTiff(ifd0, exif) {
  const ifdSize = entries => 2 + Object.keys(entries).length * 12 + 4;
  ifd0 = { ...ifd0, 0x013b: ascii(AUTHOR), 0x8298: ascii(COPYRIGHT), 0x8769: { type: 4, count: 1, data: Buffer.alloc(4) } };
  const exifStart = 8 + ifdSize(ifd0);
  const chunks = [];
  let dataOffset = exifStart + ifdSize(exif);
  const ifdBuffer = entries => {
    const tags = Object.keys(entries).map(Number).sort((a, b) => a - b);
    const buf = Buffer.alloc(ifdSize(entries));
    buf.writeUInt16LE(tags.length, 0);
    tags.forEach((tag, i) => {
      const { type, count, data } = entries[tag], e = 2 + i * 12;
      buf.writeUInt16LE(tag, e); buf.writeUInt16LE(type, e + 2); buf.writeUInt32LE(count, e + 4);
      if (tag === 0x8769) buf.writeUInt32LE(exifStart, e + 8);
      else if (data.length <= 4) data.copy(buf, e + 8);
      else {
        buf.writeUInt32LE(dataOffset, e + 8);
        const padded = data.length % 2 ? Buffer.concat([data, Buffer.alloc(1)]) : data;
        chunks.push(padded);
        dataOffset += padded.length;
      }
    });
    return buf;
  };
  const header = Buffer.from([0x49, 0x49, 0x2a, 0, 8, 0, 0, 0]);
  const b0 = ifdBuffer(ifd0), b1 = ifdBuffer(exif);
  return Buffer.concat([header, b0, b1, ...chunks]);
}

const xmp = Buffer.from(`<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:dc="http://purl.org/dc/elements/1.1/"
    xmlns:xmpRights="http://ns.adobe.com/xap/1.0/rights/"
    xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/">
   <dc:creator><rdf:Seq><rdf:li>${AUTHOR}</rdf:li></rdf:Seq></dc:creator>
   <dc:rights><rdf:Alt><rdf:li xml:lang="x-default">${COPYRIGHT}</rdf:li></rdf:Alt></dc:rights>
   <xmpRights:Marked>True</xmpRights:Marked>
   <photoshop:Credit>${AUTHOR}</photoshop:Credit>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="r"?>`, "utf8");

const ascii = s => { const data = Buffer.from(s + "\0", "utf8"); return { type: 2, count: data.length, data }; };

const app1 = (prefix, payload) => {
  const len = Buffer.alloc(2);
  len.writeUInt16BE(2 + prefix.length + payload.length);
  return Buffer.concat([Buffer.from([0xff, 0xe1]), len, prefix, payload]);
};

// EXIF + XMP segments for the images of an original.
function metadataSegments(id, originalExif) {
  let ifd0 = {}, exif = {};
  if (originalExif && originalExif.toString("latin1", 0, 6) === "Exif\0\0") try {
    const tiff = originalExif.subarray(6);
    const le = tiff[2] === 0x2a;   // the magic number, more reliable than "II"/"MM"
    const first = le ? tiff.readUInt32LE(4) : tiff.readUInt32BE(4);
    const r0 = readIfd(tiff, first, IFD0_TAGS);
    ifd0 = r0.entries;
    if (r0.exifOffset) {
      const r1 = readIfd(tiff, r0.exifOffset, EXIF_TAGS);
      exif = r1.entries;
      // Canon cameras of that time only stored the lens in their maker notes
      // (an IFD whose tag 0x95 is the lens model).
      const make = ifd0[0x010f]?.data.toString("latin1") ?? "";
      if (!exif[0xa434] && make.startsWith("Canon") && r1.offsets[0x927c]) {
        try {
          const lens = readIfd(tiff, r1.offsets[0x927c], [0x0095]).entries[0x0095]?.data.toString("latin1").replace(/\0.*$/s, "").trim();
          if (lens) exif[0xa434] = ascii(lens);
        } catch { /* unreadable maker notes: no lens */ }
      }
    }
  } catch (e) {
    console.warn(`\nPost ${id}: unreadable EXIF data (${e.message}), only the copyright is kept.`);
    ifd0 = {}; exif = {};
  }
  exif[0x9000] = { type: 7, count: 4, data: Buffer.from("0230") };   // ExifVersion (LensModel is from 2.3)
  return Buffer.concat([app1(Buffer.from("Exif\0\0", "latin1"), writeTiff(ifd0, exif)),
                        app1(Buffer.from("http://ns.adobe.com/xap/1.0/\0", "latin1"), xmp)]);
}

// Replaces the metadata of a JPEG (APPn and COM segments, except the ICC
// profile) with the given segments.
function withMetadata(jpeg, segments) {
  const kept = [];
  let i = 2;
  while (jpeg[i] === 0xff && jpeg[i + 1] !== 0xda) {
    const marker = jpeg[i + 1], len = jpeg.readUInt16BE(i + 2);
    const isIcc = marker === 0xe2 && jpeg.toString("latin1", i + 4, i + 15) === "ICC_PROFILE";
    if (!((marker >= 0xe0 && marker <= 0xef) || marker === 0xfe) || isIcc) kept.push(jpeg.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  return Buffer.concat([jpeg.subarray(0, 2), segments, ...kept, jpeg.subarray(i)]);
}

// --- Generation ------------------------------------------------------------------

function write(file, data) {
  fs.writeFileSync(file + ".tmp", data);
  fs.renameSync(file + ".tmp", file);
}

async function processPost({ id, width, height }) {
  const source = path.join(originals, `${id}.jpg`);
  const outputs = [...photoSizes(width, height).map(s => ({ ...s, file: photoFile(id, s.width) })),
                   { thumb: true, file: thumbFile(id) }].filter(o => !fs.existsSync(path.join(root, o.file)));
  if (!outputs.length) return false;
  if (!fs.existsSync(source)) throw new Error(`${source} is missing (is the originals/ submodule checked out?)`);
  const original = sharp(source, { failOn: "none" });
  const meta = await original.metadata();
  if (meta.width !== width || meta.height !== height)
    throw new Error(`Post ${id}: the original is ${meta.width}x${meta.height}, the post says ${width}x${height}.`);
  const segments = metadataSegments(id, meta.exif);
  for (const o of outputs) {
    let jpeg;
    if (o.thumb) {
      const oldThumb = path.join(originals, "mini", `${id}.jpg`);
      if (fs.existsSync(oldThumb)) jpeg = fs.readFileSync(oldThumb);
      else {
        const scale = Math.min(1, THUMB_BOX / width, THUMB_BOX / height);
        jpeg = await original.clone().resize(Math.floor(width * scale), Math.floor(height * scale), { fit: "fill" })
          .jpeg({ quality: QUALITY, mozjpeg: true }).toBuffer();
      }
    } else {
      jpeg = await original.clone()
        .resize(o.width, o.height, { fit: "fill", kernel: "lanczos3" })
        .composite([{ input: signatureSvg(o.width, o.height), top: 0, left: 0 }])
        .jpeg({ quality: QUALITY, mozjpeg: true }).toBuffer();
    }
    write(path.join(root, o.file), withMetadata(jpeg, segments));
  }
  return true;
}

// id, width and height from the front matter of posts/*.md.
function readPosts() {
  const dir = path.join(root, "posts");
  return fs.readdirSync(dir).filter(f => f.endsWith(".md")).map(f => {
    const text = fs.readFileSync(path.join(dir, f), "utf8");
    const field = name => Number(text.match(new RegExp(`^${name}: *(\\d+) *$`, "m"))?.[1]);
    const post = { id: field("id"), width: field("width"), height: field("height") };
    if (!post.id || !post.width || !post.height) throw new Error(`posts/${f}: id, width and height are required.`);
    return post;
  }).sort((a, b) => a.id - b.id);
}

if (process.argv[1] === import.meta.filename) {
  fs.mkdirSync(path.join(root, "photos"), { recursive: true });
  const ids = process.argv.slice(2).map(Number);
  const todo = readPosts().filter(p => !ids.length || ids.includes(p.id));
  let done = 0;
  const worker = async () => {
    for (let post; (post = todo.shift());)
      if (await processPost(post)) process.stdout.write(`\r${++done} photos processed`);
  };
  await Promise.all(Array.from({ length: Math.max(1, os.availableParallelism() / 2) }, worker));
  console.log(done ? "" : "All images are up to date.");
}
