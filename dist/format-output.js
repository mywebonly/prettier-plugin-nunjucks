/**
 * Post-processing for formatted Nunjucks output:
 * 1. Format object/array literals inside {% set %} tags
 * 2. Indent content inside {% block %}...{% endblock %}
 */
// ─── Public API ──────────────────────────────────────────────
export function formatOutput(text, printWidth, tabWidth) {
    let result = text;
    result = formatSetTags(result, printWidth, tabWidth);
    result = formatBlocks(result, tabWidth);
    return result;
}
// ─── Set Tag Formatting ─────────────────────────────────────
const MULTILINE_SET_RE = /\{%[-~]?\s*set\s+\w+\s*=\s*[\s\S]*?[-~]?%\}/g;
function formatSetTags(text, printWidth, tabWidth) {
    return text.replace(MULTILINE_SET_RE, (match) => {
        if (!match.includes("\n"))
            return match;
        return formatSingleSetTag(match, printWidth, tabWidth);
    });
}
function formatSingleSetTag(tag, printWidth, tabWidth) {
    const m = tag.match(/^(\{%[-~]?\s*set\s+\w+\s*=\s*)([\s\S]*?)(\s*[-~]?%\})$/);
    if (!m)
        return tag;
    const prefix = m[1].replace(/\s+$/, " ");
    const rawValue = m[2].trim();
    const suffix = " %}";
    const tokens = tokenize(rawValue);
    const parsed = parseValue(tokens, 0);
    if (!parsed || parsed.nextPos !== tokens.length)
        return tag;
    // Flat value (no nesting) → try one line
    if (!hasNesting(parsed.value)) {
        const oneLine = prefix + formatOneLine(parsed.value) + suffix;
        if (oneLine.length <= printWidth)
            return oneLine;
    }
    // Has nesting or doesn't fit → multi-line with collapsed leaves
    const formatted = formatValueMultiLine(parsed.value, printWidth, tabWidth, 0, prefix.length, true);
    return prefix + formatted + suffix;
}
function hasNesting(value) {
    if (value.type === "object") {
        return value.pairs.some((p) => p.value.type === "object" || p.value.type === "array");
    }
    if (value.type === "array") {
        return value.items.some((item) => item.type === "object" || item.type === "array");
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
function formatValueMultiLine(value, printWidth, tabWidth, indent, column, forceExpand = false) {
    const oneLine = formatOneLine(value);
    if (!forceExpand && column + oneLine.length <= printWidth)
        return oneLine;
    const indentStr = " ".repeat(indent);
    const innerIndent = indent + tabWidth;
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
        return "{\n" + parts.join(",\n") + "\n" + indentStr + "}";
    }
    if (value.type === "array") {
        if (value.items.length === 0)
            return "[]";
        const parts = value.items.map((item) => {
            const childForce = hasNesting(item);
            const formatted = formatValueMultiLine(item, printWidth, tabWidth, innerIndent, innerIndent, childForce);
            return `${innerIndentStr}${formatted}`;
        });
        return "[\n" + parts.join(",\n") + "\n" + indentStr + "]";
    }
    return oneLine;
}
// ─── Block Formatting ───────────────────────────────────────
// Opening tags that increase indentation
const OPENING_TAGS = /^\{%[-~]?\s*(if|for|block|macro|call|filter|raw)\b/;
// Closing tags that decrease indentation
const CLOSING_TAGS = /^\{%[-~]?\s*(endif|endfor|endblock|endmacro|endcall|endfilter|endraw)\b/;
// Middle tags that temporarily decrease indentation for one line
const MIDDLE_TAGS = /^\{%[-~]?\s*(else|elif|elseif)\b/;
function formatBlocks(text, tabWidth) {
    // Ensure closing tags are on their own lines
    let result = text.replace(/(\S)[ \t]*(\{%[-~]?\s*(?:endif|endfor|endblock|endmacro|endcall|endfilter|endraw)\b.*?[-~]?%\})/g, "$1\n$2");
    const lines = result.split("\n");
    const output = [];
    const indent = " ".repeat(tabWidth);
    // Stack tracks nesting depth; we just need the count
    let depth = 0;
    for (const line of lines) {
        const trimmed = line.trim();
        if (CLOSING_TAGS.test(trimmed)) {
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
        if (OPENING_TAGS.test(trimmed) && !CLOSING_TAGS.test(trimmed)) {
            depth++;
        }
    }
    return output.join("\n");
}
