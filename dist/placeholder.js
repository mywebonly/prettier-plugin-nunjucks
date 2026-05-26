const BASE_PREFIX = "PRETTIER_NUNJUCKS";
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
    "endset",
    "raw",
    "endraw",
]);
function getTagName(tag) {
    const match = tag.match(/\{%[-~]?\s*(\w+)/);
    return match ? match[1] : null;
}
function isBlockTag(tag) {
    const name = getTagName(tag);
    if (name === null)
        return false;
    return BLOCK_TAG_NAMES.has(name) || name.startsWith("end");
}
function createPrefix(text) {
    let hash = 5381;
    for (let i = 0; i < text.length; i++) {
        hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
    }
    const suffix = hash.toString(36);
    let prefix = `${BASE_PREFIX}_${suffix}`;
    let attempt = 0;
    while (text.includes(prefix)) {
        attempt++;
        prefix = `${BASE_PREFIX}_${suffix}_${attempt}`;
    }
    return prefix;
}
function findCommentEnd(text, start) {
    const end = text.indexOf("#}", start + 2);
    return end === -1 ? -1 : end + 2;
}
function findNunjucksEnd(text, start, delimiter) {
    let quote = null;
    let escaped = false;
    for (let i = start; i < text.length - 1; i++) {
        const ch = text[i];
        if (quote !== null) {
            if (escaped) {
                escaped = false;
            }
            else if (ch === "\\") {
                escaped = true;
            }
            else if (ch === quote) {
                quote = null;
            }
            continue;
        }
        if (ch === '"' || ch === "'") {
            quote = ch;
            continue;
        }
        if (text.startsWith(delimiter, i))
            return i + delimiter.length;
    }
    return -1;
}
function findRawBlockEnd(text, start) {
    let pos = start;
    while (pos < text.length) {
        const nextTag = text.indexOf("{%", pos);
        if (nextTag === -1)
            return -1;
        const tagEnd = findNunjucksEnd(text, nextTag + 2, "%}");
        if (tagEnd === -1)
            return -1;
        const tag = text.slice(nextTag, tagEnd);
        if (getTagName(tag) === "endraw")
            return tagEnd;
        pos = tagEnd;
    }
    return -1;
}
/**
 * Check if a position is inside an HTML tag (between < and >)
 */
function isInsideHtmlTag(text, position) {
    // Look backwards for < that's not part of </ or <! or <= or <[ or <{
    let i = position - 1;
    while (i >= 0) {
        const char = text[i];
        if (char === ">") {
            // Found closing > before opening <, so we're not inside a tag
            return false;
        }
        if (char === "<") {
            // Check if this is a closing tag or other special case
            const nextChar = text[i + 1];
            if (nextChar === "/" || nextChar === "!" || nextChar === "=") {
                return false;
            }
            // Check for array access like array[0] or object like {key: value}
            if (nextChar === "[" || nextChar === "{") {
                return false;
            }
            // Found opening < without closing >, we're inside a tag
            return true;
        }
        i--;
    }
    return false;
}
/**
 * Check if a match occupies its own line (only whitespace before/after on that line)
 */
function isOnOwnLine(text, match, offset) {
    const lineStart = text.lastIndexOf("\n", offset - 1);
    const before = text.slice(lineStart + 1, offset);
    const matchEnd = offset + match.length;
    const lineEnd = text.indexOf("\n", matchEnd);
    const after = lineEnd === -1 ? text.slice(matchEnd) : text.slice(matchEnd, lineEnd);
    return /^\s*$/.test(before) && /^\s*$/.test(after);
}
export function replacePlaceholders(text) {
    const map = new Map();
    const prefix = createPrefix(text);
    let output = "";
    let id = 0;
    let pos = 0;
    while (pos < text.length) {
        const commentStart = text.indexOf("{#", pos);
        const tagStart = text.indexOf("{%", pos);
        const expressionStart = text.indexOf("{{", pos);
        const starts = [commentStart, tagStart, expressionStart].filter((value) => value !== -1);
        if (starts.length === 0) {
            output += text.slice(pos);
            break;
        }
        const start = Math.min(...starts);
        output += text.slice(pos, start);
        let match;
        let type;
        let end;
        if (start === commentStart) {
            end = findCommentEnd(text, start);
            if (end === -1) {
                output += text.slice(start);
                break;
            }
            match = text.slice(start, end);
            type = "comment";
        }
        else if (start === tagStart) {
            end = findNunjucksEnd(text, start + 2, "%}");
            if (end === -1) {
                output += text.slice(start);
                break;
            }
            const tag = text.slice(start, end);
            if (getTagName(tag) === "raw") {
                const rawEnd = findRawBlockEnd(text, end);
                if (rawEnd !== -1)
                    end = rawEnd;
            }
            match = text.slice(start, end);
            type = "tag";
        }
        else {
            end = findNunjucksEnd(text, start + 2, "}}");
            if (end === -1) {
                output += text.slice(start);
                break;
            }
            match = text.slice(start, end);
            type = "expression";
        }
        const currentId = id++;
        let placeholder;
        const insideHtmlTag = isInsideHtmlTag(text, start);
        if (type === "comment") {
            if (insideHtmlTag) {
                placeholder = `${prefix}_C${currentId}`;
            }
            else {
                placeholder = `<!-- ${prefix}_C${currentId} -->`;
            }
        }
        else if (type === "tag") {
            if (isBlockTag(match) && !insideHtmlTag) {
                placeholder = `<!-- ${prefix}_T${currentId} -->`;
            }
            else {
                placeholder = `${prefix}_T${currentId}`;
            }
        }
        else if (!insideHtmlTag && (match.includes("\n") || isOnOwnLine(text, match, start))) {
            placeholder = `<!-- ${prefix}_E${currentId} -->`;
        }
        else {
            placeholder = `${prefix}_E${currentId}`;
        }
        map.set(placeholder, {
            id: currentId,
            original: match,
            type,
        });
        output += placeholder;
        pos = end;
    }
    return { output, map };
}
export function restorePlaceholders(text, map, tabWidth = 2) {
    let result = text;
    const entries = [...map].sort((a, b) => b[0].length - a[0].length);
    for (const [placeholder, entry] of entries) {
        const escaped = placeholder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        result = result.replace(new RegExp(escaped, "g"), (match, offset) => {
            const original = entry.original;
            if (!original.includes("\n"))
                return original;
            // Find column position of placeholder in the output
            const lastNewline = result.lastIndexOf("\n", offset);
            const targetColumn = lastNewline === -1 ? offset : offset - lastNewline - 1;
            if (entry.type === "tag" && getTagName(original) === "raw") {
                const lines = original.split("\n");
                const edgeIndent = " ".repeat(targetColumn);
                const contentIndent = " ".repeat(targetColumn + tabWidth);
                return lines
                    .map((line, i) => {
                    if (i === 0)
                        return line.trimStart();
                    if (i === lines.length - 1)
                        return edgeIndent + line.trimStart();
                    if (line.trim().length === 0)
                        return "";
                    return contentIndent + line.trimStart();
                })
                    .join("\n");
            }
            const lines = original.split("\n");
            // Find minimum indentation of lines 2+ (non-empty only)
            let minIndent = Infinity;
            for (let i = 1; i < lines.length; i++) {
                if (lines[i].trim().length === 0)
                    continue;
                const indent = lines[i].match(/^(\s*)/)?.[1].length ?? 0;
                if (indent < minIndent)
                    minIndent = indent;
            }
            if (minIndent === Infinity)
                minIndent = 0;
            // Re-indent lines 2+ relative to the target column
            const reindented = lines.map((line, i) => {
                if (i === 0)
                    return line;
                if (line.trim().length === 0)
                    return "";
                const currentIndent = line.match(/^(\s*)/)?.[1].length ?? 0;
                const newIndent = targetColumn + (currentIndent - minIndent);
                return " ".repeat(Math.max(0, newIndent)) + line.trimStart();
            });
            return reindented.join("\n");
        });
    }
    return result;
}
