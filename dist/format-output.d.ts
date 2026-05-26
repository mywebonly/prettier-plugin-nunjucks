/**
 * Post-processing for formatted Nunjucks output:
 * 1. Pre-process expression placeholders (collapse objects in arrays)
 * 2. Format object/array literals inside {% set %} tags
 * 3. Indent content inside {% block %}...{% endblock %}
 */
import type { PlaceholderEntry } from "./types.js";
export declare function formatOutput(text: string, printWidth: number, tabWidth: number): string;
/**
 * Pre-process expression entries in the placeholder map before restoration.
 * Collapses multi-line objects inside arrays within {{ }} expressions
 * so that restorePlaceholders re-indents them correctly.
 */
export declare function preprocessExpressions(map: Map<string, PlaceholderEntry>, tabWidth: number): void;
