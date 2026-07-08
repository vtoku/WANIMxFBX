import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const URL = "http://localhost:5173/";
const WANIM = "C:\\Users\\VTOKU\\Downloads\\takyon take 2.wanim";
const VRM = "C:\\Users\\VTOKU\\Downloads\\AshtonMartenARKIT.vrm";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
await page.goto(URL, { waitUntil: "networkidle" });
await page.setInputFiles("#file-input", { name: "c.wanim", mimeType: "application/octet-stream", buffer: readFileSync(WANIM) });
await page.waitForSelector("#loaded-state:not([hidden])", { timeout: 20000 });
await page.waitForTimeout(1200);
await page.selectOption("#body", "vrm").catch(() => {});
await page.setInputFiles("#bodyfile", { name: "v.vrm", mimeType: "application/octet-stream", buffer: readFileSync(VRM) });
await page.waitForTimeout(4000);
const cv = await page.$("#viewport canvas"); const b = await cv.boundingBox();
await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
for (let i = 0; i < 12; i++) await page.mouse.wheel(0, 240); // frame whole body
await page.waitForTimeout(600);
// pause
await page.click("#viewport .transport-overlay button").catch(() => {});
await page.waitForTimeout(200);
// clip the neck/upper-chest region of the framed figure
await page.screenshot({ path: "scripts/neck-crop.png", clip: { x: 250, y: 290, width: 280, height: 220 } });
console.log("neck-crop.png");
await browser.close();
