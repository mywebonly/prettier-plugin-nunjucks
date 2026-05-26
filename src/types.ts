export interface PlaceholderEntry {
  id: number;
  original: string;
  type: "expression" | "tag" | "comment";
}

export interface PlaceholderResult {
  output: string;
  map: Map<string, PlaceholderEntry>;
}
