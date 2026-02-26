# prettier-plugin-nunjucks

Prettier plugin for formatting Nunjucks (`.njk`) template files. Uses Prettier's built-in HTML formatter under the hood, so your templates get proper indentation and line wrapping while all Nunjucks syntax is preserved.

## Installation

```bash
npm install --save-dev prettier prettier-plugin-nunjucks
```

## Usage

Add the plugin to your Prettier config (`.prettierrc`):

```json
{
  "plugins": ["prettier-plugin-nunjucks"]
}
```

Then format as usual:

```bash
npx prettier --write "**/*.njk"
```

### VS Code

1. Install the [Prettier - Code formatter](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) extension
2. Add to `.vscode/settings.json`:

```json
{
  "[nunjucks]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode",
    "editor.formatOnSave": true
  }
}
```

> If VS Code doesn't recognize `.njk` files as Nunjucks, install the [Nunjucks](https://marketplace.visualstudio.com/items?itemName=ronnidc.nunjucks) extension for language support.

## Example

Before:

```njk
{% extends "base.njk" %}
{% block content %}
<div class="page">
<header><h1>{{ page.title }}</h1></header>
<main>
{% if items.length > 0 %}
<ul>
{% for item in items %}
<li><a href="{{ item.url }}">{{ item.name }}</a></li>
{% endfor %}
</ul>
{% else %}
<p>No items.</p>
{% endif %}
</main>
</div>
{% endblock %}
```

After:

```njk
{% extends "base.njk" %}
{% block content %}
<div class="page">
  <header>
    <h1>{{ page.title }}</h1>
  </header>
  <main>
    {% if items.length > 0 %}
    <ul>
      {% for item in items %}
      <li><a href="{{ item.url }}">{{ item.name }}</a></li>
      {% endfor %}
    </ul>
    {% else %}
    <p>No items.</p>
    {% endif %}
  </main>
</div>
{% endblock %}
```

## Supported Nunjucks syntax

- `{{ expression }}` — variable output, filters
- `{% if %}` / `{% elif %}` / `{% else %}` / `{% endif %}`
- `{% for %}` / `{% endfor %}`
- `{% block %}` / `{% endblock %}`
- `{% extends %}` / `{% include %}` / `{% import %}` / `{% from %}`
- `{% macro %}` / `{% endmacro %}` / `{% call %}` / `{% endcall %}`
- `{% set %}` / `{% filter %}` / `{% raw %}`
- `{# comments #}`
- Whitespace control: `{%-`, `-%}`, `{%~`, `~%}`

## Options

All standard Prettier options are supported (`printWidth`, `tabWidth`, `useTabs`, `singleQuote`, etc.). No additional plugin-specific options.

## How it works

1. Nunjucks constructs (`{{ }}`, `{% %}`, `{# #}`) are replaced with HTML-compatible placeholders
2. Prettier formats the result as standard HTML
3. Placeholders are restored back to original Nunjucks syntax

## File extensions

The plugin activates for `.njk` and `.nunjucks` files.

## License

MIT
