/**
 * 共享类型声明（全局，无导入导出）
 * @file types.d.ts
 * @description 供配置、标签、高亮、输出通道等模块使用的接口与类型
 */
/// <reference types="vscode" />

// ---------------------------------------------------------------------------
// 语言与注释配置
// ---------------------------------------------------------------------------

/**
 * 语言配置文件中的 comments 段（来自各扩展的 language-configuration.json）
 * @see https://code.visualstudio.com/api/language-extensions/language-configuration-guide
 */
interface CommentConfig {
    /** 行注释起始符，如 "//" 或 ["//", "#"]，无则仅支持块注释（如 HTML） */
    lineComment?: string | string[] | null;
    /** 块注释 [起始, 结束]，如 C 风格或 HTML 风格 */
    blockComment?: [string, string] | null;
}

/**
 * 单条高亮标签的装饰定义
 * @remarks 与 package.json 中 better-comments.tags 的单项对应，含转义后的正则用字符串
 */
interface TagDef {
    /** 标签原文，如 "todo"、"!" */
    tag: string;
    /** 已转义、用于正则的标签模式 */
    escapedTag: string;
    /** VS Code 装饰类型，用于应用颜色等样式 */
    decoration: import('vscode').TextEditorDecorationType;
}

/**
 * 当前语言的注释格式与高亮开关
 * @remarks 由语言配置 + 语言 ID 特例（如 JSDoc、首行忽略）推导得出
 */
interface CommentFormat {
    /** 单行注释分隔符的正则转义形式，空串表示不支持单行 */
    delimiter: string;
    /** 块注释起始的正则转义形式 */
    blockCommentStart: string;
    /** 块注释结束的正则转义形式 */
    blockCommentEnd: string;
    /** 块注释结束符原文（用于只高亮内容时裁掉末尾） */
    rawBlockCommentEnd?: string;
    /** 是否高亮单行注释（如 //、#） */
    highlightSingleLine: boolean;
    /** 是否高亮块注释（C 风格或 HTML 风格） */
    highlightBlock: boolean;
    /** 是否高亮 JSDoc 风格 */
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
interface HighlightState {
    /** 当前语言是否支持注释高亮 */
    supported: boolean;
    /** 注释格式与开关 */
    format: CommentFormat;
    /** 标签定义列表（含 decoration） */
    tagDefs: TagDef[];
    /** 单行注释正则，仅当 highlightSingleLine 为 true 时非 null */
    singleLineRegex: RegExp | null;
}

// ---------------------------------------------------------------------------
// 输出通道与日志
// ---------------------------------------------------------------------------

/** 日志级别，用于过滤与输出 */
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * 可选日志接口：扩展内各模块可注入，未注入时使用 noopLogger 无输出
 */
interface Logger {
    debug(message: string): void;
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
}

// ---------------------------------------------------------------------------
// 标签与高亮
// ---------------------------------------------------------------------------

/** 配置项中单条标签的结构（与 package.json contributes 一致；tag 可为单个名称或名称数组，数组时共用同一样式；匹配注释内标签时不区分大小写） */
interface TagItem {
    /** 标签名或标签名数组；与注释内文本匹配时不区分大小写（如 todo / TODO 均匹配） */
    tag: string | string[];
    /** 注释文字颜色，支持 CSS 颜色值（如 #FF0000、rgb(255,0,0)） */
    color?: string;
    /** 注释文字背景色，支持 CSS 颜色值；默认透明 */
    backgroundColor?: string;
    /** 是否对匹配的注释文字加删除线 */
    strikethrough?: boolean;
    /** 是否对匹配的注释文字加下划线 */
    underline?: boolean;
    /** 是否对匹配的注释文字加粗 */
    bold?: boolean;
    /** 是否对匹配的注释文字使用斜体 */
    italic?: boolean;
}

/** 高亮相关配置（来自 better-comments） */
interface HighlightOptions {
    /** 是否启用块注释高亮 */
    multilineComments?: boolean;
    /** 纯文本模式下是否高亮（仅当语言为 plaintext 时生效） */
    highlightPlainText?: boolean;
}

/** 按标签名聚合的区间列表，用于 applyDecorations */
type RangesByTag = Map<string, import('vscode').Range[]>;
