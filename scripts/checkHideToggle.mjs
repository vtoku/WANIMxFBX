import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const URL = process.env.APP_URL ?? "http://localhost:5173/WANIMxFBX/";
const WANIM = "C:\\Users\\VTOKU\\Downloads\\2026-03-18-03-37-56.wanim";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(URL, { waitUntil: "networkidle" });

const vis = (sel) => page.$eval(sel, (e) => e.offsetParent !== null || e.getClientRects().length > 0);

// Home: empty visible, loaded hidden.
console.log("HOME  empty:", await vis("#empty-state"), " loaded:", await vis("#loaded-state"));
await page.screenshot({ path: "scripts/home-fixed.png", fullPage: true });

// Load a file.
await page.setInputFiles("#file-input", {
  name: "2026-03-18-03-37-56.wanim",
  mimeType: "application/octet-stream",
  buffer: readFileSync(WANIM),
});
await page.waitForSelector("#loaded-state:not([hidden])", { timeout: 20000 });
await page.waitForTimeout(500);
console.log("AFTER empty:", await vis("#empty-state"), " loaded:", await vis("#loaded-state"));

await browser.close();
console.log("OK");
