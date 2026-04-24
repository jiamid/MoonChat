import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const rootDir = process.cwd();
const sourceLogoPath = path.join(rootDir, "logo.png");
const buildDir = path.join(rootDir, "build");
const iconsetDir = path.join(buildDir, "icon.iconset");
const icnsPath = path.join(buildDir, "icon.icns");
const pngPath = path.join(buildDir, "icon.png");

if (!fs.existsSync(sourceLogoPath)) {
  console.error(`Missing source logo: ${sourceLogoPath}`);
  process.exit(1);
}

fs.mkdirSync(buildDir, { recursive: true });
fs.rmSync(iconsetDir, { recursive: true, force: true });
fs.mkdirSync(iconsetDir, { recursive: true });
fs.copyFileSync(sourceLogoPath, pngPath);

const iconVariants = [
  { size: 16, file: "icon_16x16.png" },
  { size: 32, file: "icon_16x16@2x.png" },
  { size: 32, file: "icon_32x32.png" },
  { size: 64, file: "icon_32x32@2x.png" },
  { size: 128, file: "icon_128x128.png" },
  { size: 256, file: "icon_128x128@2x.png" },
  { size: 256, file: "icon_256x256.png" },
  { size: 512, file: "icon_256x256@2x.png" },
  { size: 512, file: "icon_512x512.png" },
  { size: 1024, file: "icon_512x512@2x.png" },
];

for (const variant of iconVariants) {
  const outputPath = path.join(iconsetDir, variant.file);
  const resizeResult = spawnSync(
    "sips",
    ["-z", String(variant.size), String(variant.size), sourceLogoPath, "--out", outputPath],
    { stdio: "inherit" },
  );
  if (resizeResult.status !== 0) {
    process.exit(resizeResult.status ?? 1);
  }
}

const iconutilResult = spawnSync("iconutil", ["-c", "icns", iconsetDir, "-o", icnsPath], {
  stdio: "inherit",
});

if (iconutilResult.status !== 0) {
  process.exit(iconutilResult.status ?? 1);
}

console.log(`Generated icons:\n- ${pngPath}\n- ${icnsPath}`);
