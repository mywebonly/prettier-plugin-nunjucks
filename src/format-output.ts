/**
 * Post-processing for formatted Nunjucks output:
 * 1. Pre-process expression placeholders (collapse objects in arrays)
 * 2. Format object/array literals inside {% set %} tags
 * 3. Indent content inside {% block %}...{% endblock %}
 */

import type { PlaceholderEntry } from "./types.js";

// ─── Public API ──────────────────────────────────────────────

export function formatOutput(text: string, printWidth: number, tabWidth: number): string {
  let result = text;
  result = normalizeHtmlClosingTags(result);
  result = formatSetTags(result, printWidth, tabWidth);
  result = formatBlocks(result, tabWidth);
  result = normalizeTextareaExpressions(result, tabWidth);
  result = collapseEmptyBlocks(result);
  result = collapseSimpleIfBlocks(result, printWidth);
  result = collapseSimpleOpeningTags(result, printWidth);
  result = breakInlineExpressions(result, tabWidth);
  return result;
}

function normalizeHtmlClosingTags(text: string): string {
  return text.replace(/<\/([A-Za-z][\w:-]*)[ \t\r\n]+>/g, "</$1>");
}

/**
 * Pre-process expression entries in the placeholder map before restoration.
 * Collapses multi-line objects inside arrays within {{ }} expressions
 * so that restorePlaceholders re-indents them correctly.
 */
export function preprocessExpressions(map: Map<string, PlaceholderEntry>, printWidth: number, tabWidth: number): void {
  for (const [, entry] of map) {
    if (entry.type === "expression" && entry.original.includes("\n")) {
      const processed = collapseObjectsInExprArrays(entry.original, printWidth, tabWidth);
      if (processed !== entry.original) {
        entry.original = processed;
      }
    }
  }
}

// ─── Expression Array Collapsing ─────────────────────────────

