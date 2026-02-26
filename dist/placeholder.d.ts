import type { PlaceholderEntry, PlaceholderResult } from "./types.js";
export declare function replacePlaceholders(text: string): PlaceholderResult;
export declare function restorePlaceholders(text: string, map: Map<string, PlaceholderEntry>): string;
