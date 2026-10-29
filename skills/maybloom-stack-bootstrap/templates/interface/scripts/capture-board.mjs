// Captures the design board: one PNG per view and width, and one probes.json
// of mechanical checks (overflow, nested interactives, focus rings, contrast,
// console output), so a designer or a critic reads a small JSON and opens
// only the shots it needs. Serve the board first (`pnpm gallery`), then:
//
//   node scripts/capture-board.mjs [--base-url http://localhost:8082]
//     [--view pages@390 --view components/NoteRow@768 ...]
//     [--out .board-captures] [--strict]
//
// With no --view it captures every tab at every width. A view is the
// board's own hash form: `<tab>[/<entry>][@<width>]`; without a width it is
// captured at all of them. Chrome is found by Playwright's `chrome`
// channel; CHROME_PATH points at another binary. Runs on a machine with
// Chrome, not in CI.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('..', import.meta.url));
const MAX_HEIGHT = 8000;
const MAX_ITEMS = 10;
const MAX_TABS = 30;

// The tabs and widths are the board's own: read from its source so a tab
// added there is captured here with no edit.
const gallerySrc = readFileSync(join(root, 'src/gallery/Gallery.tsx'), 'utf8');
const tabsBlock = gallerySrc.match(/const tabs = \{([\s\S]*?)\n\}/)?.[1] ?? '';
const tabIds = [...tabsBlock.matchAll(/^ {2}(\w+): \{/gm)].map((m) => m[1]);
const layoutSrc = readFileSync(join(root, 'src/gallery/layout.tsx'), 'utf8');
const widths = [...layoutSrc.matchAll(/\{ width: (\d+), height: \d+ \}/g)].map(
  (m) => Number(m[1]),
);
const { testID: sentinel } = JSON.parse(
  readFileSync(join(root, 'src/gallery/sentinel.json'), 'utf8'),
);
if (tabIds.length === 0 || widths.length === 0) {
  console.error(
    'capture-board: could not read the tabs or widths from src/gallery; has the board changed shape?',
  );
  process.exit(2);
}

function parseArgs(argv) {
  const opts = {
    baseUrl: 'http://localhost:8082',
    out: '.board-captures',
    views: [],
    strict: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) fail(`${a} needs a value`);
      return v;
    };
    if (a === '--base-url') opts.baseUrl = value();
    else if (a === '--view') opts.views.push(value());
    else if (a === '--out') opts.out = value();
    else if (a === '--strict') opts.strict = true;
    else fail(`unknown argument ${a}`);
  }
  return opts;
}

function fail(message) {
  console.error(`capture-board: ${message}`);
  process.exit(2);
}

const opts = parseArgs(process.argv.slice(2));

// Expand the views into (where, width) pairs.
const targets = [];
for (const view of opts.views.length > 0 ? opts.views : tabIds) {
  const [where, w] = view.split('@');
  if (!tabIds.includes(where.split('/')[0])) {
    fail(`unknown tab in view "${view}" (tabs: ${tabIds.join(', ')})`);
  }
  if (w !== undefined && !widths.includes(Number(w))) {
    fail(`unknown width in view "${view}" (widths: ${widths.join(', ')})`);
  }
  for (const width of w === undefined ? widths : [Number(w)]) {
    targets.push({ where, width });
  }
}

const launch = process.env.CHROME_PATH
  ? { executablePath: process.env.CHROME_PATH }
  : { channel: 'chrome' };
let browser;
try {
  browser = await chromium.launch(launch);
} catch (err) {
  const first = String(err.message).split('\n')[0];
  fail(
    `could not start Chrome (${first}). Install Google Chrome, or set CHROME_PATH to a Chrome or Chromium binary.`,
  );
}

mkdirSync(opts.out, { recursive: true });

