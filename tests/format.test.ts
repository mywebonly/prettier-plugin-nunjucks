import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as prettier from "prettier";
import { fileURLToPath } from "node:url";
import plugin from "../src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, "fixtures");

async function formatNjk(input: string, options: Partial<prettier.Options> = {}): Promise<string> {
  return prettier.format(input, {
    parser: "nunjucks",
    plugins: [plugin],
    printWidth: 200,
    tabWidth: 2,
    ...options,
  });
}

function readFixture(name: string): string {
  return fs.readFileSync(path.join(fixturesDir, name), "utf-8").replace(/\r\n/g, "\n");
}

function readExpectedFixture(name: string): string {
  return readFixture(name).replace(/\n$/, "");
}

describe("prettier-plugin-nunjucks", () => {
  const fixtureNames = fs
    .readdirSync(fixturesDir)
    .filter((file) => file.endsWith(".input.njk"))
    .map((file) => file.replace(".input.njk", ""))
    .sort();

  for (const name of fixtureNames) {
    it(`matches ${name} expected output and is idempotent`, async () => {
      const input = readFixture(`${name}.input.njk`);
      const expected = readExpectedFixture(`${name}.output.njk`);

      const first = await formatNjk(input);
      const second = await formatNjk(first);

      expect(first).toBe(expected);
      expect(second).toBe(first);
    });
  }

  it("keeps expressions mixed with text inline", async () => {
    const result = await formatNjk("<p>Hello {{ name }}, you have {{ count }} messages</p>\n");

    expect(result).toBe("<p>Hello {{ name }}, you have {{ count }} messages</p>");
  });

  it("breaks multiple component calls in an element onto separate lines", async () => {
    const input =
      "{% block content %}\n" +
      '<div class="actions">{{ button("Get Started", { color: "primary", size: "md", href: "/docs.html" })}}{{ button("Components", { variant: "bordered", color: "secondary", size: "md", href: "/docs/components.html" })}}</div>\n' +
      "{% endblock %}\n";

    const result = await formatNjk(input);
    const divBlock = result.slice(result.indexOf('<div class="actions">'), result.indexOf("</div>") + "</div>".length);
    const expressionLines = divBlock.split("\n").filter((line) => line.includes("{{ button("));

    expect(expressionLines).toHaveLength(2);
  });

  it("keeps a single component expression inline inside an element", async () => {
    const result = await formatNjk("<p>{{ consentNotice(content=consentContent) }}</p>\n");

    expect(result).toMatch(/^<p>\{\{ consentNotice\(content=consentContent\) \}\}<\/p>$/);
  });

  it("does not split HTML closing tags before inline Nunjucks closing tags", async () => {
    const input = "<div>{% if x %}<span>{{ y }}</span>{% endif %}</div>\n";
    const result = await formatNjk(input, { printWidth: 80 });
    const second = await formatNjk(result, { printWidth: 80 });

    expect(result).toBe("<div>\n  {% if x %}<span>{{ y }}</span>{% endif %}\n</div>");
    expect(second).toBe(result);
  });

  it("formats multiline set objects without dropping filter expressions", async () => {
    const input =
      "{% set page = page | default({}) %}\n" +
      "{% set page = {\n" +
      "  breadcrumbs: page.breadcrumbs | default(true),\n" +
      "  heading: page.heading | default(true),\n" +
      '  sidebar_class: page.sidebar_class | default("")\n' +
      "} %}\n";

    const result = await formatNjk(input);

    expect(result).toContain("{% set page = {");
    expect(result).toContain("breadcrumbs: page.breadcrumbs | default(true)");
    expect(result).toContain('sidebar_class: page.sidebar_class | default("")');
    expect(result).toContain("} %}");
  });

  it("respects small printWidth for surrounding HTML", async () => {
    const result = await formatNjk('<a href="/docs/components/buttons.html" class="button button-primary">{{ label }}</a>\n', { printWidth: 40 });
    const second = await formatNjk(result, { printWidth: 40 });

    expect(result).toContain('\n  href="/docs/components/buttons.html"');
    expect(result).toContain('\n  class="button button-primary"');
    expect(result).toContain("{{ label }}");
    expect(second).toBe(result);
  });

  it("passes singleAttributePerLine through to the HTML formatter", async () => {
    const result = await formatNjk('<img src="{{ image.url }}" alt="{{ image.alt }}" class="image" />\n', { singleAttributePerLine: true });

    expect(result).toBe('<img\n  src="{{ image.url }}"\n  alt="{{ image.alt }}"\n  class="image"\n/>');
  });
});
