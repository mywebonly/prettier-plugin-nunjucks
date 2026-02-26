/**
 * Post-processing for formatted Nunjucks output:
 * 1. Format object/array literals inside {% set %} tags
 * 2. Indent content inside {% block %}...{% endblock %}
 */

// ─── Public API ──────────────────────────────────────────────

export function formatOutput(
  text: string,
  printWidth: number,
  tabWidth: number,
): string {
  let result = text;
  result = formatSetTags(result, printWidth, tabWidth);
  result = formatBlocks(result, tabWidth);
  return result;
}

// ─── Set Tag Formatting ─────────────────────────────────────

const MULTILINE_SET_RE =
  /\{%[-~]?\s*set\s+\w+\s*=\s*[\s\S]*?[-~]?%\}/g;

function formatSetTags(
  text: string,
  printWidth: number,
  tabWidth: number,
): string {
  return text.replace(MULTILINE_SET_RE, (match) => {
    if (!match.includes("\n")) return match;
    return formatSingleSetTag(match, printWidth, tabWidth);
  });
}

function formatSingleSetTag(
  tag: string,
  printWidth: number,
  tabWidth: number,
): string {
  const m = tag.match(
    /^(\{%[-~]?\s*set\s+\w+\s*=\s*)([\s\S]*?)(\s*[-~]?%\})$/,
  );
  if (!m) return tag;

  const prefix = m[1].replace(/\s+$/, " ");
  const rawValue = m[2].trim();
  const suffix = " %}";

  const tokens = tokenize(rawValue);
  const parsed = parseValue(tokens, 0);
  if (!parsed || parsed.nextPos !== tokens.length) return tag;

  // Flat value (no nesting) → try one line
  if (!hasNesting(parsed.value)) {
    const oneLine = prefix + formatOneLine(parsed.value) + suffix;
    if (oneLine.length <= printWidth) return oneLine;
  }

  // Has nesting or doesn't fit → multi-line with collapsed leaves
  const formatted = formatValueMultiLine(
    parsed.value,
    printWidth,
    tabWidth,
    0,
    prefix.length,
    true,
  );
  return prefix + formatted + suffix;
}

function hasNesting(value: Value): boolean {
  if (value.type === "object") {
    return value.pairs.some(
      (p) => p.value.type === "object" || p.value.type === "array",
    );
  }
  if (value.type === "array") {
    return value.items.some(
      (item) => item.type === "object" || item.type === "array",
    );
  }
  return false;
}

// ─── Tokenizer ──────────────────────────────────────────────

interface Token {
  type:
    | "open_brace"
    | "close_brace"
    | "open_bracket"
    | "close_bracket"
    | "comma"
    | "colon"
    | "string"
    | "ident"
    | "number";
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
    } else if (
      /[0-9]/.test(ch) ||
      (ch === "-" && i + 1 < text.length && /[0-9]/.test(text[i + 1]))
    ) {
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
  if (
    token.type === "string" ||
    token.type === "number" ||
    token.type === "ident"
  ) {
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
    const parts = value.pairs.map(
      (p) => `${p.key}: ${formatOneLine(p.value)}`,
    );
    return "{ " + parts.join(", ") + " }";
  }

  if (value.type === "array") {
    if (value.items.length === 0) return "[]";
    const parts = value.items.map(formatOneLine);
    return "[" + parts.join(", ") + "]";
  }

  return "";
}

function formatValueMultiLine(
  value: Value,
  printWidth: number,
  tabWidth: number,
  indent: number,
  column: number,
  forceExpand: boolean = false,
): string {
  const oneLine = formatOneLine(value);
  if (!forceExpand && column + oneLine.length <= printWidth) return oneLine;

  const indentStr = " ".repeat(indent);
  const innerIndent = indent + tabWidth;
  const innerIndentStr = " ".repeat(innerIndent);

  if (value.type === "object") {
    if (value.pairs.length === 0) return "{}";
    const parts = value.pairs.map((p) => {
      const childForce = hasNesting(p.value);
      const valColumn = innerIndent + p.key.length + 2;
      const valFormatted = formatValueMultiLine(
        p.value,
        printWidth,
        tabWidth,
        innerIndent,
        valColumn,
        childForce,
      );
      return `${innerIndentStr}${p.key}: ${valFormatted}`;
    });
    return "{\n" + parts.join(",\n") + "\n" + indentStr + "}";
  }

  if (value.type === "array") {
    if (value.items.length === 0) return "[]";
    const parts = value.items.map((item) => {
      const childForce = hasNesting(item);
      const formatted = formatValueMultiLine(
        item,
        printWidth,
        tabWidth,
        innerIndent,
        innerIndent,
        childForce,
      );
      return `${innerIndentStr}${formatted}`;
    });
    return "[\n" + parts.join(",\n") + "\n" + indentStr + "]";
  }

  return oneLine;
}

// ─── Block Formatting ───────────────────────────────────────

function formatBlocks(text: string, tabWidth: number): string {
  // Ensure {% endblock %} is always on its own line
  let result = text.replace(
    /([^\n])\s*(\{%[-~]?\s*endblock\b.*?[-~]?%\})/g,
    "$1\n$2",
  );

  const lines = result.split("\n");
  const output: string[] = [];
  let insideBlock = false;
  let blockBaseIndent = "";
  const indent = " ".repeat(tabWidth);

  for (const line of lines) {
    const trimmed = line.trim();

    if (/^\{%[-~]?\s*endblock/.test(trimmed)) {
      insideBlock = false;
      output.push(blockBaseIndent + trimmed);
    } else if (insideBlock) {
      if (trimmed) {
        output.push(blockBaseIndent + indent + trimmed);
      } else {
        output.push("");
      }
    } else {
      output.push(line);
    }

    if (
      /\{%[-~]?\s*block\s/.test(trimmed) &&
      !/\{%[-~]?\s*endblock/.test(trimmed)
    ) {
      insideBlock = true;
      blockBaseIndent = line.match(/^(\s*)/)?.[1] || "";
    }
  }

  return output.join("\n");
}
