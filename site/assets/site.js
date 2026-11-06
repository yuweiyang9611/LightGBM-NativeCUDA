// The head menu, the copy actions and the contents marker. theme.js handles the colour scheme.

const toggle = document.querySelector(".nb-nav-toggle");
const nav = document.getElementById("site-nav");

const setMenu = (open) => {
    toggle?.setAttribute("aria-expanded", String(open));
    nav?.classList.toggle("open", open);
};

toggle?.addEventListener("click", () => {
    setMenu(toggle.getAttribute("aria-expanded") !== "true");
});

nav?.addEventListener("click", (event) => {
    if (event.target.closest("a")) setMenu(false);
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && toggle?.getAttribute("aria-expanded") === "true") {
        setMenu(false);
        toggle.focus();
    }
});

// A command row copies its command; a pasted printout copies its command, or all of it when it has none.
const copySource = (button) => {
    const row = button.closest(".cmd");
    if (row) return row.querySelector("code");
    const paste = button.closest(".paste");
    return paste?.querySelector(".paste-command") ?? paste?.querySelector("pre");
};

document.querySelectorAll(".copy").forEach((button) => {
    const label = button.textContent;
    button.addEventListener("click", async () => {
        const source = copySource(button);
        if (!source) return;
        try {
            await navigator.clipboard.writeText(source.textContent);
            button.textContent = "已复制";
        } catch {
            const range = document.createRange();
            range.selectNodeContents(source);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            button.textContent = "已选中，按 Ctrl+C 复制";
        }
        window.setTimeout(() => {
            button.textContent = label;
        }, 1600);
    });
});

// A command too long for its box scrolls sideways, so it has to take keyboard focus too.
const commands = [
    ...document.querySelectorAll(".cmd code"),
];
const markScrollable = () => {
    for (const code of commands) {
        if (code.scrollWidth > code.clientWidth) code.tabIndex = 0;
        else code.removeAttribute("tabindex");
    }
};
markScrollable();
window.addEventListener("resize", markScrollable);

// Contents: mark the last heading that has scrolled under the running head.
const tocLinks = [
    ...document.querySelectorAll('.toc-list a[href^="#"]'),
];
const targets = tocLinks
    .map((link) => [
        link,
        document.getElementById(link.getAttribute("href").slice(1)),
    ])
    .filter(([, target]) => target);

const markCurrent = () => {
    const line = (document.querySelector(".nb-head")?.offsetHeight ?? 0) + 24;
    let current = null;
    for (const [link, target] of targets) {
        if (target.getBoundingClientRect().top <= line) current = link;
    }
    for (const [link] of targets) {
        if (link === current) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
    }
};

let pending = false;
window.addEventListener(
    "scroll",
    () => {
        if (pending) return;
        pending = true;
        window.requestAnimationFrame(() => {
            pending = false;
            markCurrent();
        });
    },
    {
        passive: true,
    },
);
markCurrent();

// Source read in place: a changes row opens its file in the one panel under the table instead of leaving the
// page, and the panel links to the source page, where the file's directory and siblings are.
const changesSource = document.getElementById("changes-source");
if (changesSource && window.SourcePanel) {
    const files = [
        ...changesSource.querySelectorAll("[data-path]"),
    ].map((tab) => ({
        path: tab.dataset.path,
        label: tab.textContent,
    }));
    const pageLink = (path) => `./source.html?path=${encodeURIComponent(path)}`;
    const sitePage = document.createElement("a");
    sitePage.className = "nb-code-page";
    sitePage.textContent = "在源码页打开";
    sitePage.href = pageLink(files[0]?.path ?? "");
    const panel = window.SourcePanel.create({
        root: changesSource,
        base: changesSource.dataset.sourceBase,
        files,
        active: files[0]?.path,
        blobBase: changesSource.dataset.blobBase,
        onSelect: (path) => {
            sitePage.href = pageLink(path);
        },
    });
    panel.actions.insertBefore(sitePage, panel.actions.querySelector(".nb-code-link"));
    for (const row of document.querySelectorAll("a.row-source[data-source-tab]")) {
        row.addEventListener("click", (event) => {
            const path = row.dataset.sourceTab;
            if (!files.some((file) => file.path === path)) return;
            event.preventDefault();
            panel.select(path);
            sitePage.href = pageLink(path);
            changesSource.scrollIntoView({
                block: "start",
            });
            changesSource.querySelector(`[data-path="${path}"]`)?.focus();
        });
    }
}
