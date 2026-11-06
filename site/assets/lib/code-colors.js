// Colours code after load, so the page stays plain text until the source panel asks for a file.
// window.CodeColors.highlight(text, language) returns a fragment of .tok-* spans; languageFor(path) picks the
// language from the file name. Adapted from the C# course's copy for this repository's languages: C++ and
// CUDA, CMake, Python, shell, PowerShell and batch, JSON and YAML, Markdown.
(() => {
  "use strict";

  const words = (list) => list.trim().replaceAll(/\s+/g, "|");

  // C, C++ and CUDA: the preprocessor is meta, CUDA's execution-space words are keywords.
  const cpp = {
    comment: String.raw`//[^\n]*|/\*[\s\S]*?\*/`,
    string: String.raw`"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)+'`,
    meta: String.raw`^[ \t]*#[^\n]*`,
    number: String.raw`\b0[xX][0-9a-fA-F']+\b|\b\d[\d']*(?:\.\d+)?(?:[eE][+-]?\d+)?[fFuUlL]*\b`,
    keyword: String.raw`\b(?:${words(`
      alignas alignof asm auto bool break case catch char char16_t char32_t class const constexpr const_cast
      continue decltype default delete do double dynamic_cast else enum explicit export extern false final float
      for friend goto if inline int long mutable namespace new noexcept nullptr operator override private
      protected public register reinterpret_cast return short signed sizeof static static_assert static_cast
      struct switch template this thread_local throw true try typedef typeid typename union unsigned using
      virtual void volatile wchar_t while __global__ __device__ __host__ __shared__ __constant__ __restrict__
      __forceinline__ __syncthreads __launch_bounds__`)})\b`,
    call: String.raw`\b[A-Za-z_]\w*(?=\s*(?:<[^<>\n;]*>)?\s*\()`,
    type: String.raw`\b[A-Z]\w*|\b[a-z_]\w*_t\b`,
  };

  // CMake: commands are calls, flow and option words are keywords, ${variables} are meta.
  const cmake = {
    comment: String.raw`#[^\n]*`,
    string: String.raw`"(?:[^"\\]|\\[\s\S])*"`,
    meta: String.raw`\$(?:ENV|CACHE)?\{[^}\n]*\}|\$<[^>\n]*>`,
    keyword: String.raw`\b(?:${words(`
      if elseif else endif foreach endforeach while endwhile function endfunction macro endmacro return break
      continue AND OR NOT STREQUAL STRLESS STRGREATER EQUAL LESS GREATER MATCHES VERSION_LESS VERSION_GREATER
      VERSION_EQUAL VERSION_GREATER_EQUAL VERSION_LESS_EQUAL DEFINED EXISTS IS_DIRECTORY ON OFF TRUE FALSE
      PRIVATE PUBLIC INTERFACE STATIC SHARED MODULE OBJECT CACHE FORCE PARENT_SCOPE REQUIRED QUIET STATUS
      WARNING FATAL_ERROR SEND_ERROR COMMAND DEPENDS OUTPUT WORKING_DIRECTORY PROPERTIES APPEND REGEX REPLACE
      TOLOWER TOUPPER LENGTH NAMES PATHS HINTS PATH_SUFFIXES NO_DEFAULT_PATH TARGET TARGETS FILES DIRECTORY
      DESTINATION IN LISTS ITEMS RANGE VERSION LANGUAGES BOOL STRING FILEPATH PATH INTERNAL COMPILE_OPTIONS
      LINK_OPTIONS COMPILE_DEFINITIONS INCLUDE_DIRECTORIES LINK_LIBRARIES`)})\b`,
    call: String.raw`\b[A-Za-z_]\w*(?=\s*\()`,
    type: String.raw`\b[A-Z][A-Z0-9_]{2,}\b`,
    number: String.raw`\b\d+(?:\.\d+)*\b`,
  };

  const python = {
    comment: String.raw`#[^\n]*`,
    string: String.raw`[rRbBuUfF]{0,2}(?:"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')`,
    meta: String.raw`^[ \t]*@[\w.]+`,
    number: String.raw`\b0[xX][0-9a-fA-F_]+\b|\b\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?j?\b`,
    keyword: String.raw`\b(?:${words(`
      False None True and as assert async await break class continue def del elif else except finally for from
      global if import in is lambda nonlocal not or pass raise return try while with yield match case self
      cls`)})\b`,
    call: String.raw`\b[A-Za-z_]\w*(?=\s*\()`,
    type: String.raw`\b[A-Z]\w*`,
  };

  // In a shell the program is the type and its switches are the keywords.
  const shell = {
    comment: String.raw`(?<!\S)#[^\n]*`,
    string: String.raw`"[^"\n]*"|'[^'\n]*'`,
    type: String.raw`^[ \t]*(?:[.&][ \t]+)?[A-Za-z_./\\][\w./\\:-]*(?![\w./\\:-]|[ \t]*=)`,
    keyword: String.raw`(?<=\s)--?[A-Za-z][\w-]*`,
    meta: String.raw`\$[A-Za-z_][\w:]*`,
    number: String.raw`(?<![\w.-])\d+(?:\.\d+)?\b`,
  };

  // PowerShell: Verb-Noun cmdlets are calls, [types] are types, $variables are meta, -switches are keywords.
  const powershell = {
    comment: String.raw`<#[\s\S]*?#>|(?<!\S)#[^\n]*`,
    string: "@\"[\\s\\S]*?\\n\"@|@'[\\s\\S]*?\\n'@|\"(?:[^\"`]|`.)*\"|'(?:[^']|'')*'",
    meta: String.raw`\$(?:\{[^}\n]*\}|[A-Za-z_][\w:]*|[$?^_])`,
    keyword: String.raw`\b(?:${words(`
      param function filter if elseif else foreach for while do until switch try catch finally throw return
      begin process end in break continue exit class enum using trap`)})\b|(?<=[\s(])-[A-Za-z][\w-]*`,
    type: String.raw`\[[A-Za-z][\w.]*(?:\[\])?\]`,
    call: String.raw`\b[A-Z][a-z]+-[A-Z]\w*\b`,
    number: String.raw`(?<![\w.-])\d+(?:\.\d+)?(?:[KMGT]B)?\b`,
  };

  // Data files: keys as types, literals as strings and numbers.
  const data = {
    comment: String.raw`//[^\n]*|/\*[\s\S]*?\*/|(?<!\S)#[^\n]*`,
    type: String.raw`"(?:[^"\\\n]|\\.)*"(?=\s*:)|^[ \t]*-?[ \t]*[A-Za-z_][\w.-]*(?=\s*[:=])`,
    string: String.raw`"(?:[^"\\\n]|\\.)*"|'[^'\n]*'`,
    number: String.raw`(?<![\w.-])-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b`,
    keyword: String.raw`\b(?:true|false|null|yes|no|on|off)\b`,
  };

  // Markdown: headings as types, code as strings, link targets as calls, list and quote marks as meta.
  const markdown = {
    string: "```[\\s\\S]*?```|`[^`\\n]+`",
    type: String.raw`^#{1,6}[ \t][^\n]*`,
    call: String.raw`(?<=\]\()[^)\n]+(?=\))`,
    meta: String.raw`^[ \t]*(?:[-*+]|\d+\.)(?=[ \t])|^[ \t]*>`,
  };

  const compile = (rules) =>
    new RegExp(
      Object.entries(rules)
        .map(([name, source]) => `(?<${name}>${source})`)
        .join("|"),
      "gm",
    );
  const patterns = {
    cpp: compile(cpp),
    cmake: compile(cmake),
    python: compile(python),
    shell: compile(shell),
    bat: compile(shell),
    powershell: compile(powershell),
    json: compile(data),
    yaml: compile(data),
    toml: compile(data),
    markdown: compile(markdown),
  };
  const languages = {
    c: "cpp",
    cc: "cpp",
    cpp: "cpp",
    cu: "cpp",
    cuh: "cpp",
    h: "cpp",
    hpp: "cpp",
    cmake: "cmake",
    py: "python",
    sh: "shell",
    bash: "shell",
    cmd: "bat",
    bat: "bat",
    ps1: "powershell",
    psd1: "powershell",
    psm1: "powershell",
    json: "json",
    yml: "yaml",
    yaml: "yaml",
    toml: "toml",
    cfg: "toml",
    ini: "toml",
    md: "markdown",
  };

  function highlight(source, language) {
    const parts = document.createDocumentFragment();
    const pattern = patterns[language];
    if (!pattern) {
      parts.append(source);
      return parts;
    }
    let position = 0;
    for (const match of source.matchAll(pattern)) {
      if (match[0].length === 0) continue;
      parts.append(source.slice(position, match.index));
      const token = document.createElement("span");
      token.className = `tok-${Object.keys(match.groups).find((name) => match.groups[name] !== undefined)}`;
      token.textContent = match[0];
      parts.append(token);
      position = match.index + match[0].length;
    }
    parts.append(source.slice(position));
    return parts;
  }

  function languageFor(path) {
    const name = String(path).split("/").pop().toLowerCase();
    if (name === "cmakelists.txt") return "cmake";
    const extension = name.match(/\.([a-z0-9]+)$/)?.[1] ?? "";
    return languages[extension] ?? (extension || "text");
  }

  window.CodeColors = Object.freeze({ highlight, languageFor });
})();
