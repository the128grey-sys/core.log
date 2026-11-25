/**
 * Regression tests for core.log (index.html).
 *
 * Bug: the article list had no tag filter bar at all, so browsing a growing
 * log meant reading every row. The fix adds a pill bar that filters the pinned
 * card and the Recent Logs rows through `activeTag`, and keeps
 * runTypewriter(HERO_SCRIPT) started exactly once so opening/closing a
 * hash-routed reader (#/slug) can never wipe or replay the hero text.
 *
 * Run with: npm test   (node --test tests/regression.test.mjs)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const PLAYWRIGHT_CANDIDATES = [
  process.env.PLAYWRIGHT_MODULE,
  "playwright",
  "/opt/appjet/browser/node_modules/playwright/index.js",
].filter(Boolean);

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/opt/appjet/browser-binaries/chromium-1234/chrome-linux64/chrome",
  "/home/user/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome",
  "/opt/appjet/browser-binaries/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell",
].filter(Boolean);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const HERO_FINAL_TEXT = "small binaries, zero drama.";
const FEATURED_SLUG = "false-sharing-at-64-bytes";
const RUST_SLUG = "ring-buffer-wraparound-math";
const POSIX_SLUG = "atomic-file-replace-posix";

let server;
let baseUrl;
let browser;
let chromium;

async function loadPlaywright() {
  const failures = [];
  for (const candidate of PLAYWRIGHT_CANDIDATES) {
    try {
      const mod = await import(candidate);
      return mod.chromium ? mod : mod.default;
    } catch (err) {
      failures.push(`${candidate}: ${err.message}`);
    }
  }
  throw new Error(`Unable to load playwright:\n${failures.join("\n")}`);
}

async function launchBrowser() {
  const errors = [];
  try {
    return await chromium.launch({ headless: true });
  } catch (err) {
    errors.push(`default launch: ${err.message}`);
  }
  for (const executablePath of CHROME_CANDIDATES) {
    try {
      await fs.access(executablePath);
    } catch {
      continue;
    }
    try {
      return await chromium.launch({ headless: true, executablePath });
    } catch (err) {
      errors.push(`${executablePath}: ${err.message}`);
    }
  }
  throw new Error(`Unable to launch chromium:\n${errors.join("\n")}`);
}

function startStaticServer() {
  return new Promise((resolve, reject) => {
    const srv = http.createServer(async (req, res) => {
      try {
        const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
        const relative = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
        const target = path.join(ROOT, relative);
        if (!target.startsWith(ROOT)) {
          res.writeHead(403).end("forbidden");
          return;
        }
        const body = await fs.readFile(target);
        res.writeHead(200, { "content-type": MIME[path.extname(target)] || "application/octet-stream" });
        res.end(body);
      } catch {
        res.writeHead(404, { "content-type": "text/plain" }).end("not found");
      }
    });
    srv.on("error", reject);
    // Listen on all interfaces so container preflight sees a reachable bind.
    srv.listen(0, () => {
      const { port } = srv.address();
      resolve({ srv, url: `http://127.0.0.1:${port}` });
    });
  });
}

async function openPage() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#entriesMount .entry-row", { timeout: 15000 });
  return { page, pageErrors };
}

const pillTags = (page) =>
  page.$$eval("#tagFilterMount .tag-pill", (els) => els.map((el) => el.dataset.tag));

const entryTitles = (page) =>
  page.$$eval("#entriesMount .entry-row h3", (els) => els.map((el) => el.textContent.trim()));

const heroText = (page) => page.$eval("#typewriterText", (el) => el.textContent);

async function waitForHeroFinal(page) {
  await page.waitForFunction(
    (expected) => document.getElementById("typewriterText").textContent === expected,
    HERO_FINAL_TEXT,
    { timeout: 30000 }
  );
}

before(async () => {
  const pw = await loadPlaywright();
  chromium = pw.chromium;
  browser = await launchBrowser();
  const started = await startStaticServer();
  server = started.srv;
  baseUrl = started.url;
});

after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

test("renders a unique-tag filter bar and filters the pinned card plus Recent Logs", async () => {
  const { page, pageErrors } = await openPage();

  // 1. Filter bar exists above the entries list, with one pill per unique tag.
  const tags = await pillTags(page);
  assert.ok(tags.length > 1, "expected a tag filter bar with pills above the entries list");
  assert.equal(tags[0], "all", "the first pill must be the `all` reset");
  assert.equal(new Set(tags).size, tags.length, `duplicate pills rendered: ${tags.join(", ")}`);

  const expectedTags = [
    "cache",
    "concurrency",
    "c++",
    "ring-buffer",
    "bit-twiddling",
    "rust",
    "posix",
    "fsync",
    "reliability",
  ];
  for (const tag of expectedTags) {
    assert.ok(tags.includes(tag), `missing filter pill for #${tag}`);
  }

  const initialPressed = await page.$eval(
    '#tagFilterMount .tag-pill[aria-pressed="true"]',
    (el) => el.dataset.tag
  );
  assert.equal(initialPressed, "all", "activeTag must start as `all`");
  assert.equal((await entryTitles(page)).length, 2, "all 3 articles = 1 pinned + 2 rows");
  assert.equal(await page.$eval("#filterCount", (el) => el.textContent.trim()), "3 entries");
  assert.equal(await page.isVisible(".feature-card"), true, "pinned card visible under `all`");

  // 2. #rust hides the pinned card (cache/concurrency/c++) and narrows the rows.
  await page.click('#tagFilterMount .tag-pill[data-tag="rust"]');
  await page.waitForFunction(() => document.querySelectorAll("#entriesMount .entry-row").length === 1);
  assert.equal(await page.isVisible(".feature-card"), false, "pinned card must hide when it lacks the tag");
  assert.equal(await page.isVisible("#featuredSection"), false, "pinned section must collapse");
  assert.match((await entryTitles(page))[0], /Power-of-Two Ring Buffers/);
  assert.equal(
    await page.$eval('#tagFilterMount .tag-pill[data-tag="rust"]', (el) => el.getAttribute("aria-pressed")),
    "true"
  );
  assert.equal(
    await page.$eval('#tagFilterMount .tag-pill[data-tag="all"]', (el) => el.getAttribute("aria-pressed")),
    "false"
  );
  assert.equal(await page.$eval("#filterCount", (el) => el.textContent.trim()), "showing 1 of 3");

  // 3. Filtering must never touch the hash, so the reader route stays clean.
  assert.equal(await page.evaluate(() => window.location.hash), "", "tag clicks must not change location.hash");

  // 4. #cache keeps the pinned card (it is tagged cache) and empties the rows.
  await page.click('#tagFilterMount .tag-pill[data-tag="cache"]');
  await page.waitForFunction(() => document.querySelectorAll("#entriesMount .entry-row").length === 0);
  assert.equal(await page.isVisible(".feature-card"), true, "pinned card must stay when it matches");
  assert.match(await page.$eval(".card-title", (el) => el.textContent), /False Sharing at 64 Bytes/);
  assert.equal(await page.isVisible("#entriesMount .empty-state"), true, "empty filter needs a visible empty state");
  assert.match(await page.$eval("#entriesMount .empty-state", (el) => el.textContent), /#cache/);

  // 5. `all` restores the unfiltered list.
  await page.click('#tagFilterMount .tag-pill[data-tag="all"]');
  await page.waitForFunction(() => document.querySelectorAll("#entriesMount .entry-row").length === 2);
  assert.equal(await page.isVisible(".feature-card"), true);
  assert.equal(await page.$eval("#filterCount", (el) => el.textContent.trim()), "3 entries");

  assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join(" | ")}`);
  await page.close();
});

test("returning from #/slug never restarts or blanks the hero typewriter", async () => {
  const { page, pageErrors } = await openPage();

  await waitForHeroFinal(page);
  assert.equal(await heroText(page), HERO_FINAL_TEXT);

  // Open the pinned article via a card click -> hash route opens.
  await page.click(".feature-card");
  await page.waitForFunction(
    (slug) => window.location.hash === `#/${slug}`,
    FEATURED_SLUG,
    { timeout: 5000 }
  );
  assert.equal(await page.isVisible("#readerBackdrop.open"), true);

  // While the reader is open the finished hero must stay finished (no replay).
  await page.waitForTimeout(1500);
  assert.equal(await heroText(page), HERO_FINAL_TEXT, "opening #/slug replayed the hero typewriter");

  // Closing the reader (hash -> "") must not replay it either.
  await page.click("#closeReaderBtn");
  await page.waitForFunction(() => !window.location.hash, null, { timeout: 5000 });
  await page.waitForTimeout(1500);
  assert.equal(await heroText(page), HERO_FINAL_TEXT, "closing #/slug replayed the hero typewriter");
  assert.equal(await page.isVisible("#readerBackdrop.open"), false);

  // Direct hash navigation both ways, i.e. browser back/forward style returns.
  await page.evaluate((slug) => { window.location.hash = `#/${slug}`; }, POSIX_SLUG);
  await page.waitForFunction(() => document.querySelector("#readerBackdrop").classList.contains("open"));
  await page.waitForTimeout(1200);
  assert.equal(await heroText(page), HERO_FINAL_TEXT, "deep-linked #/slug replayed the hero typewriter");

  await page.evaluate(() => { window.location.hash = ""; });
  await page.waitForFunction(() => !document.querySelector("#readerBackdrop").classList.contains("open"));
  await page.waitForTimeout(1200);
  assert.equal(await heroText(page), HERO_FINAL_TEXT, "hash reset replayed the hero typewriter");

  // A filter must survive an open/close reader round trip, and still not touch the hero.
  await page.click('#tagFilterMount .tag-pill[data-tag="rust"]');
  await page.waitForFunction(() => document.querySelectorAll("#entriesMount .entry-row").length === 1);
  await page.click(`#entriesMount .entry-row[data-open-slug="${RUST_SLUG}"]`);
  await page.waitForFunction((slug) => window.location.hash === `#/${slug}`, RUST_SLUG, { timeout: 5000 });
  await page.waitForTimeout(900);
  assert.equal(await heroText(page), HERO_FINAL_TEXT, "opening a filtered entry replayed the hero typewriter");

  await page.click("#closeReaderBtn");
  await page.waitForFunction(() => !window.location.hash, null, { timeout: 5000 });
  await page.waitForTimeout(900);
  assert.equal(await heroText(page), HERO_FINAL_TEXT, "returning from a filtered entry replayed the hero typewriter");
  assert.equal(
    await page.$eval('#tagFilterMount .tag-pill[data-tag="rust"]', (el) => el.getAttribute("aria-pressed")),
    "true",
    "active tag must survive the reader round trip"
  );
  assert.equal((await entryTitles(page)).length, 1, "filter must survive the reader round trip");

  assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join(" | ")}`);
  await page.close();
});
