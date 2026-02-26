import { describe, it, expect } from "vitest";
import * as prettier from "prettier";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";
import plugin from "../src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, "fixtures");

async function formatNjk(input: string): Promise<string> {
  return prettier.format(input, {
    parser: "nunjucks",
    plugins: [plugin],
    printWidth: 80,
    tabWidth: 2,
  });
}

function readFixture(name: string): string {
  return fs.readFileSync(path.join(fixturesDir, name), "utf-8");
}

describe("prettier-plugin-nunjucks", () => {
  it("formats basic template with if/else", async () => {
    const input = readFixture("basic.input.njk");
    const result = await formatNjk(input);

    expect(result).toContain("{% extends");
    expect(result).toContain("{% block content %}");
    expect(result).toContain("{% if user %}");
    expect(result).toContain("{{ title }}");
    expect(result).toContain("{% else %}");
    expect(result).toContain("{% endif %}");
    expect(result).toContain("{% endblock %}");
  });

  it("formats for loops", async () => {
    const input = readFixture("for-loop.input.njk");
    const result = await formatNjk(input);

    expect(result).toContain("{% for item in items %}");
    expect(result).toContain("{{ item.url }}");
    expect(result).toContain("{{ item.name }}");
    expect(result).toContain("{% endfor %}");
  });

  it("preserves expressions in attributes", async () => {
    const input = readFixture("attributes.input.njk");
    const result = await formatNjk(input);

    expect(result).toContain('{{ className }}"');
    expect(result).toContain("{{ image.url }}");
    expect(result).toContain("{{ image.alt }}");
  });

  it("preserves Nunjucks comments", async () => {
    const input = readFixture("comments.input.njk");
    const result = await formatNjk(input);

    expect(result).toContain("{# This is a Nunjucks comment #}");
    expect(result).toContain("{# Another comment #}");
    expect(result).toContain("{{ content }}");
  });

  it("formats includes and extends", async () => {
    const input = readFixture("include.input.njk");
    const result = await formatNjk(input);

    expect(result).toContain('{% extends "layout.njk" %}');
    expect(result).toContain('{% include "partials/nav.njk" %}');
    expect(result).toContain('{% include "partials/sidebar.njk" %}');
  });

  it("formats nested control structures", async () => {
    const input = readFixture("nested.input.njk");
    const result = await formatNjk(input);

    expect(result).toContain("{% if show %}");
    expect(result).toContain("{% for item in items %}");
    expect(result).toContain("{% if item.active %}");
    expect(result).toContain("{{ item.label }}");
  });

  it("is idempotent", async () => {
    const input = readFixture("basic.input.njk");
    const first = await formatNjk(input);
    const second = await formatNjk(first);

    expect(second).toBe(first);
  });

  it("handles inline expressions in text", async () => {
    const result = await formatNjk(
      "<p>Hello {{ name }}, you have {{ count }} messages</p>\n",
    );

    expect(result).toContain("{{ name }}");
    expect(result).toContain("{{ count }}");
  });
});
