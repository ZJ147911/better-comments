/**
 * 注释高亮引擎（纯函数，无类）
 * @file highlight.ts
 * @description 根据语言配置与标签定义解析注释格式、查找匹配区间并应用装饰
 */

import * as vscode from 'vscode';
import type { CommentConfig, CommentFormat, HighlightState, TagDef } from './types';

/** 高亮相关配置（来自 better-comments） */
export interface HighlightOptions {
    /** 是否启用块注释高亮 */
    multilineComments?: boolean;
    /** 纯文本模式下是否高亮（仅当语言为 plaintext 时生效） */
    highlightPlainText?: boolean;
}

/** 按标签名聚合的区间列表，用于 applyDecorations */
export type RangesByTag = Map<string, vscode.Range[]>;

/**
 * 正则特殊字符转义
 * @param input 原始字符串
 * @returns 转义后字符串
 */
function escapeRegExp(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 使用 JSDoc 高亮的语言 ID */
const JSDOC_LANGUAGES = new Set([
    'apex', 'javascript', 'javascriptreact', 'typescript', 'typescriptreact',
    'vue', 'vue-html', 'dart', 'svelte',
]);

/** 需忽略首行的语言（如 shebang） */
const IGNORE_FIRST_LINE_LANGUAGES = new Set([
    'elixir', 'python', 'tcl', 'ruby', 'shellscript', 'perl', 'r',
]);

/**
 * 从语言配置与语言 ID 解析注释格式与开关
 * @param commentConfig 当前语言的 lineComment/blockComment，无则返回默认关闭的格式
 * @param languageCode 语言短标识
 * @param options 多行注释、纯文本开关
 * @returns 注释格式，供 buildHighlightState 与查找函数使用
 * @remarks 仅有块注释的语言（如 HTML）lineComment 为 null，delimiter 为空，highlightSingleLine 为 false
 */
export function resolveCommentFormat(
    commentConfig: CommentConfig | undefined,
    languageCode: string,
    options: HighlightOptions = {}
): CommentFormat {
    const format: CommentFormat = {
        delimiter: '',
        blockCommentStart: '',
        blockCommentEnd: '',
        highlightSingleLine: true,
        highlightBlock: false,
        highlightJSDoc: false,
        ignoreFirstLine: false,
        isPlainText: false,
    };

    if (!commentConfig) return format;

    const lineComment = commentConfig.lineComment !== undefined && commentConfig.lineComment !== null
        ? commentConfig.lineComment
        : null;
    const blockStart = commentConfig.blockComment?.[0] ?? null;
    const blockEnd = commentConfig.blockComment?.[1] ?? null;

    if (lineComment) {
        if (typeof lineComment === 'string') {
            format.delimiter = escapeRegExp(lineComment).replace(/\//gi, '\\/');
        } else if (Array.isArray(lineComment) && lineComment.length > 0) {
            format.delimiter = lineComment.map(s => escapeRegExp(s)).join('|');
        }
    } else {
        format.highlightSingleLine = false;
    }

    if (blockStart && blockEnd) {
        format.blockCommentStart = escapeRegExp(blockStart);
        format.blockCommentEnd = escapeRegExp(blockEnd);
        format.highlightBlock = !!options.multilineComments;
    }

    format.highlightJSDoc = JSDOC_LANGUAGES.has(languageCode);
    format.ignoreFirstLine = IGNORE_FIRST_LINE_LANGUAGES.has(languageCode);

    if (languageCode === 'plaintext') {
        format.isPlainText = true;
    }

    return format;
}

/**
 * 构建单行注释匹配正则（分隔符 + 可选空白 + 标签 + 尾部）
 * @param format 注释格式
 * @param tagDefs 标签定义（用于拼标签模式）
 * @param isPlainText 是否纯文本模式（用行首匹配）
 * @returns 正则或 null（当不支持单行时）
 */
function buildSingleLineRegex(
    format: CommentFormat,
    tagDefs: TagDef[],
    isPlainText: boolean
): RegExp | null {
    if (!format.highlightSingleLine && !isPlainText) return null;
    const characters = tagDefs.map(t => t.escapedTag);
    if (characters.length === 0) return null;

    let prefix: string;
    if (isPlainText) {
        prefix = '(^)+([ \\t]*[ \\t]*)';
    } else {
        prefix = '(' + format.delimiter + ')+( |\t)*';
    }
    const expr = prefix + '(' + characters.join('|') + ')+(.*)';
    const flags = isPlainText ? 'igm' : 'ig';
    return new RegExp(expr, flags);
}

/**
 * 根据语言配置、格式与标签构建高亮状态
 * @param commentConfig 当前语言的注释配置，undefined 表示不支持
 * @param languageCode 语言短标识
 * @param tagDefs 标签定义列表
 * @param options 多行/纯文本开关
 * @returns 高亮状态，supported 为 false 时调用方可不执行查找
 * @remarks plaintext 时 supported 由 options.highlightPlainText 决定
 */
export function buildHighlightState(
    commentConfig: CommentConfig | undefined,
    languageCode: string,
    tagDefs: TagDef[],
    options: HighlightOptions = {}
): HighlightState {
    const format = resolveCommentFormat(commentConfig, languageCode, options);

    let supported = !!commentConfig;
    if (languageCode === 'plaintext') {
        supported = !!options.highlightPlainText;
    }

    const singleLineRegex = buildSingleLineRegex(
        format,
        tagDefs,
        format.isPlainText && !!options.highlightPlainText
    );

    return {
        supported,
        format,
        tagDefs,
        singleLineRegex,
    };
}

/**
 * 按标签名查找对应的 TagDef（不区分大小写）
 */
function findTagByKey(tagDefs: TagDef[], tagKey: string): TagDef | undefined {
    return tagDefs.find(t => t.tag.toLowerCase() === tagKey);
}

/**
 * 在文档中查找单行注释匹配并按标签聚合区间
 * @param editor 当前编辑器
 * @param state 高亮状态
 * @param rangesByTag 可变 Map，将把新区间按标签合并进去
 * @remarks 若 format.highlightSingleLine 为 false 或 singleLineRegex 为 null 则不执行
 */
export function findSingleLineRanges(
    editor: vscode.TextEditor,
    state: HighlightState,
    rangesByTag: RangesByTag
): void {
    if (!state.supported || !state.format.highlightSingleLine || !state.singleLineRegex) return;

    const text = editor.document.getText();
    const re = state.singleLineRegex;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
        const startPos = editor.document.positionAt(match.index);
        if (state.format.ignoreFirstLine && startPos.line === 0 && startPos.character === 0) continue;
        const endPos = editor.document.positionAt(match.index + match[0].length);
        const tagKey = (match[3] as string).toLowerCase();
        const tagDef = findTagByKey(state.tagDefs, tagKey);
        if (tagDef) {
            const list = rangesByTag.get(tagDef.tag) ?? [];
            list.push(new vscode.Range(startPos, endPos));
            rangesByTag.set(tagDef.tag, list);
        }
    }
}

/**
 * 块注释内匹配标签行的正则（用于块内容逐行匹配）
 */
function getBlockInnerTagRegex(tagDefs: TagDef[]): RegExp {
    const characters = tagDefs.map(t => t.escapedTag);
    const commentMatchString = '(^)+([ \\t]*[ \\t]*)(' + characters.join('|') + ')([ ]*|[:])+([^*/][^\\r\\n]*)';
    return new RegExp(commentMatchString, 'igm');
}

/**
 * 在文档中查找块注释内匹配标签的区间
 * @param editor 当前编辑器
 * @param state 高亮状态
 * @param rangesByTag 可变 Map，将把新区间按标签合并进去
 */
export function findBlockRanges(
    editor: vscode.TextEditor,
    state: HighlightState,
    rangesByTag: RangesByTag
): void {
    if (!state.supported || !state.format.highlightBlock) return;

    const text = editor.document.getText();
    const { blockCommentStart, blockCommentEnd } = state.format;
    const regexString = '(^|[ \\t])(' + blockCommentStart + '[\\s]*)([\\s\\S]*?)(' + blockCommentEnd + ')';
    const regEx = new RegExp(regexString, 'gm');
    const commentRegEx = getBlockInnerTagRegex(state.tagDefs);

    let match: RegExpExecArray | null;
    while ((match = regEx.exec(text)) !== null) {
        const block = match[0];
        let line: RegExpExecArray | null;
        while ((line = commentRegEx.exec(block)) !== null) {
            const startPos = editor.document.positionAt(match.index + line.index + (line[2]?.length ?? 0));
            const endPos = editor.document.positionAt(match.index + line.index + line[0].length);
            const tagKey = (line[3] as string).toLowerCase();
            const tagDef = findTagByKey(state.tagDefs, tagKey);
            if (tagDef) {
                const list = rangesByTag.get(tagDef.tag) ?? [];
                list.push(new vscode.Range(startPos, endPos));
                rangesByTag.set(tagDef.tag, list);
            }
        }
    }
}

/** JSDoc 块正则：/** ... *\/ */
const JSDOC_BLOCK_REGEX = /(^|[ \t])(\/\*\*)+([\s\S]*?)(\*\/)/gm;

/**
 * 在文档中查找 JSDoc 块内匹配标签的区间
 * @param editor 当前编辑器
 * @param state 高亮状态
 * @param rangesByTag 可变 Map，将把新区间按标签合并进去
 */
export function findJSDocRanges(
    editor: vscode.TextEditor,
    state: HighlightState,
    rangesByTag: RangesByTag
): void {
    if (!state.supported || (!state.format.highlightBlock && !state.format.highlightJSDoc)) return;

    const text = editor.document.getText();
    const commentMatchString = '(^)+([ \\t]*\\*[ \\t]*)(' + state.tagDefs.map(t => t.escapedTag).join('|') + ')([ ]*|[:])+([^*/][^\\r\\n]*)';
    const commentRegEx = new RegExp(commentMatchString, 'igm');

    let match: RegExpExecArray | null;
    while ((match = JSDOC_BLOCK_REGEX.exec(text)) !== null) {
        const block = match[0];
        let line: RegExpExecArray | null;
        while ((line = commentRegEx.exec(block)) !== null) {
            const startPos = editor.document.positionAt(match.index + line.index + (line[2]?.length ?? 0));
            const endPos = editor.document.positionAt(match.index + line.index + line[0].length);
            const tagKey = (line[3] as string).toLowerCase();
            const tagDef = findTagByKey(state.tagDefs, tagKey);
            if (tagDef) {
                const list = rangesByTag.get(tagDef.tag) ?? [];
                list.push(new vscode.Range(startPos, endPos));
                rangesByTag.set(tagDef.tag, list);
            }
        }
    }
}

/**
 * 对当前编辑器执行单行、块、JSDoc 三种查找并合并到同一 RangesByTag
 * @param editor 当前编辑器
 * @param state 高亮状态（须已由 buildHighlightState 构建）
 * @returns 按标签聚合的区间 Map，可直接传给 applyDecorations
 * @remarks 会依次调用 findSingleLineRanges、findBlockRanges、findJSDocRanges 并合并结果
 */
export function collectHighlightRanges(editor: vscode.TextEditor, state: HighlightState): RangesByTag {
    const rangesByTag: RangesByTag = new Map();
    findSingleLineRanges(editor, state, rangesByTag);
    findBlockRanges(editor, state, rangesByTag);
    findJSDocRanges(editor, state, rangesByTag);
    return rangesByTag;
}

/**
 * 将按标签聚合的区间应用到编辑器装饰
 * @param editor 当前编辑器
 * @param tagDefs 标签定义（含 decoration）
 * @param rangesByTag 各标签对应的区间列表
 * @remarks 未在 rangesByTag 中出现的标签会应用空数组，以清除旧装饰
 */
export function applyDecorations(
    editor: vscode.TextEditor,
    tagDefs: TagDef[],
    rangesByTag: RangesByTag
): void {
    for (const tagDef of tagDefs) {
        const ranges = rangesByTag.get(tagDef.tag) ?? [];
        editor.setDecorations(tagDef.decoration, ranges);
    }
}
