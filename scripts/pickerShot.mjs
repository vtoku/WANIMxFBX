import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const URL = process.env.APP_URL ?? "http://localhost:5173/";
const WANIM = process.argv[2] ?? "C:\\Users\\VTOKU\\Downloads\\2026-03-18-03-37-56.wanim";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(URL, { waitUntil: "networkidle" });
const buf = readFileSync(WANIM);
await page.setInputFiles("#file-input", { name: WANIM.split(/[\\/]/).pop(), mimeType: "application/octet-stream", buffer: buf });
await page.waitForSelector("#loaded-state:not([hidden])", { timeout: 20000 });

// Rig tab.
await page.click('.dock-tab[data-tab="rig"]');
// Add a layer so handles + editor come up.
await page.click("#rigAdd");
await page.waitForTimeout(400);

const pickerVisible = await page.$eval("#pickerMount .picker-svg", (el) => !!el.getBoundingClientRect().width).catch(() => false);
console.log("picker svg present:", pickerVisible);
const nodeCount = await page.$$eval("#pickerMount .picker-node", (els) => els.filter((e) => getComputedStyle(e).display !== "none").length);
console.log("visible picker nodes:", nodeCount);
const ikfk = await page.$$eval("#ikfkSliders input", (els) => els.length);
console.log("ikfk sliders:", ikfk);
const handPose = await page.$eval("#handPose", (el) => !el.hidden).catch(() => false);
console.log("hand pose group present (hidden until hand click):", await page.$eval("#handPose", (el) => el.hidden));

await page.screenshot({ path: "scripts/picker-shot.png" });
console.log("shot: scripts/picker-shot.png");

// Click the left hand region -> opens finger sub-picker.
await page.click('#pickerMount .picker-node:has(title:text-is("Left hand"))').catch(async () => {
  // Fallback: click by index (leftHand is node #12 in NODES order among visible).
  const handles = await page.$$("#pickerMount .picker-node");
  await handles[11].click();
});
await page.waitForTimeout(300);
const subOpen = await page.$eval("#pickerMount .picker-sub", (el) => !el.hidden).catch(() => false);
const segBtns = await page.$$eval("#pickerMount .picker-seg", (els) => els.length);
console.log("finger sub-picker open:", subOpen, "segment buttons:", segBtns);
const selClass = await page.$$eval("#pickerMount .picker-node.sel", (els) => els.length);
console.log("selected picker nodes:", selClass);

await page.screenshot({ path: "scripts/picker-fingers-shot.png" });
console.log("shot: scripts/picker-fingers-shot.png");

await browser.close();
if (errors.length) { console.log("CONSOLE ERRORS:"); for (const e of errors.slice(0, 10)) console.log("  ", e); }
console.log(errors.length ? "ERRORS" : "OK");
