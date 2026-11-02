// Checks the GitHub Pages site before it is deployed: every link resolves, the kit copies are the
// published v1 files, and the page loads cleanly in both colour schemes on a desktop and a phone.
//
//   npm ci --prefix site/tests
//   node site/tests/check-site.mjs
//
// It uses an installed Chrome or Edge, or CHROME_PATH, and falls back to Playwright's own Chromium.
// SITE_CHECK_PORT fixes the port of its local server; by default the system picks a free one.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

// The two packages come from site/tests/package-lock.json. They are loaded by name at run time because
// the repository's lint job never installs them, and a static import would fail its module resolution there.
const load = (name) => import(name);
const { default: axe } = await load("axe-core");
const { chromium } = await load("playwright-core");

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const prefix = "/LightGBM-NativeCUDA/";
const release =
  "https://github.com/yuweiyang9611/LightGBM-NativeCUDA/releases/download/v4.7.0.99-win-cuda132-sm89ptx-r1/";
const types = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

// The kit is copied from yuweiyang9611.github.io/kit/v1 unedited, and a published kit version never changes.
const kit = {
  "assets/lib/favicon.svg": "3ea07acd66b71bcef6462252c4e437ee6622f57898089bbb891410e57b20dc0e",
  "assets/lib/notebook.css": "e5aea068eca83d10ad83a0fbbda3165fbbf0ecf575482066a8d8aba2d137635b",
  "assets/lib/theme.js": "2f26afc56d0152d02f363af644ac51b552a890e02d3e81542795aba6b8d5d5e0",
};

// Old section anchors that links elsewhere may still use.
const anchors = [
  "main",
  "top",
  "overview",
  "changes",
  "pipeline",
  "delivery",
  "validation",
  "compatibility",
];

function browserExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    join(process.env.ProgramFiles ?? "", "Google", "Chrome", "Application", "chrome.exe"),
    join(process.env["ProgramFiles(x86)"] ?? "", "Microsoft", "Edge", "Application", "msedge.exe"),
  ].filter(Boolean);
  return candidates.find(existsSync);
}

const server = createServer(async (request, response) => {
  try {
    const { pathname } = new URL(request.url, "http://localhost");
    if (!pathname.startsWith(prefix)) throw new Error("outside the site");
    let file = resolve(join(root, decodeURIComponent(pathname.slice(prefix.length))));
    if (file !== root && !file.startsWith(root + sep)) throw new Error("outside the site");
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
    response.writeHead(200, {
      "content-type": types[extname(file)] ?? "application/octet-stream",
    });
    response.end(await readFile(file));
  } catch {
    response.writeHead(404);
    response.end();
  }
});
await new Promise((ready) => server.listen(Number(process.env.SITE_CHECK_PORT ?? 0), "127.0.0.1", ready));
const origin = `http://127.0.0.1:${server.address().port}`;
const pageUrl = origin + prefix;

for (const [file, digest] of Object.entries(kit)) {
  const actual = createHash("sha256")
    .update(await readFile(join(root, file)))
    .digest("hex");
  assert.equal(actual, digest, `${file} must be the unedited kit v1 copy`);
}

async function open(browser, { viewport, colorScheme, init }) {
  const context = await browser.newContext({
    viewport,
    colorScheme,
    locale: "zh-CN",
  });
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("requestfailed", (request) => errors.push(`failed: ${request.url()}`));
  page.on("response", (response) => {
    if (response.status() >= 400) errors.push(`${response.status()}: ${response.url()}`);
  });
  await page.goto(pageUrl, {
    waitUntil: "load",
  });
  return {
    context,
    page,
    errors,
  };
}

async function assertAccessible(page, label) {
  await page.addScriptTag({
    content: axe.source,
  });
  const { violations } = await page.evaluate(() =>
    window.axe.run(document, {
      resultTypes: [
        "violations",
      ],
    }),
  );
  const serious = violations.filter((item) =>
    [
      "serious",
      "critical",
    ].includes(item.impact),
  );
  assert.deepEqual(
    serious.map((item) => item.id),
    [],
    `${label} has serious accessibility issues`,
  );
}

const executablePath = browserExecutable();
const browser = await chromium.launch({
  headless: true,
  ...(executablePath
    ? {
        executablePath,
      }
    : {}),
});

