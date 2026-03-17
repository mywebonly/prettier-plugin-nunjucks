/**
 * Post-processing for formatted Nunjucks output:
 * 1. Pre-process expression placeholders (collapse objects in arrays)
 * 2. Format object/array literals inside {% set %} tags
 * 3. Indent content inside {% block %}...{% endblock %}
 */
// ─── Public API ──────────────────────────────────────────────
export function formatOutput(text, printWidth, tabWidth) {
    let result = text;
    result = formatSetTags(result, printWidth, tabWidth);
    result = formatBlocks(result, tabWidth);
    result = collapseEmptyBlocks(result);
    return result;
}
/**
 * Pre-process expression entries in the placeholder map before restoration.
 * Collapses multi-line objects inside arrays within {{ }} expressions
 * so that restorePlaceholders re-indents them correctly.
 */
export function preprocessExpressions(map, tabWidth) {
    for (const [, entry] of map) {
        if (entry.type === "expression" && entry.original.includes("\n")) {
            const processed = collapseObjectsInExprArrays(entry.original, tabWidth);
            if (processed !== entry.original) {
                entry.original = processed;
            }
        }
    }
}
// ─── Expression Array Collapsing ─────────────────────────────
function collapseObjectsInExprArrays(expr, tabWidth) {
    let result = "";
    let i = 0;
    while (i < expr.length) {
        // Skip string literals
        if (expr[i] === '"' || expr[i] === "'") {
            const end = skipStringLiteral(expr, i);
            result += expr.slice(i, end);
            i = end;
            continue;
        }
        if (expr[i] === "[") {
            const endIdx = findBalancedBracket(expr, i);
            if (endIdx !== -1) {
                const section = expr.slice(i, endIdx + 1);
                if (section.includes("\n") && section.includes("{")) {
                    const formatted = reformatArraySection(section, getLineIndent(expr, i), tabWidth);
                    if (formatted !== null) {
                        result += formatted;
                        i = endIdx + 1;
                        continue;
                    }
                }
            }
        }
        result += expr[i++];
    }
    return result;
}
function reformatArraySection(arrayText, lineIndent, tabWidth) {
    const inner = arrayText.slice(1, -1).trim();
    if (!inner)
        return null;
    const tokens = tokenize(inner);
    if (tokens.length === 0)
        return null;
    // Wrap tokens with brackets to parse as array
    const wrapTokens = [
        { type: "open_bracket", value: "[" },
        ...tokens,
        { type: "close_bracket", value: "]" },
    ];
    const parsed = parseArray(wrapTokens, 0);
    if (!parsed || parsed.nextPos !== wrapTokens.length)
        return null;
    const arr = parsed.value;
    // Only reformat if array contains objects
    if (!arr.items.some((item) => item.type === "object"))
        return null;
    const itemIndent = lineIndent + tabWidth;
    const itemIndentStr = " ".repeat(itemIndent);
    const closingIndentStr = " ".repeat(lineIndent);
    const itemLines = arr.items.map((item) => `${itemIndentStr}${formatOneLine(item)}`);
    return "[\n" + itemLines.join(",\n") + "\n" + closingIndentStr + "]";
}
function skipStringLiteral(text, start) {
    const quote = text[start];
    let i = start + 1;
    while (i < text.length && text[i] !== quote) {
        if (text[i] === "\\")
            i++;
        i++;
    }
    return i < text.length ? i + 1 : i;
}
function findBalancedBracket(text, start) {
    let depth = 0;
    let i = start;
    while (i < text.length) {
        if (text[i] === '"' || text[i] === "'") {
            i = skipStringLiteral(text, i);
            continue;
        }
        if (text[i] === "[")
            depth++;
        else if (text[i] === "]") {
            depth--;
            if (depth === 0)
                return i;
        }
        i++;
    }
    return -1;
}
function getLineIndent(text, pos) {
    const lineStart = text.lastIndexOf("\n", pos - 1);
    const lineContent = text.slice(lineStart + 1);
    const match = lineContent.match(/^(\s*)/);
    return match ? match[1].length : 0;
}
// ─── Empty Block Collapsing ──────────────────────────────────
/**
 * Collapse empty blocks like:
 *   {% block name %}
 *   {% endblock %}
 * into a single line: {% block name %}{% endblock %}
 */
