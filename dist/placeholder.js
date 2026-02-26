const NUNJUCKS_COMMENT = /\{#[\s\S]*?#\}/g;
const NUNJUCKS_TAG = /\{%[-~]?\s*[\s\S]*?[-~]?%\}/g;
const NUNJUCKS_EXPRESSION = /\{\{[\s\S]*?\}\}/g;
// Combined pattern: comments first, then tags, then expressions
const NUNJUCKS_ALL = /(\{#[\s\S]*?#\})|(\{%[-~]?\s*[\s\S]*?[-~]?%\})|(\{\{[\s\S]*?\}\})/g;
const PREFIX = "PRETTIER_NUNJUCKS";
// Block-level tags that should be rendered as HTML comments (block-level placeholders)
const BLOCK_TAG_NAMES = new Set([
    "if",
    "elif",
    "elseif",
    "else",
    "endif",
    "for",
    "endfor",
    "block",
    "endblock",
    "extends",
    "include",
    "import",
    "from",
    "macro",
    "endmacro",
    "call",
    "endcall",
    "filter",
    "endfilter",
    "set",
    "raw",
    "endraw",
]);
function getTagName(tag) {
    const match = tag.match(/\{%[-~]?\s*(\w+)/);
    return match ? match[1] : null;
}
function isBlockTag(tag) {
    const name = getTagName(tag);
    return name !== null && BLOCK_TAG_NAMES.has(name);
}
export function replacePlaceholders(text) {
    const map = new Map();
    let id = 0;
    const output = text.replace(NUNJUCKS_ALL, (match, comment, tag, expr) => {
        const currentId = id++;
        let type;
        let placeholder;
        if (comment) {
            type = "comment";
            placeholder = `<!-- ${PREFIX}_C${currentId} -->`;
        }
        else if (tag) {
            type = "tag";
            if (isBlockTag(tag)) {
                placeholder = `<!-- ${PREFIX}_T${currentId} -->`;
            }
            else {
                // Inline tag — use text placeholder
                placeholder = `${PREFIX}_T${currentId}`;
            }
        }
        else {
            type = "expression";
            placeholder = `${PREFIX}_E${currentId}`;
        }
        map.set(placeholder, {
            id: currentId,
            original: match,
            type,
        });
        return placeholder;
    });
    return { output, map };
}
export function restorePlaceholders(text, map) {
    let result = text;
    for (const [placeholder, entry] of map) {
        // Escape special regex characters in placeholder
        const escaped = placeholder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        result = result.replace(new RegExp(escaped, "g"), entry.original);
    }
    return result;
}
