/**
 * Post-processing for formatted Nunjucks output:
 * 1. Format object/array literals inside {% set %} tags
 * 2. Indent content inside {% block %}...{% endblock %}
 */
export declare function formatOutput(text: string, printWidth: number, tabWidth: number): string;
