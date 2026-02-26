import { describe, it, expect } from "vitest";
import {
  replacePlaceholders,
  restorePlaceholders,
} from "../src/placeholder.js";

describe("replacePlaceholders", () => {
  it("replaces expressions {{ }}", () => {
    const { output, map } = replacePlaceholders("<p>{{ name }}</p>");

    expect(output).not.toContain("{{");
    expect(output).toContain("PRETTIER_NUNJUCKS_E");
    expect(map.size).toBe(1);
  });

  it("replaces block tags {% %}", () => {
    const { output, map } = replacePlaceholders(
      "{% if show %}<p>hi</p>{% endif %}",
    );

    expect(output).not.toContain("{%");
    expect(output).toContain("PRETTIER_NUNJUCKS_T");
    expect(map.size).toBe(2);
  });

  it("replaces comments {# #}", () => {
    const { output, map } = replacePlaceholders("{# a comment #}<p>hi</p>");

    expect(output).not.toContain("{#");
    expect(output).toContain("PRETTIER_NUNJUCKS_C");
    expect(map.size).toBe(1);
  });

  it("handles multiple constructs", () => {
    const input =
      "{% if x %}<p>{{ name }}</p>{# comment #}{% endif %}";
    const { output, map } = replacePlaceholders(input);

    expect(map.size).toBe(4);
    expect(output).not.toContain("{{");
    expect(output).not.toContain("{%");
    expect(output).not.toContain("{#");
  });

  it("handles whitespace control tags {% - %}", () => {
    const { output, map } = replacePlaceholders("{%- if show -%}hello{%- endif -%}");

    expect(output).not.toContain("{%");
    expect(map.size).toBe(2);
  });
});

describe("restorePlaceholders", () => {
  it("restores all placeholders back to originals", () => {
    const original = "{% if show %}<p>{{ name }}</p>{# comment #}{% endif %}";
    const { output, map } = replacePlaceholders(original);
    const restored = restorePlaceholders(output, map);

    expect(restored).toBe(original);
  });

  it("round-trips expressions in attributes", () => {
    const original = '<div class="{{ cls }}" id="{{ id }}"></div>';
    const { output, map } = replacePlaceholders(original);
    const restored = restorePlaceholders(output, map);

    expect(restored).toBe(original);
  });
});
