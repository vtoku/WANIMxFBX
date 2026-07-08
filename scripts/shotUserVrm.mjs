import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const URL = process.env.APP_URL ?? "http://localhost:5173/";
const WANIM = process.argv[2] ?? "C:\\Users\\VTOKU\\Downloads\\takyon take 2.wanim";
const VRM = process.argv[3] ?? "C:\\Users\\VTOKU\\Downloads\\AshtonMartenARKIT.vrm";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(URL, { waitUntil: "networkidle" });
await page.setInputFiles("#file-input", {
  name: WANIM.split(/[\\/]/).pop(),
  mimeType: "application/octet-stream",
  buffer: readFileSync(WANIM),
});
await page.waitForSelector("#loaded-state:not([hidden])", { timeout: 20000 });
await page.waitForTimeout(1500);

// Switch body to user VRM and inject the file.
await page.selectOption("#body", "vrm").catch(() => {});
await page.setInputFiles("#bodyfile", {
  name: VRM.split(/[\\/]/).pop(),
  mimeType: "application/octet-stream",
  buffer: readFileSync(VRM),
});
await page.waitForTimeout(4000); // body retarget + load

// Zoom out to frame the whole figure.
const cv0 = await page.$("#viewport canvas");
const box0 = await cv0.boundingBox();
const zx = box0.x + box0.width / 2;
const zy = box0.y + box0.height / 2;
await page.mouse.move(zx, zy);
for (let i = 0; i < 12; i++) await page.mouse.wheel(0, 240);
await page.waitForTimeout(600);
await page.screenshot({ path: "scripts/uservrm-front.png" });
console.log("shot 1: scripts/uservrm-front.png");

// Orbit the camera by dragging on the canvas to see the back/side.
const cv = await page.$("#viewport canvas");
const box = await cv.boundingBox();
const cx = box.x + box.width / 2;
const cy = box.y + box.height / 2;
await page.mouse.move(cx, cy);
await page.mouse.down();
await page.mouse.move(cx + 260, cy, { steps: 20 }); // yaw ~180-ish
await page.mouse.up();
await page.waitForTimeout(800);
await page.screenshot({ path: "scripts/uservrm-side.png" });
console.log("shot 2: scripts/uservrm-side.png");

await page.mouse.move(cx, cy);
await page.mouse.down();
await page.mouse.move(cx + 260, cy, { steps: 20 });
await page.mouse.up();
await page.waitForTimeout(800);
await page.screenshot({ path: "scripts/uservrm-back.png" });
console.log("shot 3: scripts/uservrm-back.png");

if (errors.length) {
  console.log("CONSOLE ERRORS:");
  for (const e of errors.slice(0, 12)) console.log("  ", e);
}
await browser.close();