try {
  // Links: local files exist, in-page anchors exist, downloads all point at the same release.
  {
    const { context, page, errors } = await open(browser, {
      viewport: {
        width: 1440,
        height: 900,
      },
      colorScheme: "light",
    });
    const links = await page.evaluate(() =>
      [
        ...document.querySelectorAll("a[href], link[href], script[src]"),
      ].map((element) => element.getAttribute("href") ?? element.getAttribute("src")),
    );
    for (const link of links) {
      const url = new URL(link, pageUrl);
      if (link.startsWith("#")) {
        assert.ok(await page.locator(`[id="${link.slice(1)}"]`).count(), `missing anchor ${link}`);
      } else if (url.origin === origin) {
        assert.equal((await fetch(url)).status, 200, `missing file ${link}`);
      } else {
        assert.equal(url.protocol, "https:", `insecure link ${link}`);
        if (url.pathname.includes("/releases/download/")) {
          assert.ok(link.startsWith(release), `download outside the release: ${link}`);
        }
      }
    }
    for (const id of anchors) {
      assert.equal(await page.locator(`[id="${id}"]`).count(), 1, `anchor #${id} must keep working`);
    }
    const image = await page.locator('meta[property="og:image"]').getAttribute("content");
    assert.equal((await fetch(new URL(new URL(image).pathname, origin))).status, 200, "og:image must ship");

    // Only the five kit colours and one family at two weights reach the reading text.
    const type = await page.evaluate(() => {
      const styles = [
        ...document.querySelectorAll("body *"),
      ]
        .filter(
          (element) => element.offsetParent && element.textContent.trim() && !element.closest("code, pre, kbd, samp"),
        )
        .map((element) => getComputedStyle(element));
      return {
        families: [
          ...new Set(styles.map((style) => style.fontFamily)),
        ],
        weights: [
          ...new Set(styles.map((style) => style.fontWeight)),
        ].sort(),
      };
    });
    assert.equal(type.families.length, 1, `more than one family: ${type.families.join(" | ")}`);
    assert.ok(type.families[0].includes("Noto Sans SC"), type.families[0]);
    assert.deepEqual(type.weights, [
      "400",
      "600",
    ]);

    // Chinese typesetting: titles break between phrases, and touching marks are squeezed.
    const titles = await page.locator("h1, h2, h3, .toc-list a").evaluateAll((items) => [
      ...new Set(items.map((item) => getComputedStyle(item).wordBreak)),
    ]);
    assert.deepEqual(titles, [
      "keep-all",
    ]);
    const loose = await page.evaluate(() => {
      const pairs = /[”’][，。、；：？！]|[，。、；：？！][“‘]/;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let count = 0;
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (pairs.test(node.data) && !node.parentElement.closest("code, pre")) count += 1;
      }
      return count;
    });
    assert.equal(loose, 0, "a curly quote touching a comma or full stop must be set at half width");

    // Commands never wrap: each scrolls in its own box.
    const wrapping = await page
      .locator(".cmd code, .nb-paste")
      .evaluateAll((items) => items.filter((item) => getComputedStyle(item).whiteSpace !== "pre").length);
    assert.equal(wrapping, 0, "commands and printouts keep white-space: pre");

    // The contents mark the section being read.
    await page.evaluate(() => document.getElementById("delivery").scrollIntoView());
    await page.waitForFunction(
      () => document.querySelector('.toc-list a[href="#delivery"]').getAttribute("aria-current") === "location",
    );
    assert.equal(await page.locator(".toc-list a[aria-current]").count(), 1);
    assert.deepEqual(errors, []);
    await context.close();
  }

  // Both schemes on a desktop and a phone: no errors, no sideways scroll, no serious accessibility issues.
  for (const colorScheme of [
    "light",
    "dark",
  ]) {
    for (const viewport of [
      {
        width: 1440,
        height: 900,
      },
      {
        width: 390,
        height: 844,
      },
    ]) {
      const label = `${viewport.width}px ${colorScheme}`;
      const { context, page, errors } = await open(browser, {
        viewport,
        colorScheme,
      });
      assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), colorScheme, label);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      assert.equal(overflow, 0, `${label} scrolls sideways by ${overflow}px`);
      await assertAccessible(page, label);
      if (viewport.width < 800) {
        const menu = page.getByRole("button", {
          name: "菜单",
        });
        assert.equal(await page.locator("#site-nav").isVisible(), false, "the phone menu starts closed");
        await menu.click();
        assert.equal(await menu.getAttribute("aria-expanded"), "true");
        assert.equal(await page.locator("#site-nav").isVisible(), true, "the phone menu opens");
      }
      assert.deepEqual(errors, [], label);
      await context.close();
    }
  }

  // The scheme choice is shared with the rest of the family under site-theme, and survives a reload.
  {
    const { context, page, errors } = await open(browser, {
      viewport: {
        width: 1440,
        height: 900,
      },
      colorScheme: "light",
    });
    await page
      .getByRole("button", {
        name: "晚上",
      })
      .click();
    assert.equal(await page.evaluate(() => localStorage.getItem("site-theme")), "dark");
    await page.reload();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark");
    assert.equal(
      await page
        .getByRole("button", {
          name: "晚上",
        })
        .getAttribute("aria-pressed"),
      "true",
    );
    assert.deepEqual(errors, []);
    await context.close();
  }

  // Blocked storage leaves the page working.
  {
    const { context, page, errors } = await open(browser, {
      viewport: {
        width: 390,
        height: 844,
      },
      colorScheme: "light",
      init: () =>
        Object.defineProperty(window, "localStorage", {
          get() {
            throw new DOMException("Blocked", "SecurityError");
          },
        }),
    });
    await page
      .getByRole("button", {
        name: "晚上",
      })
      .click();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark");
    assert.deepEqual(errors, []);
    await context.close();
  }

  // A copy action copies exactly the command shown, and says so in words.
  {
    const { context, page, errors } = await open(browser, {
      viewport: {
        width: 1440,
        height: 900,
      },
      colorScheme: "light",
    });
    await context.grantPermissions(
      [
        "clipboard-read",
        "clipboard-write",
      ],
      {
        origin,
      },
    );
    const row = page.locator("#build-windows-cuda .cmd").first();
    await row.locator(".copy").click();
    await row
      .locator(".copy", {
        hasText: "已复制",
      })
      .waitFor();
    // The Windows clipboard turns line feeds into CRLF.
    const copied = (await page.evaluate(() => navigator.clipboard.readText())).replaceAll("\r\n", "\n");
    assert.equal(copied, await row.locator("code").textContent());
    assert.match(copied, /-DUSE_NCCL=OFF/u);
    assert.deepEqual(errors, []);
    await context.close();
  }

  console.log("Site checks passed.");
} finally {
  await browser.close();
  server.close();
}
