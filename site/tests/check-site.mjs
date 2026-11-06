// Checks the GitHub Pages site before it is deployed: every link resolves, the kit copies are the
// published v1 files, the source bundle is complete and read in place, and the pages load cleanly in both
// colour schemes on a desktop and a phone.
//
//   npm ci --prefix site/tests
//   node site/tests/check-site.mjs
//
// It uses an installed Chrome or Edge, or CHROME_PATH, and falls back to Playwright's own Chromium.
// SITE_CHECK_PORT fixes the port of its local server; by default the system picks a free one.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};

// The kit is copied from yuweiyang9611.github.io/kit/v1 unedited, and a published kit version never changes.
// notebook.css moved to the copy that adds the code panel (.nb-code) on 2026-11-06.
const kit = {
  "assets/lib/favicon.svg": "3ea07acd66b71bcef6462252c4e437ee6622f57898089bbb891410e57b20dc0e",
  "assets/lib/notebook.css": "9953db9200fc2a6306d53350d61cabddf03cdb7991f12abeed0aac206a82923b",
  "assets/lib/theme.js": "2f26afc56d0152d02f363af644ac51b552a890e02d3e81542795aba6b8d5d5e0",
};

// Source read in place: the bundle is rebuilt here, every file it lists exists, every in-site source link
// points at a bundled file or directory, and no page sends the reader to GitHub for a bundled file.
execFileSync(
  process.execPath,
  [
    join(root, "scripts", "bundle-source.mjs"),
  ],
  {
    stdio: "inherit",
  },
);
const bundle = JSON.parse(await readFile(join(root, "assets", "source", "index.json"), "utf8"));
assert.equal(bundle.version, 1);
assert.match(bundle.revision, /^[0-9a-f]{40}$/u);
assert.ok(bundle.blobBase.startsWith("https://github.com/") && bundle.blobBase.endsWith("/blob/main/"));
const bundled = new Set(bundle.files.map((file) => file.path));
assert.ok(bundled.size >= 50, `the bundle lists only ${bundled.size} files`);
const bundledUnder = (dir) => bundle.files.some((file) => file.path.startsWith(`${dir.replace(/\/$/u, "")}/`));
for (const file of bundle.files) {
  assert.ok(file.lines > 0 && file.bytes > 0, `${file.path} is empty`);
  assert.ok((await stat(join(root, "assets", "source", `${file.path}.txt`))).isFile(), `${file.path} is not bundled`);
}
for (const name of [
  "index.html",
  "source.html",
]) {
  // A noscript may name GitHub: it is the only way to the file without script.
  const html = (await readFile(join(root, name), "utf8")).replaceAll(/<noscript>[\s\S]*?<\/noscript>/gu, "");
  for (const [, path] of html.matchAll(/href="\.\/source\.html\?path=([^"#&]+)/gu)) {
    assert.ok(bundled.has(decodeURIComponent(path)), `${name} links ${path}, which is not bundled`);
  }
  for (const [, dir] of html.matchAll(/href="\.\/source\.html\?dir=([^"#&]+)/gu)) {
    assert.ok(bundledUnder(decodeURIComponent(dir)), `${name} lists ${dir}, which has no bundled file`);
  }
  for (const [, path] of html.matchAll(/data-path="([^"]+)"/gu)) {
    assert.ok(bundled.has(path), `${name} shows ${path} in the panel, which is not bundled`);
  }
  for (const [, path] of html.matchAll(/href="https:\/\/github\.com\/[^"]+\/blob\/[^/"]+\/([^"#?]+)/gu)) {
    assert.ok(!bundled.has(decodeURIComponent(path)), `${name} sends the reader to GitHub for the bundled ${path}`);
  }
  for (const [, dir] of html.matchAll(/href="https:\/\/github\.com\/[^"]+\/tree\/[^/"]+\/([^"#?]+)/gu)) {
    assert.ok(!bundledUnder(decodeURIComponent(dir)), `${name} sends the reader to GitHub for the bundled ${dir}`);
  }
}

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

async function open(browser, { viewport, colorScheme, init, path = "" }) {
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
  await page.goto(pageUrl + path, {
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

    // Only the five kit colours and one family at two weights reach the reading text. The code panel's tab
    // strip is file names, set in mono by the kit like the code itself.
    const type = await page.evaluate(() => {
      const styles = [
        ...document.querySelectorAll("body *"),
      ]
        .filter(
          (element) =>
            element.offsetParent &&
            element.textContent.trim() &&
            !element.closest("code, pre, kbd, samp, .nb-code-tabs"),
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

  // Source read in place: a changes row opens its file in the panel on the page, numbered and coloured, and
  // the panel's only GitHub link is the small one in its actions row.
  {
    const { context, page, errors } = await open(browser, {
      viewport: {
        width: 1440,
        height: 900,
      },
      colorScheme: "light",
    });
    const panel = page.locator("#changes-source");
    assert.equal(await panel.locator(".nb-code-tab").count(), 6, "the panel has a tab per changed file");
    await panel.locator(".nb-code-line").first().waitFor();
    assert.equal(await panel.locator(".nb-code-line").first().getAttribute("data-line"), "1");
    assert.ok((await panel.locator(".nb-code-line").count()) >= 900, "CMakeLists.txt is shown whole");
    assert.equal(await panel.locator(".nb-code-line").first().locator(":scope > *").count(), 1, "one span per line");
    assert.ok((await panel.locator(".tok-call").count()) > 0, "the code is coloured");
    assert.equal(
      await panel.locator(".nb-code-note").textContent(),
      `${bundle.files.find((file) => file.path === "CMakeLists.txt").lines} 行`,
    );
    assert.match(await panel.locator(".nb-code-link").getAttribute("href"), /\/blob\/main\/CMakeLists\.txt$/u);
    await page.locator('a.row-source[data-source-tab="src/cuda/cuda_link.cu"]').click();
    await page.waitForFunction(
      () =>
        document.querySelector('#changes-source .nb-code-tab[aria-selected="true"]')?.textContent === "cuda_link.cu" &&
        document.querySelectorAll("#changes-source .nb-code-line").length > 5,
    );
    assert.equal(page.url(), pageUrl, "the row opens the panel instead of leaving the page");
    assert.equal(
      await panel.locator(".nb-code-tab[aria-selected='true']").evaluate((tab) => tab === document.activeElement),
      true,
    );
    assert.match(
      await panel.locator(".nb-code-page").getAttribute("href"),
      /source\.html\?path=src%2Fcuda%2Fcuda_link\.cu$/u,
    );
    assert.match(await panel.locator(".nb-code-link").getAttribute("href"), /\/blob\/main\/src\/cuda\/cuda_link\.cu$/u);
    assert.ok((await panel.locator(".tok-comment").count()) > 0, "the CUDA file is coloured");
    assert.deepEqual(errors, []);
    await context.close();
  }

  // The source page: a file with a line range or a heading anchor, a directory, and the top of the bundle.
  {
    const { context, page, errors } = await open(browser, {
      viewport: {
        width: 1440,
        height: 900,
      },
      colorScheme: "light",
      path: "source.html?path=tests%2Fwin_native_cuda_tests%2Ftest_source_contract.py#L5-L9",
    });
    const panel = page.locator("#source-panel");
    await panel.locator(".nb-code-line").first().waitFor();
    assert.equal(await page.locator("#source-title").textContent(), "test_source_contract.py");
    assert.equal(await panel.locator(".nb-code-line[data-marked]").count(), 5, "the line range is marked");
    assert.ok((await panel.locator(".tok-keyword").count()) > 0, "the Python file is coloured");
    assert.ok((await page.locator("#source-sibling-list li").count()) >= 10, "the siblings are listed");
    assert.match(
      await panel.locator(".nb-code-link").getAttribute("href"),
      /\/blob\/main\/tests\/win_native_cuda_tests\/test_source_contract\.py$/u,
    );
    assert.equal(await page.locator("#source-crumbs a").count(), 3);

    await page.goto(
      `${pageUrl}source.html?path=tests%2Fwin_native_cuda_tests%2FREADME.md#kernel-correctness-regressions`,
    );
    await panel.locator(".nb-code-line[data-marked]").waitFor();
    assert.match(
      await panel.locator(".nb-code-line[data-marked]").textContent(),
      /^## Kernel correctness regressions/u,
    );

    await page.goto(
      `${pageUrl}source.html?path=docs%2FWindows%E5%8E%9F%E7%94%9F%E5%8D%95%E6%98%BE%E5%8D%A1LightGBM_CUDA%E7%89%88%E6%9C%AC%E6%9E%84%E5%BB%BA.md`,
    );
    await panel.locator(".nb-code-line").first().waitFor();
    assert.ok((await panel.locator(".nb-code-line").count()) >= 50, "the build document is shown whole");

    await page.goto(`${pageUrl}source.html?dir=tests%2Fwin_native_cuda_tests`);
    await page.locator(".source-row").first().waitFor();
    assert.ok((await page.locator(".source-row").count()) >= 30, "the test directory lists its files");
    assert.match(await page.locator(".source-row span").first().textContent(), /^\d+ 行 · [\d.]+ KB$/u);

    await page.goto(`${pageUrl}source.html`);
    await page.locator(".source-row").first().waitFor();
    const top = await page.locator(".source-row a").allTextContents();
    assert.ok(top.includes("cmake/") && top.includes("CMakeLists.txt"), `top level: ${top.join(" ")}`);
    assert.match(await page.locator(".source-row span").first().textContent(), /^\d+ 个文件 · \d+ 行$/u);

    await page.goto(`${pageUrl}source.html?path=nowhere.txt`);
    await page.locator(".source-row").first().waitFor();
    assert.equal(await page.locator("#source-title").textContent(), "没有这个文件");
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
      // The widest thing on the page is the code in the panel, so it has to be there before measuring.
      await page.locator("#changes-source .nb-code-line").first().waitFor();
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
      await page.goto(`${pageUrl}source.html?path=CMakeLists.txt`);
      await page.locator("#source-panel .nb-code-line").first().waitFor();
      const sourceOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      assert.equal(sourceOverflow, 0, `${label} source page scrolls sideways by ${sourceOverflow}px`);
      await assertAccessible(page, `${label} source page`);
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
