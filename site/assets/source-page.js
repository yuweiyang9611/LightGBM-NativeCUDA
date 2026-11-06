// source.html: one bundled file in the panel, or a directory of them, chosen by ?path= or ?dir=.
// A #L5-L9 fragment marks a line range; on a Markdown file a heading's own anchor marks the heading's line.

const params = new URL(location.href).searchParams;
const requestedPath = params.get("path")?.replace(/^\/+/u, "") ?? null;
const requestedDir = (params.get("dir") ?? "").replace(/^\/+|\/+$/gu, "");
const crumbs = document.getElementById("source-crumbs");
const title = document.getElementById("source-title");
const note = document.getElementById("source-note");
const tree = document.getElementById("source-tree");
const panelRoot = document.getElementById("source-panel");
const siblings = document.getElementById("source-siblings");
const siblingList = document.getElementById("source-sibling-list");
const base = "./assets/source/";

const fileName = (path) => path.split("/").pop();

function link(path, text) {
    const anchor = document.createElement("a");
    const directory = path.endsWith("/");
    anchor.href = `./source.html?${directory ? "dir" : "path"}=${encodeURIComponent(path.replace(/\/$/u, ""))}`;
    anchor.textContent = text ?? path;
    return anchor;
}

function renderCrumbs(path) {
    crumbs.replaceChildren(link("", "源码"));
    const parts = path.split("/").filter(Boolean);
    for (const [index, part] of parts.entries()) {
        crumbs.append(" / ");
        if (index === parts.length - 1 && requestedPath) {
            const span = document.createElement("span");
            span.textContent = part;
            crumbs.append(span);
        } else {
            crumbs.append(link(`${parts.slice(0, index + 1).join("/")}/`, part));
        }
    }
}

// A directory: its subdirectories first, then its files, each as a ruled row with its size in lines.
function renderTree(index, dir) {
    const prefix = dir ? `${dir}/` : "";
    const children = new Map();
    for (const file of index.files) {
        if (!file.path.startsWith(prefix)) continue;
        const rest = file.path.slice(prefix.length);
        const slash = rest.indexOf("/");
        const name = slash === -1 ? rest : rest.slice(0, slash);
        const entry = children.get(name) ?? {
            name,
            directory: slash !== -1,
            files: 0,
            bytes: 0,
            lines: 0,
        };
        entry.files += 1;
        entry.bytes += file.bytes;
        entry.lines += file.lines;
        children.set(name, entry);
    }
    if (children.size === 0) {
        tree.textContent = "没有这个目录。";
        return;
    }
    const list = document.createElement("ol");
    list.className = "source-rows";
    const entries = [
        ...children.values(),
    ].sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name));
    for (const entry of entries) {
        const row = document.createElement("li");
        row.className = "nb-entry source-row";
        const suffix = entry.directory ? "/" : "";
        const meta = document.createElement("span");
        meta.textContent = entry.directory
            ? `${entry.files} 个文件 · ${entry.lines} 行`
            : `${entry.lines} 行 · ${(entry.bytes / 1024).toFixed(1)} KB`;
        row.append(link(prefix + entry.name + suffix, entry.name + suffix), meta);
        list.append(row);
    }
    tree.replaceChildren(list);
}

// GitHub's heading anchors: lower case, punctuation dropped, spaces as hyphens.
function headingLine(text, hash) {
    const slug = decodeURIComponent(hash.slice(1)).toLowerCase();
    const lines = text.split("\n");
    for (const [index, line] of lines.entries()) {
        const match = line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/u);
        if (!match) continue;
        const candidate = match[1]
            .toLowerCase()
            .replace(/[^\p{L}\p{N}\s-]/gu, "")
            .trim()
            .replace(/\s+/gu, "-");
        if (candidate === slug) return index + 1;
    }
    return null;
}

function renderFile(index, path) {
    const file = index.files.find((item) => item.path === path);
    if (!file) {
        title.textContent = "没有这个文件";
        note.textContent = `${path} 不在站内的源码包里，可能不是页面提到的文件。`;
        renderCrumbs("");
        renderTree(index, "");
        return;
    }
    const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    renderCrumbs(path);
    title.textContent = fileName(path);
    note.textContent = `${path} · ${file.lines} 行 · 仓库提交 ${index.revision.slice(0, 7)}`;
    tree.hidden = true;
    panelRoot.hidden = false;
    const panel = window.SourcePanel.create({
        root: panelRoot,
        base,
        files: [
            {
                path,
            },
        ],
        active: path,
        blobBase: index.blobBase,
    });
    const range = window.SourcePanel.parseRange(location.hash);
    if (range) {
        panel.mark([
            range,
        ]);
        panel.load(path).then(() => panel.scrollToLine(range[0]));
    } else if (location.hash.length > 1 && path.endsWith(".md")) {
        panel.load(path).then((text) => {
            const line = headingLine(text, location.hash);
            if (!line) return;
            panel.mark([
                [
                    line,
                    line,
                ],
            ]);
            panel.scrollToLine(line);
        });
    }
    const others = index.files.filter(
        (item) =>
            item.path !== path &&
            item.path.startsWith(dir ? `${dir}/` : "") &&
            !item.path.slice(dir ? dir.length + 1 : 0).includes("/"),
    );
    if (others.length > 0) {
        siblings.hidden = false;
        siblingList.replaceChildren(
            ...others.map((item) => {
                const row = document.createElement("li");
                row.append(link(item.path, fileName(item.path)));
                return row;
            }),
        );
    }
}

fetch(`${base}index.json`)
    .then((response) => {
        if (!response.ok) throw new Error(`无法读取源码索引（${response.status}）`);
        return response.json();
    })
    .then((index) => {
        if (requestedPath) {
            renderFile(index, requestedPath);
            return;
        }
        renderCrumbs(requestedDir ? `${requestedDir}/` : "");
        title.textContent = requestedDir ? `${requestedDir.split("/").pop()}/` : "源码";
        if (requestedDir) note.textContent = `${requestedDir} · 仓库提交 ${index.revision.slice(0, 7)}`;
        renderTree(index, requestedDir);
    })
    .catch((error) => {
        title.textContent = "源码暂时读不到";
        note.textContent = error.message;
    });
