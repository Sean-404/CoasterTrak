/**
 * One-shot: render email headings with the real Bungee font.
 *
 *   npm i -D @napi-rs/canvas
 *   npm run email:render-headings
 *   npm uninstall @napi-rs/canvas
 *
 * Font file: scripts/assets/Bungee-Regular.ttf (from google/fonts ofl/bungee).
 */
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const FONT_CANDIDATES = [
  path.join(ROOT, "scripts/assets/Bungee-Regular.ttf"),
  path.join(ROOT, "scripts/assets/Bungee.ttf"),
];
const OUT_DIR = path.join(ROOT, "public/email");

const HEADINGS = [
  { file: "heading-friend-request.png", text: "New friend request", color: "#0f172a" },
  { file: "heading-friend-accepted.png", text: "Friend request accepted", color: "#0f172a" },
  { file: "heading-weekly-digest.png", text: "Your week on CoasterTrak", color: "#0f172a", size: 30 },
  { file: "wordmark.png", text: "COASTERTRAK", color: "#b45309", size: 28 },
] as const;

function resolveFont(): string {
  for (const candidate of FONT_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    `Bungee font not found. Place Bungee-Regular.ttf in scripts/assets/ (from google/fonts ofl/bungee).`,
  );
}

function renderTextPng(opts: {
  text: string;
  color: string;
  fontSize: number;
  paddingX?: number;
  paddingY?: number;
}): Buffer {
  const paddingX = opts.paddingX ?? 8;
  const paddingY = opts.paddingY ?? 6;
  const measure = createCanvas(1, 1);
  const mctx = measure.getContext("2d");
  mctx.font = `${opts.fontSize}px Bungee`;
  const metrics = mctx.measureText(opts.text);
  const textWidth = Math.ceil(metrics.width);
  const ascent = Math.ceil(metrics.actualBoundingBoxAscent || opts.fontSize * 0.8);
  const descent = Math.ceil(metrics.actualBoundingBoxDescent || opts.fontSize * 0.2);
  const width = textWidth + paddingX * 2;
  const height = ascent + descent + paddingY * 2;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  // Transparent background — email HTML supplies cream/white behind it.
  ctx.clearRect(0, 0, width, height);
  ctx.font = `${opts.fontSize}px Bungee`;
  ctx.fillStyle = opts.color;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(opts.text, paddingX, paddingY + ascent);
  return canvas.toBuffer("image/png");
}

function main() {
  const fontPath = resolveFont();
  GlobalFonts.registerFromPath(fontPath, "Bungee");
  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const heading of HEADINGS) {
    const fontSize = "size" in heading && heading.size ? heading.size : 36;
    const buf = renderTextPng({
      text: heading.text,
      color: heading.color,
      fontSize,
    });
    const out = path.join(OUT_DIR, heading.file);
    fs.writeFileSync(out, buf);
    console.log(`wrote ${path.relative(ROOT, out)} (${buf.length} bytes)`);
  }
}

main();
