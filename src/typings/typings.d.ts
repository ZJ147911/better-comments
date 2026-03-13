/** 全局类型补充（部分由 parser 内局部接口覆盖） */
interface CommentTag {
    tag: string;
    escapedTag: string;
    decoration: any;
    ranges: Array<any>;
}

interface Contributions {
    multilineComments: boolean;
    useJSDocStyle: boolean;
    highlightPlainText: boolean;
    tags: [{
        tag: string;
        color: string;
        strikethrough: boolean;
        underline: boolean;
        bold: boolean;
        italic: boolean;
        backgroundColor: string;
    }];
}

interface CommentConfig {
    lineComment?: string;
    blockComment?: [string, string];
}