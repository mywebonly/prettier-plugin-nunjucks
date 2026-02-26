export declare const languages: {
    name: string;
    parsers: string[];
    extensions: string[];
    vscodeLanguageIds: string[];
}[];
export declare const parsers: {
    nunjucks: {
        parse: (text: string, options: any) => Promise<{
            type: string;
            body: string;
            source: string;
        }>;
        astFormat: string;
        locStart: () => number;
        locEnd: (node: any) => any;
    };
};
export declare const printers: {
    "nunjucks-output": {
        print(path: any): any;
    };
};
export declare const options: {};
export declare const defaultOptions: {
    tabWidth: number;
};
declare const _default: {
    languages: {
        name: string;
        parsers: string[];
        extensions: string[];
        vscodeLanguageIds: string[];
    }[];
    parsers: {
        nunjucks: {
            parse: (text: string, options: any) => Promise<{
                type: string;
                body: string;
                source: string;
            }>;
            astFormat: string;
            locStart: () => number;
            locEnd: (node: any) => any;
        };
    };
    printers: {
        "nunjucks-output": {
            print(path: any): any;
        };
    };
    options: {};
    defaultOptions: {
        tabWidth: number;
    };
};
export default _default;