// The probes run inside the page. Written as one function so that
// page.evaluate serialises it whole; it returns the four DOM checks.
function domProbes({ maxItems }) {
  const cap = (items) => ({ count: items.length, items: items.slice(0, maxItems) });
  const all = [...document.body.querySelectorAll('*')];

  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return (
      r.width > 0 &&
      r.height > 0 &&
      s.visibility !== 'hidden' &&
      s.display !== 'none'
    );
  };
  const nameOf = (el) => {
    const id =
      el.getAttribute('data-testid') ||
      el.closest('[data-testid]')?.getAttribute('data-testid');
    const own = el.getAttribute('data-testid');
    const role =
      el.getAttribute('role') ||
      { A: 'link', BUTTON: 'button', INPUT: 'textbox' }[el.tagName] ||
      el.tagName.toLowerCase();
    const label = (
      el.getAttribute('aria-label') ||
      el.innerText ||
      el.getAttribute('title') ||
      ''
    )
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 40);
    if (own) return own;
    if (label) return `${role} "${label}"${id ? ` in ${id}` : ''}`;
    if (id) return `${role} in ${id}`;
    const cls = [...el.classList].slice(0, 2).join('.');
    return cls ? `${el.tagName.toLowerCase()}.${cls}` : el.tagName.toLowerCase();
  };

  // The scrolling ancestors of an element, nearest first.
  const scrollers = (el) => {
    const out = [];
    for (let p = el.parentElement; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (/(auto|scroll)/.test(s.overflowX)) out.push(p);
    }
    return out;
  };

  // overflow: the page itself, then boxes that pass the window's right edge
  // outside a horizontal scroller, then non-scrolling boxes whose text is
  // clipped sideways.
  const overflow = [];
  const html = document.documentElement;
  if (html.scrollWidth > html.clientWidth) {
    overflow.push({
      el: 'html',
      kind: 'page',
      scrollWidth: html.scrollWidth,
      clientWidth: html.clientWidth,
    });
  }
  for (const el of all) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > window.innerWidth + 1 && scrollers(el).length === 0) {
      overflow.push({
        el: nameOf(el),
        kind: 'past-edge',
        right: Math.round(r.right),
        window: window.innerWidth,
      });
      continue;
    }
    const s = getComputedStyle(el);
    const scrolls = /(auto|scroll)/.test(s.overflowX);
    const hasText = [...el.childNodes].some(
      (n) => n.nodeType === 3 && n.textContent.trim() !== '',
    );
    if (
      !scrolls &&
      hasText &&
      el.scrollWidth > el.clientWidth + 1 &&
      el.clientWidth > 0
    ) {
      overflow.push({
        el: nameOf(el),
        kind: 'clipped',
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      });
    }
  }

  // nested: an interactive element inside another. The control set is the
  // one the scaffold's fake backend treats as pressable; react-native-web
  // renders a Pressable as a div with a role or a tabindex, not a button.
  const controls =
    'button, a, [role=button], [role=tab], [role=checkbox], [role=switch], [tabindex="0"]';
  const nested = [...document.querySelectorAll(controls)]
    .map((el) => [el, el.parentElement?.closest(controls)])
    .filter(([, outer]) => outer)
    .map(([el, outer]) => ({ el: nameOf(el), inside: nameOf(outer) }));

  // contrast: text against the first non-transparent background above it.
  const parse = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return { r, g, b, a };
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const over = (top, under) => ({
    r: top.r * top.a + under.r * (1 - top.a),
    g: top.g * top.a + under.g * (1 - top.a),
    b: top.b * top.a + under.b * (1 - top.a),
    a: 1,
  });
  const backdrop = (el) => {
    const layers = [];
    for (let p = el; p; p = p.parentElement) {
      const c = parse(getComputedStyle(p).backgroundColor);
      if (c && c.a > 0) {
        layers.push(c);
        if (c.a === 1) break;
      }
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (const c of layers.reverse()) base = over(c, base);
    return base;
  };
  const contrast = [];
  for (const el of all) {
    const text = [...el.childNodes].some(
      (n) => n.nodeType === 3 && n.textContent.trim() !== '',
    );
    if (!text || !visible(el)) continue;
    const s = getComputedStyle(el);
    const fg = parse(s.color);
    if (!fg || fg.a === 0) continue;
    const bg = backdrop(el);
    const text2 = over(fg, bg);
    const l1 = lum(text2);
    const l2 = lum(bg);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const size = Number.parseFloat(s.fontSize);
    const bold = Number(s.fontWeight) >= 700;
    const large = size >= 24 || (bold && size >= 18.66);
    const need = large ? 3 : 4.5;
    if (ratio < need) {
      contrast.push({
        el: nameOf(el),
        ratio: Math.round(ratio * 100) / 100,
        need,
        color: s.color,
        background: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`,
      });
    }
  }

  return {
    overflow: cap(overflow),
    nested: cap(nested),
    contrast: cap(contrast),
  };
}

// The element that scrolls the board's sheet: the tallest vertical scroller
// on the first call, and the same element on every later one, so a specimen
// with a scroller of its own is not mistaken for the sheet.
function measureScroller() {
  let best = window.__captureScroller ?? null;
  if (!best) {
    for (const el of document.body.querySelectorAll('*')) {
      const s = getComputedStyle(el);
      if (!/(auto|scroll)/.test(s.overflowY)) continue;
      if (el.scrollHeight <= el.clientHeight) continue;
      if (!best || el.scrollHeight > best.scrollHeight) best = el;
    }
    window.__captureScroller = best;
  }
  if (!best) {
    const d = document.documentElement;
    return { scrollHeight: d.scrollHeight, chrome: 0 };
  }
  return {
    scrollHeight: best.scrollHeight,
    // The window's height that is not the scroller's: the toolbar above it.
    chrome: window.innerHeight - best.clientHeight,
  };
}

const summary = [];
const results = [];
const context = await browser.newContext({
  viewport: { width: 390, height: 900 },
});

for (const { where, width } of targets) {
  const page = await context.newPage();
  const logs = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') {
      logs.push({ type: m.type(), text: m.text().replace(/\s+/g, ' ').slice(0, 200) });
    }
  });
  page.on('pageerror', (e) =>
    logs.push({ type: 'pageerror', text: String(e.message).slice(0, 200) }),
  );

  const label = `${where}@${width}`;
  const png = `${label.replaceAll('/', '_')}.png`;
  await page.setViewportSize({ width, height: 900 });
  try {
    await page.goto(`${opts.baseUrl}/#${encodeURI(where)}@${width}`, {
      waitUntil: 'commit',
    });
  } catch {
    await browser.close();
    fail(
      `could not open ${opts.baseUrl}; serve the board first (pnpm gallery) or pass --base-url`,
    );
  }
  // Navigating to the same document with a new hash does not reload it, but
  // each view is its own page, so the first goto is a full load.
  try {
    await page.waitForSelector(`[data-testid="${sentinel}"]`, { timeout: 60000 });
  } catch {
    await browser.close();
    fail(
      `the board did not render at ${opts.baseUrl}; is it served (pnpm gallery) and is the URL right?`,
    );
  }
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(700);

  // Size the window to the whole sheet. fullPage would capture only the
  // window, because the sheet scrolls inside it.
  let heightCapped = false;
  for (let pass = 0; pass < 3; pass++) {
    const { scrollHeight, chrome } = await page.evaluate(measureScroller);
    const wanted = scrollHeight + chrome;
    heightCapped = wanted > MAX_HEIGHT;
    await page.setViewportSize({ width, height: Math.min(wanted, MAX_HEIGHT) });
    await page.waitForTimeout(150);
  }
  await page.evaluate(() => {
    for (const el of document.body.querySelectorAll('*')) {
      if (el.scrollTop) el.scrollTop = 0;
    }
  });

  const [, entry] = where.split(/\/(.+)/);
  const section = entry ? page.locator(`[id="${where}"]`) : null;
  if (section && (await section.count()) === 0) {
    await browser.close();
    fail(`no section "${entry}" on the ${where.split('/')[0]} tab (view "${label}")`);
  }
  if (section) {
    await section.first().screenshot({ path: join(opts.out, png) });
  } else {
    await page.screenshot({ path: join(opts.out, png) });
  }

  const dom = await page.evaluate(domProbes, { maxItems: MAX_ITEMS });
  // The console check covers the load; the Tab walk and the click below may
  // log on their own (a click can switch tabs).
  const loadLogs = logs.slice();

  // focus: Tab through the stops; then a pointer click on the first one.
  const ringScript = () => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const s = getComputedStyle(el);
    const outline = s.outlineStyle !== 'none' && Number.parseFloat(s.outlineWidth) > 0;
    const shadow = s.boxShadow !== 'none';
    const label = (
      el.getAttribute('data-testid') ||
      `${el.getAttribute('role') || el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40)}"`
    );
    return {
      el: label,
      focusVisible: el.matches(':focus-visible'),
      ring: outline || shadow,
    };
  };
  const stops = [];
  await page.evaluate(() => document.body.focus());
  for (let i = 0; i < MAX_TABS; i++) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(ringScript);
    if (!stop) break;
    if (stops.length > 0 && stops[0].el === stop.el && stops.length > 1) break;
    stops.push(stop);
  }
  const noRing = stops.filter((s) => !(s.focusVisible && s.ring));
  let pointer = null;
  const first = page.locator('button, a[href], [role=button], [role=tab], [tabindex="0"]').first();
  if ((await first.count()) > 0) {
    await page.evaluate(() => document.activeElement?.blur());
    await first.click({ force: true }).catch(() => {});
    pointer = await page.evaluate(ringScript);
    // A click may navigate the hash; the view is already captured.
  }
  const focus = {
    count: noRing.length,
    stops: stops.length,
    items: noRing.slice(0, MAX_ITEMS),
    pointerRing: pointer ? pointer.ring : null,
    pointerTarget: pointer ? pointer.el : null,
  };

  const consoleCheck = {
    count: loadLogs.length,
    items: loadLogs.slice(0, MAX_ITEMS),
  };

  results.push({
    view: where,
    width,
    png: join(opts.out, png),
    heightCapped,
    overflow: dom.overflow,
    nested: dom.nested,
    focus,
    contrast: dom.contrast,
    console: consoleCheck,
  });
  const pointerBad = pointer?.ring === true;
  summary.push(
    `${label}  overflow ${dom.overflow.count}  nested ${dom.nested.count}  focus ${noRing.length}/${stops.length} no ring${pointerBad ? ' (+ring after click)' : ''}  contrast ${dom.contrast.count}  console ${loadLogs.length}${heightCapped ? '  height capped' : ''}`,
  );
  await page.close();
}

await browser.close();

writeFileSync(
  join(opts.out, 'probes.json'),
  `${JSON.stringify({ baseUrl: opts.baseUrl, capturedAt: new Date().toISOString(), views: results }, null, 2)}\n`,
);
for (const line of summary) console.log(line);
console.log(`wrote ${results.length} views to ${join(opts.out, 'probes.json')}`);

const failed = results.some(
  (r) =>
    r.overflow.count > 0 ||
    r.nested.count > 0 ||
    r.focus.count > 0 ||
    r.focus.pointerRing === true ||
    r.contrast.count > 0 ||
    r.console.count > 0,
);
if (opts.strict && failed) process.exit(1);
