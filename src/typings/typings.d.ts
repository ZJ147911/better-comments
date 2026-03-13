/** 全局类型补充（供未迁移代码或测试使用） */
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