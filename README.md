# prettier-plugin-nunjucks

Prettier plugin for formatting Nunjucks (`.njk`, `.nunjucks`) templates.

The plugin uses Prettier's HTML formatter as the formatting engine. Nunjucks
comments, tags, and expressions are temporarily replaced with HTML-safe
placeholders, the document is formatted as HTML, and then the original Nunjucks
syntax is restored.

## Installation

```bash
npm install --save-dev prettier github:mywebonly/prettier-plugin-nunjucks
```

## Usage

Add the plugin to your Prettier config:

```json
{
  "plugins": ["prettier-plugin-nunjucks"]
}
```

Format templates as usual:

```bash
npx prettier --write "**/*.{njk,nunjucks}"
```

## VS Code

Install the [Prettier - Code formatter](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) extension and add a formatter mapping for Nunjucks files:

```json
{
  "[nunjucks]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode",
    "editor.formatOnSave": true
  }
}
```

> For `.njk` syntax highlighting install [Better Nunjucks](https://marketplace.visualstudio.com/items?itemName=ginfuru.better-nunjucks).

## Supported Syntax

The formatter preserves common Nunjucks constructs:

- `{{ expression }}` output, filters, and function calls
- `{% if %}`, `{% elif %}`, `{% else %}`, `{% endif %}`
- `{% for %}`, `{% endfor %}`
- `{% block %}`, `{% endblock %}`
- `{% extends %}`, `{% include %}`, `{% import %}`, `{% from %}`
- `{% macro %}`, `{% endmacro %}`, `{% call %}`, `{% endcall %}`
- `{% set %}`, `{% endset %}`, `{% filter %}`, `{% endfilter %}`
- `{% raw %}`, `{% endraw %}`
- `{# comments #}`
- Whitespace control with `{%-`, `-%}`, `{%~`, and `~%}`

## Limitations

This is a heuristic formatter, not a full Nunjucks parser. It is intended to
produce stable formatting for HTML-like Nunjucks templates while preserving the
original template syntax.

Known limits:

- HTML formatting behavior comes from Prettier's HTML parser.
- Complex Nunjucks expressions are preserved, but not fully parsed or
  reformatted internally.
- Formatting inside `{% raw %}...{% endraw %}` blocks is intentionally left
  unchanged.
- Project-specific custom tags are preserved, but only known block tags affect
  Nunjucks-aware indentation.

## Options

All standard Prettier options supported by the HTML parser can be used, such as
`printWidth`, `tabWidth`, `useTabs`, `singleQuote`,
`singleAttributePerLine`, and `bracketSameLine`.

The plugin does not define additional options.

## Development

```bash
npm install
npm run build
npm test
npm pack --dry-run
```

## License

MIT