function collapseEmptyBlocks(text) {
    return text.replace(/(\{%[-~]?\s*block\s+\w+\s*[-~]?%\})\s*\n\s*(\{%[-~]?\s*endblock\s*[-~]?%\})/g, "$1$2");
}
// ─── Set Tag Formatting ─────────────────────────────────────
const MULTILINE_SET_RE = /\{%[-~]?\s*set\s+\w+\s*=\s*[\s\S]*?[-~]?%\}/g;
function formatSetTags(text, printWidth, tabWidth) {
    // Process from end to start to preserve positions
    const matches = [];
    let m;
    const re = new RegExp(MULTILINE_SET_RE.source, "g");
    while ((m = re.exec(text)) !== null) {
        if (m[0].includes("\n")) {
            matches.push({ match: m[0], index: m.index });
        }
    }
    // Process in reverse order to maintain correct indices
    let result = text;
    for (let i = matches.length - 1; i >= 0; i--) {
        const { match, index } = matches[i];
        // Calculate base indent from line start
        const lineStart = result.lastIndexOf("\n", index - 1);
        const prefix = result.slice(lineStart + 1, index);
        const baseIndent = prefix.length;
        const formatted = formatSingleSetTag(match, printWidth, tabWidth, baseIndent);
        result = result.slice(0, index) + formatted + result.slice(index + match.length);
    }
    return result;
}
function formatSingleSetTag(tag, printWidth, tabWidth, baseIndent = 0) {
    // Strip leading whitespace for parsing
    const strippedTag = tag.replace(/^\s*/, "");
    const m = strippedTag.match(/^(\{%[-~]?\s*set\s+(\w+)\s*=\s*)([\s\S]*?)(\s*[-~]?%\})$/);
    if (!m)
        return tag;
    const varName = m[2];
    const rawValue = m[3].trim();
    const tokens = tokenize(rawValue);
    const parsed = parseValue(tokens, 0);
    if (!parsed || parsed.nextPos !== tokens.length)
        return tag;
    // Flat value (no nesting) → try one line
    if (!hasNesting(parsed.value)) {
        const oneLine = `{% set ${varName} = ${formatOneLine(parsed.value)} %}`;
        if (oneLine.length + baseIndent <= printWidth) {
            return oneLine;
        }
    }
    // Has nesting or doesn't fit → multi-line format:
    //     {% set varname = {
    //         key: value
    //     ] %}
    const prefix = `{% set ${varName} = `;
    // Content indent is one level deeper than base
    const contentIndent = baseIndent + tabWidth;
    const formatted = formatValueMultiLine(parsed.value, printWidth, tabWidth, contentIndent, baseIndent + prefix.length, true, baseIndent);
    return prefix + formatted + " %}";
}
function hasNesting(value) {
    if (value.type === "object") {
        return value.pairs.some((p) => p.value.type === "object" ||
            p.value.type === "array" ||
            hasNesting(p.value));
    }
    if (value.type === "array") {
        return value.items.some((item) => item.type === "object" ||
            item.type === "array" ||
            hasNesting(item));
    }
    return false;
}
function tokenize(text) {
    const tokens = [];
    let i = 0;
    while (i < text.length) {
        const ch = text[i];
        if (/\s/.test(ch)) {
            i++;
            continue;
        }
        if (ch === "{") {
            tokens.push({ type: "open_brace", value: "{" });
            i++;
        }
        else if (ch === "}") {
            tokens.push({ type: "close_brace", value: "}" });
            i++;
        }
        else if (ch === "[") {
            tokens.push({ type: "open_bracket", value: "[" });
            i++;
        }
        else if (ch === "]") {
            tokens.push({ type: "close_bracket", value: "]" });
            i++;
        }
        else if (ch === ",") {
            tokens.push({ type: "comma", value: "," });
            i++;
        }
        else if (ch === ":") {
            tokens.push({ type: "colon", value: ":" });
            i++;
        }
        else if (ch === '"' || ch === "'") {
            const quote = ch;
            let j = i + 1;
            while (j < text.length && text[j] !== quote) {
                if (text[j] === "\\")
                    j++;
                j++;
            }
            tokens.push({ type: "string", value: text.slice(i, j + 1) });
            i = j + 1;
        }
        else if (/[a-zA-Z_]/.test(ch)) {
            let j = i;
            while (j < text.length && /[\w]/.test(text[j]))
                j++;
            tokens.push({ type: "ident", value: text.slice(i, j) });
            i = j;
        }
        else if (/[0-9]/.test(ch) ||
            (ch === "-" && i + 1 < text.length && /[0-9]/.test(text[i + 1]))) {
            let j = i;
            if (text[j] === "-")
                j++;
            while (j < text.length && /[0-9.]/.test(text[j]))
                j++;
            tokens.push({ type: "number", value: text.slice(i, j) });
            i = j;
        }
        else {
            // Unknown character — abort tokenization
            return [];
        }
    }
    return tokens;
}
function parseValue(tokens, pos) {
    if (pos >= tokens.length)
        return null;
    const token = tokens[pos];
    if (token.type === "open_brace")
        return parseObject(tokens, pos);
    if (token.type === "open_bracket")
        return parseArray(tokens, pos);
    if (token.type === "string" ||
        token.type === "number" ||
        token.type === "ident") {
        return {
            value: { type: "literal", value: token.value },
            nextPos: pos + 1,
        };
    }
    return null;
}
function parseObject(tokens, pos) {
    if (tokens[pos]?.type !== "open_brace")
        return null;
    pos++;
    const pairs = [];
    while (pos < tokens.length && tokens[pos].type !== "close_brace") {
        const keyToken = tokens[pos];
        if (keyToken.type !== "ident" && keyToken.type !== "string")
            return null;
        pos++;
        if (tokens[pos]?.type !== "colon")
            return null;
        pos++;
        const valResult = parseValue(tokens, pos);
        if (!valResult)
            return null;
        pairs.push({ key: keyToken.value, value: valResult.value });
        pos = valResult.nextPos;
        if (tokens[pos]?.type === "comma")
            pos++;
    }
    if (tokens[pos]?.type !== "close_brace")
        return null;
    pos++;
    return { value: { type: "object", pairs }, nextPos: pos };
}
function parseArray(tokens, pos) {
    if (tokens[pos]?.type !== "open_bracket")
        return null;
    pos++;
    const items = [];
    while (pos < tokens.length && tokens[pos].type !== "close_bracket") {
        const valResult = parseValue(tokens, pos);
        if (!valResult)
            return null;
        items.push(valResult.value);
        pos = valResult.nextPos;
        if (tokens[pos]?.type === "comma")
            pos++;
    }
    if (tokens[pos]?.type !== "close_bracket")
        return null;
    pos++;
    return { value: { type: "array", items }, nextPos: pos };
}
// ─── Formatter ──────────────────────────────────────────────
function formatOneLine(value) {
    if (value.type === "literal")
        return value.value;
    if (value.type === "object") {
        if (value.pairs.length === 0)
            return "{}";
        const parts = value.pairs.map((p) => `${p.key}: ${formatOneLine(p.value)}`);
        return "{ " + parts.join(", ") + " }";
    }
    if (value.type === "array") {
        if (value.items.length === 0)
            return "[]";
        const parts = value.items.map(formatOneLine);
        return "[" + parts.join(", ") + "]";
    }
    return "";
}
function formatValueMultiLine(value, printWidth, tabWidth, indent, column, forceExpand = false, closeIndent) {
    const oneLine = formatOneLine(value);
    if (!forceExpand && column + oneLine.length <= printWidth)
        return oneLine;
    const indentStr = " ".repeat(indent);
    // Use closeIndent for closing bracket if provided, otherwise use indent
    const closeIndentStr = " ".repeat(closeIndent ?? indent);
    // When closeIndent is specified, indent is already the content level
    // Otherwise use traditional inner indent (indent + tabWidth)
    const innerIndent = closeIndent !== undefined ? indent : indent + tabWidth;
    const innerIndentStr = " ".repeat(innerIndent);
    if (value.type === "object") {
        if (value.pairs.length === 0)
            return "{}";
        const parts = value.pairs.map((p) => {
            const childForce = hasNesting(p.value);
            const valColumn = innerIndent + p.key.length + 2;
            const valFormatted = formatValueMultiLine(p.value, printWidth, tabWidth, innerIndent, valColumn, childForce);
            return `${innerIndentStr}${p.key}: ${valFormatted}`;
        });
        return "{\n" + parts.join(",\n") + "\n" + closeIndentStr + "}";
    }
    if (value.type === "array") {
        if (value.items.length === 0)
            return "[]";
        const parts = value.items.map((item) => {
            const childForce = hasNesting(item);
            const formatted = formatValueMultiLine(item, printWidth, tabWidth, innerIndent, innerIndent, childForce);
            return `${innerIndentStr}${formatted}`;
        });
        return "[\n" + parts.join(",\n") + "\n" + closeIndentStr + "]";
    }
    return oneLine;
}
// ─── Block Formatting ───────────────────────────────────────
// Opening tags that increase indentation
const OPENING_TAGS = /^\{%[-~]?\s*(if|for|block|macro|call|filter|raw)\b/;
// Block-form set: {% set name %} (without =)
const BLOCK_SET_TAG = /^\{%[-~]?\s*set\s+\w+\s*[-~]?%\}$/;
// Closing tags that decrease indentation (start of line)
const CLOSING_TAGS = /^\{%[-~]?\s*(endif|endfor|endblock|endmacro|endcall|endfilter|endraw|endset)\b/;
// Closing tags anywhere in the line (for self-closing detection)
const CONTAINS_CLOSING = /\{%[-~]?\s*(endif|endfor|endblock|endmacro|endcall|endfilter|endraw|endset)\b/;
// Middle tags that temporarily decrease indentation for one line
const MIDDLE_TAGS = /^\{%[-~]?\s*(else|elif|elseif)\b/;
function formatBlocks(text, tabWidth) {
    // Ensure closing tags are on their own lines
    let result = text.replace(/(\S)[ \t]*(\{%[-~]?\s*(?:endif|endfor|endblock|endmacro|endcall|endfilter|endraw|endset)\b.*?[-~]?%\})/g, "$1\n$2");
    const lines = result.split("\n");
    const output = [];
    const indent = " ".repeat(tabWidth);
    // Stack tracks nesting depth; we just need the count
    let depth = 0;
    for (const line of lines) {
        const trimmed = line.trim();
        const isOpening = OPENING_TAGS.test(trimmed) || BLOCK_SET_TAG.test(trimmed);
        const isClosing = CLOSING_TAGS.test(trimmed);
        const containsClosing = CONTAINS_CLOSING.test(trimmed);
        if (isOpening && containsClosing) {
            // Self-contained line (e.g., {% block name %}{% endblock %}) — no depth change
            if (depth > 0) {
                output.push(indent.repeat(depth) + line);
            }
            else {
                output.push(line);
            }
        }
        else if (isClosing) {
            // Decrease depth, then output at same level as opener
            depth = Math.max(0, depth - 1);
            output.push(indent.repeat(depth) + line);
        }
        else if (MIDDLE_TAGS.test(trimmed)) {
            // else/elif at same level as opener (one less than content)
            output.push(indent.repeat(Math.max(0, depth - 1)) + line);
        }
        else if (depth > 0) {
            if (trimmed) {
                output.push(indent.repeat(depth) + line);
            }
            else {
                output.push("");
            }
        }
        else {
            output.push(line);
        }
        // Check if this line opens a new block (after outputting it)
        if (isOpening && !containsClosing) {
            depth++;
        }
    }
    return output.join("\n");
}
