import type { PlaceholderEntry, PlaceholderResult } from "./types.js";

const NUNJUCKS_COMMENT = /\{#[\s\S]*?#\}/g;
const NUNJUCKS_TAG = /\{%[-~]?\s*[\s\S]*?[-~]?%\}/g;
const NUNJUCKS_EXPRESSION = /\{\{[\s\S]*?\}\}/g;

// Combined pattern: comments first, then tags, then expressions
const NUNJUCKS_ALL =
  /(\{#[\s\S]*?#\})|(\{%[-~]?\s*[\s\S]*?[-~]?%\})|(\{\{[\s\S]*?\}\})/g;

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
  "endset",
  "raw",
  "endraw",
]);

function getTagName(tag: string): string | null {
  const match = tag.match(/\{%[-~]?\s*(\w+)/);
  return match ? match[1] : null;
}

function isBlockTag(tag: string): boolean {
  const name = getTagName(tag);
  return name !== null && BLOCK_TAG_NAMES.has(name);
}

/**
 * Check if a position is inside an HTML tag (between < and >)
 */
function isInsideHtmlTag(text: string, position: number): boolean {
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

export function replacePlaceholders(text: string): PlaceholderResult {
  const map = new Map<string, PlaceholderEntry>();
  let id = 0;

  const output = text.replace(
    NUNJUCKS_ALL,
    (match, comment, tag, expr, offset) => {
      const currentId = id++;
      let type: PlaceholderEntry["type"];
      let placeholder: string;

      const insideHtmlTag = isInsideHtmlTag(text, offset);

      if (comment) {
        type = "comment";
        if (insideHtmlTag) {
          // Inside HTML tag - use text placeholder to avoid breaking the tag
          placeholder = `${PREFIX}_C${currentId}`;
        } else {
          placeholder = `<!-- ${PREFIX}_C${currentId} -->`;
        }
      } else if (tag) {
        type = "tag";
        if (isBlockTag(tag) && !insideHtmlTag) {
          placeholder = `<!-- ${PREFIX}_T${currentId} -->`;
        } else {
          // Inline tag or inside HTML tag — use text placeholder
          placeholder = `${PREFIX}_T${currentId}`;
        }
      } else {
        type = "expression";
        // Use HTML comment for multiline expressions (not inside HTML tags)
        // so prettier treats them as block elements
        if (match.includes("\n") && !insideHtmlTag) {
          placeholder = `<!-- ${PREFIX}_E${currentId} -->`;
        } else {
          placeholder = `${PREFIX}_E${currentId}`;
        }
      }

      map.set(placeholder, {
        id: currentId,
        original: match,
        type,
      });

      return placeholder;
    },
  );

  return { output, map };
}

export function restorePlaceholders(
  text: string,
  map: Map<string, PlaceholderEntry>,
): string {
  let result = text;
  for (const [placeholder, entry] of map) {
    const escaped = placeholder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(escaped, "g"), (match, offset) => {
      const original = entry.original;
      if (!original.includes("\n")) return original;

      // Find column position of placeholder in the output
      const lastNewline = result.lastIndexOf("\n", offset);
      const targetColumn = lastNewline === -1 ? offset : offset - lastNewline - 1;

      const lines = original.split("\n");
      // Find minimum indentation of lines 2+ (non-empty only)
      let minIndent = Infinity;
      for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim().length === 0) continue;
        const indent = lines[i].match(/^(\s*)/)?.[1].length ?? 0;
        if (indent < minIndent) minIndent = indent;
      }
      if (minIndent === Infinity) minIndent = 0;

      // Re-indent lines 2+ relative to the target column
      const reindented = lines.map((line, i) => {
        if (i === 0) return line;
        if (line.trim().length === 0) return "";
        const currentIndent = line.match(/^(\s*)/)?.[1].length ?? 0;
        const newIndent = targetColumn + (currentIndent - minIndent);
        return " ".repeat(Math.max(0, newIndent)) + line.trimStart();
      });

      return reindented.join("\n");
    });
  }
  return result;
}
