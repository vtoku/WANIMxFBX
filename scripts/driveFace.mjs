import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const URL = process.env.APP_URL ?? "http://localhost:5173/WANIMxFBX/";
const WANIM = process.argv[2] ?? "C:\\Users\\VTOKU\\Downloads\\All-The-Things-2-2026-05-24-18-55-10.wanim";

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
// give the async facecap GLB load time to attach
await page.waitForTimeout(2500);

// pause and seek to an expressive moment, then screenshot the head region.
await page.click("#play"); // pause
const scrub = await page.$("#scrub");
for (const frac of [0.1, 0.3, 0.5]) {
  await scrub.evaluate((el, f) => {
    el.value = String(Math.round(f * 1000));
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, frac);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `scripts/face-${Math.round(frac * 100)}.png` });
}
console.log("shots: face-10/30/50.png");
if (errors.length) { console.log("ERRORS:"); errors.slice(0, 8).forEach((e) => console.log("  ", e)); }
await browser.close();