function collapseObjectsInExprArrays(expr: string, printWidth: number, tabWidth: number): string {
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
          const formatted = reformatArraySection(section, getLineIndent(expr, i), printWidth, tabWidth);
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

function reformatArraySection(arrayText: string, lineIndent: number, printWidth: number, tabWidth: number): string | null {
  const inner = arrayText.slice(1, -1).trim();
  if (!inner) return null;

  const tokens = tokenize(inner);
  if (tokens.length === 0) return null;

  // Wrap tokens with brackets to parse as array
  const wrapTokens: Token[] = [{ type: "open_bracket", value: "[" }, ...tokens, { type: "close_bracket", value: "]" }];
  const parsed = parseArray(wrapTokens, 0);
  if (!parsed || parsed.nextPos !== wrapTokens.length) return null;

  const arr = parsed.value as ArrayValue;
  // Only reformat if array contains objects
  if (!arr.items.some((item) => item.type === "object")) return null;

  const itemIndent = lineIndent + tabWidth;
  const itemIndentStr = " ".repeat(itemIndent);
  const closingIndentStr = " ".repeat(lineIndent);

  const itemLines = arr.items.map((item) => {
    const formatted = formatValueMultiLine(item, printWidth, tabWidth, itemIndent, itemIndent);
    return `${itemIndentStr}${formatted}`;
  });
  return "[\n" + itemLines.join(",\n") + "\n" + closingIndentStr + "]";
}

function skipStringLiteral(text: string, start: number): number {
  const quote = text[start];
  let i = start + 1;
  while (i < text.length && text[i] !== quote) {
    if (text[i] === "\\") i++;
    i++;
  }
  return i < text.length ? i + 1 : i;
}

function findBalancedBracket(text: string, start: number): number {
  let depth = 0;
  let i = start;

  while (i < text.length) {
    if (text[i] === '"' || text[i] === "'") {
      i = skipStringLiteral(text, i);
      continue;
    }

    if (text[i] === "[") depth++;
    else if (text[i] === "]") {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }

  return -1;
}

function getLineIndent(text: string, pos: number): number {
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
function collapseEmptyBlocks(text: string): string {
  return text.replace(/(\{%[-~]?\s*block\s+\w+\s*[-~]?%\})\s*\n\s*(\{%[-~]?\s*endblock\s*[-~]?%\})/g, "$1$2");
}

// ─── Set Tag Formatting ─────────────────────────────────────

const MULTILINE_SET_RE = /\{%[-~]?\s*set\s+\w+\s*=\s*[\s\S]*?[-~]?%\}/g;

function formatSetTags(text: string, printWidth: number, tabWidth: number): string {
  // Process from end to start to preserve positions
  const matches: { match: string; index: number }[] = [];
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

function formatSingleSetTag(tag: string, printWidth: number, tabWidth: number, baseIndent: number = 0): string {
  // Strip leading whitespace for parsing
  const strippedTag = tag.replace(/^\s*/, "");

  const m = strippedTag.match(/^(\{%[-~]?\s*set\s+(\w+)\s*=\s*)([\s\S]*?)(\s*[-~]?%\})$/);
  if (!m) return tag;

  const varName = m[2];
  const rawValue = m[3].trim();

  const tokens = tokenize(rawValue);
  const parsed = parseValue(tokens, 0);
  if (!parsed || parsed.nextPos !== tokens.length) return tag;

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

  const formatted = formatValueMultiLine(
    parsed.value,
    printWidth,
    tabWidth,
    contentIndent,
    baseIndent + prefix.length,
    true,
    baseIndent, // closing brace aligns with base indent
  );

  return prefix + formatted + " %}";
}

function hasNesting(value: Value): boolean {
  if (value.type === "object") {
    return value.pairs.some((p) => p.value.type === "object" || p.value.type === "array" || hasNesting(p.value));
  }
  if (value.type === "array") {
    return value.items.some((item) => item.type === "object" || item.type === "array" || hasNesting(item));
  }
  return false;
}

// ─── Tokenizer ──────────────────────────────────────────────

interface Token {
  type: "open_brace" | "close_brace" | "open_bracket" | "close_bracket" | "comma" | "colon" | "string" | "ident" | "number";
  value: string;
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
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
    } else if (ch === "}") {
      tokens.push({ type: "close_brace", value: "}" });
      i++;
    } else if (ch === "[") {
      tokens.push({ type: "open_bracket", value: "[" });
      i++;
    } else if (ch === "]") {
      tokens.push({ type: "close_bracket", value: "]" });
      i++;
    } else if (ch === ",") {
      tokens.push({ type: "comma", value: "," });
      i++;
    } else if (ch === ":") {
      tokens.push({ type: "colon", value: ":" });
      i++;
    } else if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      while (j < text.length && text[j] !== quote) {
        if (text[j] === "\\") j++;
        j++;
      }
      tokens.push({ type: "string", value: text.slice(i, j + 1) });
      i = j + 1;
    } else if (/[a-zA-Z_]/.test(ch)) {
      let j = i;
      while (j < text.length && /[\w]/.test(text[j])) j++;
      tokens.push({ type: "ident", value: text.slice(i, j) });
      i = j;
    } else if (/[0-9]/.test(ch) || (ch === "-" && i + 1 < text.length && /[0-9]/.test(text[i + 1]))) {
      let j = i;
      if (text[j] === "-") j++;
      while (j < text.length && /[0-9.]/.test(text[j])) j++;
      tokens.push({ type: "number", value: text.slice(i, j) });
      i = j;
    } else {
      // Unknown character — abort tokenization
      return [];
    }
  }

  return tokens;
}

// ─── Parser ─────────────────────────────────────────────────

type Value = ObjectValue | ArrayValue | LiteralValue;

interface ObjectValue {
  type: "object";
  pairs: { key: string; value: Value }[];
}

interface ArrayValue {
  type: "array";
  items: Value[];
}

interface LiteralValue {
  type: "literal";
  value: string;
}

interface ParseResult {
  value: Value;
  nextPos: number;
}

function parseValue(tokens: Token[], pos: number): ParseResult | null {
  if (pos >= tokens.length) return null;

  const token = tokens[pos];

  if (token.type === "open_brace") return parseObject(tokens, pos);
  if (token.type === "open_bracket") return parseArray(tokens, pos);
  if (token.type === "string" || token.type === "number" || token.type === "ident") {
    return {
      value: { type: "literal", value: token.value },
      nextPos: pos + 1,
    };
  }

  return null;
}

function parseObject(tokens: Token[], pos: number): ParseResult | null {
  if (tokens[pos]?.type !== "open_brace") return null;
  pos++;

  const pairs: { key: string; value: Value }[] = [];

  while (pos < tokens.length && tokens[pos].type !== "close_brace") {
    const keyToken = tokens[pos];
    if (keyToken.type !== "ident" && keyToken.type !== "string") return null;
    pos++;

    if (tokens[pos]?.type !== "colon") return null;
    pos++;

    const valResult = parseValue(tokens, pos);
    if (!valResult) return null;

    pairs.push({ key: keyToken.value, value: valResult.value });
    pos = valResult.nextPos;

    if (tokens[pos]?.type === "comma") pos++;
  }

  if (tokens[pos]?.type !== "close_brace") return null;
  pos++;

  return { value: { type: "object", pairs }, nextPos: pos };
}

function parseArray(tokens: Token[], pos: number): ParseResult | null {
  if (tokens[pos]?.type !== "open_bracket") return null;
  pos++;

  const items: Value[] = [];

  while (pos < tokens.length && tokens[pos].type !== "close_bracket") {
    const valResult = parseValue(tokens, pos);
    if (!valResult) return null;

    items.push(valResult.value);
    pos = valResult.nextPos;

    if (tokens[pos]?.type === "comma") pos++;
  }

  if (tokens[pos]?.type !== "close_bracket") return null;
  pos++;

  return { value: { type: "array", items }, nextPos: pos };
}

// ─── Formatter ──────────────────────────────────────────────

function formatOneLine(value: Value): string {
  if (value.type === "literal") return value.value;

  if (value.type === "object") {
    if (value.pairs.length === 0) return "{}";
    const parts = value.pairs.map((p) => `${p.key}: ${formatOneLine(p.value)}`);
    return "{ " + parts.join(", ") + " }";
  }

  if (value.type === "array") {
    if (value.items.length === 0) return "[]";
    const parts = value.items.map(formatOneLine);
    return "[" + parts.join(", ") + "]";
  }

  return "";
}

function formatValueMultiLine(value: Value, printWidth: number, tabWidth: number, indent: number, column: number, forceExpand: boolean = false, closeIndent?: number): string {
  const oneLine = formatOneLine(value);
  if (!forceExpand && column + oneLine.length <= printWidth) return oneLine;

  // Use closeIndent for closing bracket if provided, otherwise use indent
  const closeIndentStr = " ".repeat(closeIndent ?? indent);
  // When closeIndent is specified, indent is already the content level
  // Otherwise use traditional inner indent (indent + tabWidth)
  const innerIndent = closeIndent !== undefined ? indent : indent + tabWidth;
  const innerIndentStr = " ".repeat(innerIndent);

  if (value.type === "object") {
    if (value.pairs.length === 0) return "{}";
    const parts = value.pairs.map((p) => {
      const childForce = hasNesting(p.value);
      const valColumn = innerIndent + p.key.length + 2;
      const valFormatted = formatValueMultiLine(p.value, printWidth, tabWidth, innerIndent, valColumn, childForce);
      return `${innerIndentStr}${p.key}: ${valFormatted}`;
    });
    return "{\n" + parts.join(",\n") + "\n" + closeIndentStr + "}";
  }

  if (value.type === "array") {
    if (value.items.length === 0) return "[]";
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

const SELF_CLOSING_TAG_NAMES = new Set(["extends", "include", "import", "from", "else", "elif", "elseif"]);

function getNunjucksTagName(line: string): string | null {
  const match = line.match(/^\{%[-~]?\s*(\w+)/);
  return match ? match[1] : null;
}

function getOpeningTagName(line: string): string | null {
  const name = getNunjucksTagName(line);
  if (name === null) return null;
  if (name.startsWith("end")) return null;
  if (SELF_CLOSING_TAG_NAMES.has(name)) return null;
  if (/^\{%[-~]?\s*set\s+\w+\s*=/.test(line)) return null;
  return name;
}

function getClosingTagName(line: string): string | null {
  const name = getNunjucksTagName(line);
  if (name === null || !name.startsWith("end")) return null;
  return name.slice(3);
}

function isInsideHtmlTag(text: string, position: number): boolean {
  let i = position - 1;
  while (i >= 0) {
    const char = text[i];
    if (char === ">") return false;
    if (char === "<") {
      const next = text[i + 1];
      if (next === "/" || next === "!") return false;
      return true;
    }
    i--;
  }
  return false;
}

function formatBlocks(text: string, tabWidth: number): string {
  const separatedAdjacentTags = text.replace(
    /(^|\n)([ \t]*)(\{%[-~]?\s*(?:if|for|block|macro|call|filter|raw|set|end\w+)\b.*?[-~]?%\})(?=\{%[-~]?\s*(?:if|for|block|macro|call|filter|raw|set|end\w+)\b)/g,
    "$1$2$3\n$2",
  );

  // Ensure closing tags are on their own lines (but not inside HTML attributes)
  const result = separatedAdjacentTags.replace(/(\S)[ \t]*(\{%[-~]?\s*(?:endif|endfor|endblock|endmacro|endcall|endfilter|endraw|endset)\b.*?[-~]?%\})/g, (match, beforeChar, tagContent, offset) => {
    if (isInsideHtmlTag(separatedAdjacentTags, offset)) return match;
    return beforeChar + "\n" + tagContent;
  });

  const lines = result.split("\n");
  const output: string[] = [];
  const indent = " ".repeat(tabWidth);
  // Stack tracks nesting depth; we just need the count
  let depth = 0;
  let inRawBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();

    const isOpening = OPENING_TAGS.test(trimmed) || BLOCK_SET_TAG.test(trimmed);
    const isClosing = CLOSING_TAGS.test(trimmed);
    const containsClosing = CONTAINS_CLOSING.test(trimmed);
    const openingTagName = getOpeningTagName(trimmed);
    const closingTagName = getClosingTagName(trimmed);
    const isCustomOpening = openingTagName !== null && !OPENING_TAGS.test(trimmed) && !BLOCK_SET_TAG.test(trimmed);
    const isCustomClosing = closingTagName !== null && !CLOSING_TAGS.test(trimmed);
    const isAnyOpening = isOpening || isCustomOpening;
    const isAnyClosing = isClosing || isCustomClosing;
    const containsAnyClosing = containsClosing || /\{%[-~]?\s*end\w+\b/.test(trimmed);
    const containsAnyOpening = /\{%[-~]?\s*(?!end)(?:if|for|block|macro|call|filter|raw|set)\b/.test(trimmed);
    const closesInline = !isAnyClosing && !isAnyOpening && containsAnyClosing && !containsAnyOpening;
    const isRawOpening = /^\{%[-~]?\s*raw\b/.test(trimmed);
    const isRawClosing = /^\{%[-~]?\s*endraw\b/.test(trimmed);

    if (inRawBlock && !isRawClosing) {
      output.push(line);
      continue;
    }

    if (isAnyOpening && containsAnyClosing) {
      // Self-contained line (e.g., {% block name %}{% endblock %}) — no depth change
      if (depth > 0) {
        output.push(indent.repeat(depth) + line);
      } else {
        output.push(line);
      }
    } else if (isAnyClosing) {
      // Decrease depth, then output at same level as opener
      depth = Math.max(0, depth - 1);
      output.push(indent.repeat(depth) + line);
    } else if (MIDDLE_TAGS.test(trimmed)) {
      // else/elif at same level as opener (one less than content)
      output.push(indent.repeat(Math.max(0, depth - 1)) + line);
    } else if (depth > 0) {
      if (trimmed) {
        output.push(indent.repeat(depth) + line);
      } else {
        output.push("");
      }
    } else {
      output.push(line);
    }

    if (closesInline) {
      depth = Math.max(0, depth - 1);
    }

    // Check if this line opens a new block (after outputting it)
    if (isAnyOpening && !containsAnyClosing) {
      depth++;
    }

    if (isRawOpening && !containsClosing) {
      inRawBlock = true;
    } else if (isRawClosing) {
      inRawBlock = false;
    }
  }

  return output.join("\n");
}

function normalizeTextareaExpressions(text: string, tabWidth: number): string {
  const normalizedClosing = text.replace(/<\/textarea[ \t\r\n]*>/g, "</textarea>");

  return normalizedClosing.replace(/(^[ \t]*<textarea\b[^>]*>\n)([\s\S]*?)\n([ \t]*<\/textarea>)/gm, (match, opening, content, closing) => {
    const expression = content.trim();
    if (!/^\{\{[\s\S]*\}\}$/.test(expression) || expression.includes("\n")) {
      return match;
    }

    const baseIndent = opening.match(/^[ \t]*/)?.[0] ?? "";
    const contentIndent = baseIndent + " ".repeat(tabWidth);

    return `${opening}${contentIndent}${expression}\n${baseIndent}${closing.trimStart()}`;
  });
}

// ─── Simple If Block Collapsing ──────────────────────────────

/**
 * Collapse simple {% if %}...{% endif %} blocks onto one line
 * when they fit within print width and have no nested block tags.
 *
 * Before:
 *   {% if id %}id="{{ id }}"
 *   {% endif %}
 * After (if fits on one line):
 *   {% if id %}id="{{ id }}"{% endif %}
 */
function collapseSimpleIfBlocks(text: string, printWidth: number): string {
  const openingContentClosing = text.replace(/^([ \t]*)(\{%[-~]?\s*if\b[^%]*?[-~]?%\})([^\n]*)\n[ \t]*(\{%[-~]?\s*endif\s*[-~]?%\})/gm, (match, indent, opening, content, closing) => {
    if (/\{%[-~]?\s*(if|for|block|macro|call|filter|raw|set)\b/.test(content)) {
      return match;
    }

    const strippedContent = content.trim();
    const collapsed = opening + strippedContent + closing;

    if (indent.length + collapsed.length <= printWidth) {
      return indent + collapsed;
    }

    return match;
  });

  return openingContentClosing.replace(/^([ \t]*)(\{%[-~]?\s*if\b[^%]*?[-~]?%\})\n[ \t]*([^\n]*?)(\{%[-~]?\s*endif\s*[-~]?%\})/gm, (match, indent, opening, content, closing) => {
    if (/\{%[-~]?\s*(if|for|block|macro|call|filter|raw|set)\b/.test(content)) {
      return match;
    }

    const strippedContent = content.trim();
    if (strippedContent.length === 0) return match;

    const contentPrefix = /^[A-Za-z:-][\w:-]*(?:=|\s*\{%)/.test(strippedContent) || /^[A-Za-z:-]+$/.test(strippedContent) ? " " : "";
    const collapsed = opening + contentPrefix + strippedContent + closing;

    if (indent.length + collapsed.length <= printWidth) {
      return indent + collapsed;
    }

    return match;
  });
}

// Collapse simple multiline opening/self-closing tags back to one line when
// Prettier split them only because Nunjucks attribute fragments looked unusual.
function collapseSimpleOpeningTags(text: string, printWidth: number): string {
  const lines = text.split("\n");
  const output: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const openMatch = line.match(/^([ \t]*)<([A-Za-z][\w:-]*)(?:\s*)$/);
    if (!openMatch) {
      output.push(line);
      continue;
    }

    const indent = openMatch[1];
    const parts = [`<${openMatch[2]}`];
    let j = i + 1;
    let closing: string | null = null;

    while (j < lines.length) {
      const current = lines[j];
      const trimmed = current.trim();

      if (trimmed === "/>" || trimmed === ">") {
        closing = trimmed;
        break;
      }

      if (!current.startsWith(indent) || trimmed.length === 0 || trimmed.startsWith("<")) {
        break;
      }

      parts.push(trimmed);
      j++;
    }

    if (closing === null || closing !== "/>" || !parts.some((part) => part.includes("{%"))) {
      output.push(line);
      continue;
    }

    const collapsed = `${indent}${parts.join(" ")} ${closing}`;
    if (collapsed.length <= printWidth) {
      output.push(collapsed);
      i = j;
    } else {
      output.push(line);
    }
  }

  return output.join("\n");
}

// ─── Inline Expression Breaking ──────────────────────────────

/**
 * Break multiple {{ }} expressions inside an HTML element onto separate lines.
 * Input:  <div class="actions">{{ expr1 }}{{ expr2 }}</div>
 * Output: <div class="actions">
 *           {{ expr1 }}
 *           {{ expr2 }}
 *         </div>
 *
 * Only applies when the element contains ONLY {{ }} expressions (no text nodes).
 */
function breakInlineExpressions(text: string, tabWidth: number): string {
  return text.replace(/^(\s*)(<[^/!][^>]*>)(\s*(?:\{\{.*?\}\}\s*)+)(<\/[^>]+>)\s*$/gm, (match, indent, openTag, content, closeTag) => {
    const stripped = content.trim();
    // Verify there's no text content between expressions
    const withoutExprs = stripped.replace(/\{\{.*?\}\}/g, "");
    if (withoutExprs.trim().length > 0) return match;

    const exprs: string[] = [];
    const re = /\{\{.*?\}\}/g;
    let m;
    while ((m = re.exec(stripped)) !== null) {
      exprs.push(m[0]);
    }

    if (exprs.length < 2) return match;

    const innerIndent = indent + " ".repeat(tabWidth);
    const lines = exprs.map((e) => `${innerIndent}${e}`);

    return `${indent}${openTag}\n${lines.join("\n")}\n${indent}${closeTag}`;
  });
}
