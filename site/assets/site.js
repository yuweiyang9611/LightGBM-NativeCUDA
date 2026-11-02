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
