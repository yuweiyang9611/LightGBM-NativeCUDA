// Copies the repository files the project page points at into site/assets/source as plain text, so a reader
// opens them on the page itself, at the page's own revision. The folder is generated output: it is gitignored,
// and pages.yml and check-site.mjs both run this before anything reads it.
//
//   node site/scripts/bundle-source.mjs
import { execFileSync } from "node:child_process";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repository = "https://github.com/yuweiyang9611/LightGBM-NativeCUDA";
const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const output = join(root, "site", "assets", "source");

// The single files the page names, and the folders a reader may browse whole.
const named = [
  "CMakeLists.txt",
  "build-python.sh",
  "src/cuda/cuda_link.cu",
  "docs/Windows原生单显卡LightGBM_CUDA版本构建.md",
];
const folders = [
  "cmake",
  "tests/win_native_cuda_tests",
  "packaging/windows_cuda_portable",
];
// Only text a reader can learn from, never caches or build output, and nothing over 256 KB.
const extensions = new Set([
  ".cmake",
  ".cu",
  ".cuh",
  ".h",
  ".hpp",
  ".cpp",
  ".cc",
  ".txt",
  ".md",
  ".py",
  ".ps1",
  ".psd1",
  ".psm1",
  ".cmd",
  ".bat",
  ".sh",
  ".json",
  ".yml",
  ".yaml",
  ".toml",
  ".cfg",
  ".ini",
]);
const skipped = /(^|\/)(__pycache__|node_modules|bin|obj|build|\.git)\//u;
const limit = 256 * 1024;

async function walk(directory) {
  const found = [];
  for (const entry of await readdir(directory, {
    withFileTypes: true,
  })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await walk(path)));
    else if (entry.isFile()) found.push(path);
  }
  return found;
}

const candidates = [
  ...named.map((path) => join(root, path)),
];
for (const folder of folders) candidates.push(...(await walk(join(root, folder))));

await rm(output, {
  recursive: true,
  force: true,
});
const files = [];
let total = 0;
for (const file of candidates) {
  const path = relative(root, file).replaceAll("\\", "/");
  if (skipped.test(`${path}/`) || !extensions.has(extname(path).toLowerCase())) continue;
  const text = (await readFile(file, "utf8")).replaceAll("\r\n", "\n");
  const bytes = Buffer.byteLength(text);
  if (bytes > limit) continue;
  const target = join(output, `${path}.txt`);
  await mkdir(join(target, ".."), {
    recursive: true,
  });
  await writeFile(target, text);
  const breaks = text.split("\n").length - 1;
  files.push({
    path,
    bytes,
    lines: text.length > 0 && !text.endsWith("\n") ? breaks + 1 : breaks,
  });
  total += bytes;
}
files.sort((a, b) => (a.path < b.path ? -1 : 1));

const sha = process.env.GITHUB_SHA ?? "";
const revision = /^[0-9a-f]{40}$/iu.test(sha)
  ? sha.toLowerCase()
  : execFileSync("git", [
      "-C",
      root,
      "rev-parse",
      "HEAD",
    ])
      .toString()
      .trim();
const index = {
  version: 1,
  revision,
  repository,
  blobBase: `${repository}/blob/main/`,
  files,
};
await writeFile(join(output, "index.json"), `${JSON.stringify(index)}\n`);
console.log(
  `Bundled ${files.length} files (${(total / 1024).toFixed(0)} KB) into site/assets/source at ${revision.slice(0, 7)}.`,
);
