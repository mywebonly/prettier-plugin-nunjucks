import { replacePlaceholders, restorePlaceholders } from "./placeholder.js";
export const languages = [
    {
        name: "Nunjucks",
        parsers: ["nunjucks"],
        extensions: [".njk", ".nunjucks"],
        vscodeLanguageIds: ["nunjucks"],
    },
];
export const parsers = {
    nunjucks: {
        parse: async (text, options) => {
            const prettier = await import("prettier");
            const { output, map } = replacePlaceholders(text);
            const formatted = await prettier.format(output, {
                parser: "html",
                printWidth: options.printWidth,
                tabWidth: options.tabWidth,
                useTabs: options.useTabs,
                singleQuote: options.singleQuote,
                htmlWhitespaceSensitivity: options.htmlWhitespaceSensitivity,
                singleAttributePerLine: options.singleAttributePerLine,
                bracketSameLine: options.bracketSameLine,
            });
            const restored = restorePlaceholders(formatted, map);
            return {
                type: "nunjucks-output",
                body: restored,
                source: text,
            };
        },
        astFormat: "nunjucks-output",
        locStart: () => 0,
        locEnd: (node) => node.source?.length ?? 0,
    },
};
export const printers = {
    "nunjucks-output": {
        print(path) {
            const node = path.getValue();
            if (node.type === "nunjucks-output") {
                // Remove trailing newline — Prettier adds its own
                return node.body.replace(/\n$/, "");
            }
            return "";
        },
    },
};
export const options = {};
export const defaultOptions = {
    tabWidth: 2,
};
export default { languages, parsers, printers, options, defaultOptions };
