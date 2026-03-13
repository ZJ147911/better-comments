/**
 * 共享类型定义
 * @file types.ts
 * @description 供配置、标签、高亮等模块使用的接口与类型
 */

import * as vscode from 'vscode';

/**
 * 语言配置文件中的 comments 段（来自各扩展的 language-configuration.json）
 * @see https://code.visualstudio.com/api/language-extensions/language-configuration-guide
 */
export interface CommentConfig {
    /** 行注释起始符，如 "//" 或 ["//", "#"]，无则仅支持块注释（如 HTML） */
    lineComment?: string | string[] | null;
    /** 块注释 [起始, 结束]，如 ["/*", "*/"] 或 ["<!--", "-->"] */
    blockComment?: [string, string] | null;
}

/**
 * 单条高亮标签的装饰定义
 * @remarks 与 package.json 中 better-comments.tags 的单项对应，含转义后的正则用字符串
 */
export interface TagDef {
    /** 标签原文，如 "todo"、"!" */
    tag: string;
    /** 已转义、用于正则的标签模式 */
    escapedTag: string;
    /** VS Code 装饰类型，用于应用颜色等样式 */
    decoration: vscode.TextEditorDecorationType;
}

/**
 * 当前语言的注释格式与高亮开关
 * @remarks 由语言配置 + 语言 ID 特例（如 JSDoc、首行忽略）推导得出
 */
export interface CommentFormat {
    /** 单行注释分隔符的正则转义形式，空串表示不支持单行 */
    delimiter: string;
    /** 块注释起始的正则转义形式 */
    blockCommentStart: string;
    /** 块注释结束的正则转义形式 */
    blockCommentEnd: string;
    /** 是否高亮单行注释（如 //、#） */
    highlightSingleLine: boolean;
    /** 是否高亮块注释（如 /* */、<!-- -->） */
    highlightBlock: boolean;
    /** 是否高亮 JSDoc 风格（/** * */） */
    highlightJSDoc: boolean;
    /** 是否忽略首行（如 shebang），避免误高亮 */
    ignoreFirstLine: boolean;
    /** 是否为纯文本模式（依赖 highlightPlainText 配置） */
    isPlainText: boolean;
}

/**
 * 高亮引擎状态：格式 + 标签列表 + 单行匹配正则（可选）
 * @remarks 按语言解析一次后复用，用于在文档中查找并应用装饰
 */
export interface HighlightState {
    /** 当前语言是否支持注释高亮 */
    supported: boolean;
    /** 注释格式与开关 */
    format: CommentFormat;
    /** 标签定义列表（含 decoration） */
    tagDefs: TagDef[];
    /** 单行注释正则，仅当 highlightSingleLine 为 true 时非 null */
    singleLineRegex: RegExp | null;
}
