import { describe, it, expect } from "vitest";
import { replacePlaceholders, restorePlaceholders } from "../src/placeholder.js";

describe("replacePlaceholders", () => {
  it("replaces expressions {{ }}", () => {
    const { output, map } = replacePlaceholders("<p>{{ name }}</p>");

    expect(output).not.toContain("{{");
    expect(output).toMatch(/PRETTIER_NUNJUCKS_[a-z0-9]+_E0/);
    expect(map.size).toBe(1);
  });

  it("replaces block tags {% %}", () => {
    const { output, map } = replacePlaceholders("{% if show %}<p>hi</p>{% endif %}");

    expect(output).not.toContain("{%");
    expect(output).toMatch(/PRETTIER_NUNJUCKS_[a-z0-9]+_T0/);
    expect(map.size).toBe(2);
  });

  it("replaces comments {# #}", () => {
    const { output, map } = replacePlaceholders("{# a comment #}<p>hi</p>");

    expect(output).not.toContain("{#");
    expect(output).toMatch(/PRETTIER_NUNJUCKS_[a-z0-9]+_C0/);
    expect(map.size).toBe(1);
  });

  it("handles multiple constructs", () => {
    const input = "{% if x %}<p>{{ name }}</p>{# comment #}{% endif %}";
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

  it("does not close tags on %} inside string literals", () => {
    const original = '{% set label = "100%} safe" %}<p>{{ label }}</p>';
    const { output, map } = replacePlaceholders(original);
    const restored = restorePlaceholders(output, map);

    expect(map.size).toBe(2);
    expect(restored).toBe(original);
  });

  it("does not close expressions on }} inside string literals", () => {
    const original = '<p>{{ "}}" | safe }}</p>';
    const { output, map } = replacePlaceholders(original);
    const restored = restorePlaceholders(output, map);

    expect(map.size).toBe(1);
    expect(restored).toBe(original);
  });

  it("does not close constructs on delimiters inside single-quoted strings", () => {
    const original = "<p>{{ '}}' }}</p>{% set label = '%}' %}";
    const { output, map } = replacePlaceholders(original);
    const restored = restorePlaceholders(output, map);

    expect(map.size).toBe(2);
    expect(restored).toBe(original);
  });

  it("does not close constructs on escaped quotes before delimiters", () => {
    const original = '<p>{{ "hello \\"}}\\" world" }}</p>{% set label = "100\\"%} safe" %}';
    const { output, map } = replacePlaceholders(original);
    const restored = restorePlaceholders(output, map);

    expect(map.size).toBe(2);
    expect(restored).toBe(original);
  });

  it("protects raw blocks as one placeholder", () => {
    const original = "{% raw %}\n{{ not evaluated }}\n{% endraw %}";
    const { output, map } = replacePlaceholders(original);
    const restored = restorePlaceholders(output, map);

    expect(output).not.toContain("not evaluated");
    expect(map.size).toBe(1);
    expect(restored).toBe("{% raw %}\n  {{ not evaluated }}\n{% endraw %}");
  });

  it("does not collide with user text that looks like a placeholder", () => {
    const original = "<p>PRETTIER_NUNJUCKS_abc_E0 {{ name }}</p>";
    const { output, map } = replacePlaceholders(original);
    const restored = restorePlaceholders(output, map);

    expect(output).toContain("PRETTIER_NUNJUCKS_abc_E0");
    expect(map.size).toBe(1);
    expect(restored).toBe(original);
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
