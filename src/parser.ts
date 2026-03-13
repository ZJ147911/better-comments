/**
 * 注释高亮解析器
 * @file parser.ts
 * @description 根据语言配置与 better-comments.tags 构建正则，在文档中查找单行/块/JSDoc 注释并收集待装饰区间
 */

import * as vscode from 'vscode';
import { Configuration } from './configuration';
import type { Logger } from './outputChannel';

/** 内部：单条标签及其装饰与当前匹配到的区间 */
interface CommentTag {
    tag: string;
    escapedTag: string;
    ranges: { range: vscode.Range }[];
    decoration: vscode.TextEditorDecorationType;
}

/** 内部：better-comments 配置项（tags、multilineComments、highlightPlainText 等） */
interface Contributions {
    tags?: Array<{ tag: string; color?: string; backgroundColor?: string; strikethrough?: boolean; underline?: boolean; bold?: boolean; italic?: boolean }>;
    multilineComments?: boolean;
    highlightPlainText?: boolean;
}

/**
 * 注释高亮解析器：按语言设置分隔符与开关，在编辑器中查找注释并应用装饰
 */
export class Parser {
    private tags: CommentTag[] = [];
    /** 单行注释匹配正则的源字符串（分隔符 + 标签 + 尾部） */
    private expression: string = "";

    private delimiter: string = "";
    private blockCommentStart: string = "";
    private blockCommentEnd: string = "";

    private highlightSingleLineComments = true;
    private highlightMultilineComments = false;
    private highlightJSDoc = false;

    /** 为 true 时按纯文本规则高亮（依赖 highlightPlainText 配置） */
    private isPlainText = false;

    /** 为 true 时跳过首行，避免 shebang 等被当注释 */
    private ignoreFirstLine = false;

    /** 当前语言是否支持注释高亮（有有效语言配置则为 true） */
    public supportedLanguage = true;

    private contributions: Contributions = vscode.workspace.getConfiguration('better-comments') as any;
    private configuration: Configuration;
    private readonly log: Logger;

    /**
     * 创建解析器实例并从未配置中加载标签列表
     * @param config 语言注释配置提供方（用于获取 lineComment/blockComment）
     * @param logger 可选，用于输出面板日志
     */
    public constructor(config: Configuration, logger?: Logger) {
        this.configuration = config;
        this.log = logger ?? { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
        this.setTags();
    }

    /**
     * 按语言设置分隔符与开关，并构建单行注释匹配正则
     * @param languageCode 语言短标识，参见 https://code.visualstudio.com/docs/languages/identifiers
     * @remarks 会更新 supportedLanguage、delimiter、expression 等；仅当 supportedLanguage 为 true 时单行正则有效
     */
    public async SetRegex(languageCode: string): Promise<void> {
        await this.setDelimiter(languageCode);

        if (!this.supportedLanguage) {
            return;
        }

        const characters = this.getTagEscapedPattern();

        if (this.isPlainText && this.contributions.highlightPlainText) {
            this.expression = "(^)+([ \\t]*[ \\t]*)";
        } else {
            this.expression = "(" + this.delimiter + ")+( |\t)*";
        }

        this.expression += "(";
        this.expression += characters.join("|");
        this.expression += ")+(.*)";
        this.log.debug(`已为语言 "${languageCode}" 构建匹配规则（单行: ${this.highlightSingleLineComments}, 块: ${this.highlightMultilineComments}, JSDoc: ${this.highlightJSDoc}）`);
    }

    /**
     * 在文档中查找单行注释（如 // todo、# !）并写入各 tag 的 ranges
     * @param activeEditor 当前编辑器
     * @remarks 依赖已通过 SetRegex 构建的 expression；若 highlightSingleLineComments 为 false 则直接返回
     */
    public FindSingleLineComments(activeEditor: vscode.TextEditor): void {

        if (!this.highlightSingleLineComments) return;

        let text = activeEditor.document.getText();

        let regexFlags = (this.isPlainText) ? "igm" : "ig";
        let regEx = new RegExp(this.expression, regexFlags);

        let match: RegExpExecArray | null;
        while ((match = regEx.exec(text)) !== null) {
            const startPos = activeEditor.document.positionAt(match.index);
            const endPos = activeEditor.document.positionAt(match.index + match[0].length);
            if (this.ignoreFirstLine && startPos.line === 0 && startPos.character === 0) continue;

            const tagKey = (match[3] as string).toLowerCase();
            const matchTag = this.findTagByKey(tagKey);
            if (matchTag) {
                matchTag.ranges.push({ range: new vscode.Range(startPos, endPos) });
            }
        }
    }

    /**
     * 在文档中查找块注释（如 /* *\/、<!-- -->）内匹配标签的行并写入各 tag 的 ranges
     * @param activeEditor 当前编辑器
     * @remarks 依赖 blockCommentStart/End 与 contributions.multilineComments
     */
    public FindBlockComments(activeEditor: vscode.TextEditor): void {

        if (!this.highlightMultilineComments) return;
        
        let text = activeEditor.document.getText();

        const characters = this.getTagEscapedPattern();
        const commentMatchString = "(^)+([ \\t]*[ \\t]*)(" + characters.join("|") + ")([ ]*|[:])+([^*/][^\\r\\n]*)";

        let regexString = "(^|[ \\t])(";
        regexString += this.blockCommentStart;
        regexString += "[\\s]*)([\\s\\S]*?)(";
        regexString += this.blockCommentEnd;
        regexString += ")";

        let regEx = new RegExp(regexString, "gm");
        let commentRegEx = new RegExp(commentMatchString, "igm");

        let match: RegExpExecArray | null;
        while ((match = regEx.exec(text)) !== null) {
            const commentBlock = match[0];
            let line: RegExpExecArray | null;
            while ((line = commentRegEx.exec(commentBlock)) !== null) {
                const startPos = activeEditor.document.positionAt(match.index + line.index + line[2].length);
                const endPos = activeEditor.document.positionAt(match.index + line.index + line[0].length);
                const tagKey = (line[3] as string).toLowerCase();
                const matchTag = this.findTagByKey(tagKey);
                if (matchTag) {
                    matchTag.ranges.push({ range: new vscode.Range(startPos, endPos) });
                }
            }
        }
    }

    /**
     * 在文档中查找 /** ... *\/ 形式的 JSDoc 块内匹配标签的行并写入各 tag 的 ranges
     * @param activeEditor 当前编辑器
     * @remarks 仅当 highlightJSDoc 或 highlightMultilineComments 为 true 时执行
     */
    public FindJSDocComments(activeEditor: vscode.TextEditor): void {

        if (!this.highlightMultilineComments && !this.highlightJSDoc) return;

        const text = activeEditor.document.getText();
        const characters = this.getTagEscapedPattern();
        const commentMatchString = "(^)+([ \\t]*\\*[ \\t]*)(" + characters.join("|") + ")([ ]*|[:])+([^*/][^\\r\\n]*)";
        const regEx = /(^|[ \t])(\/\*\*)+([\s\S]*?)(\*\/)/gm;

        const commentRegEx = new RegExp(commentMatchString, "igm");

        let match: RegExpExecArray | null;
        while ((match = regEx.exec(text)) !== null) {
            const commentBlock = match[0];
            let line: RegExpExecArray | null;
            while ((line = commentRegEx.exec(commentBlock)) !== null) {
                const startPos = activeEditor.document.positionAt(match.index + line.index + line[2].length);
                const endPos = activeEditor.document.positionAt(match.index + line.index + line[0].length);
                const tagKey = (line[3] as string).toLowerCase();
                const matchTag = this.findTagByKey(tagKey);
                if (matchTag) {
                    matchTag.ranges.push({ range: new vscode.Range(startPos, endPos) });
                }
            }
        }
    }

    /**
     * 将各 tag 收集到的 ranges 应用到编辑器装饰，并清空 ranges
     * @param activeEditor 当前编辑器
     */
    public ApplyDecorations(activeEditor: vscode.TextEditor): void {
        for (let tag of this.tags) {
            activeEditor.setDecorations(tag.decoration, tag.ranges);
            tag.ranges.length = 0;
        }
    }

    //#region 私有方法

    /**
     * 从语言配置解析 lineComment/blockComment，并设置 JSDoc、首行忽略、纯文本等开关
     * @param languageCode 语言短标识
     */
    private async setDelimiter(languageCode: string): Promise<void> {
        this.supportedLanguage = false;
        this.ignoreFirstLine = false;
        this.isPlainText = false;

        const config = await this.configuration.GetCommentConfiguration(languageCode);
        if (config) {
            let blockCommentStart = config.blockComment ? config.blockComment[0] : null;
            let blockCommentEnd = config.blockComment ? config.blockComment[1] : null;
            // 仅有块注释的语言（如 HTML）不把 blockCommentStart 当行注释用，否则会从 <!-- 匹配到行尾导致错误高亮
            const lineComment = config.lineComment !== undefined && config.lineComment !== null
                ? config.lineComment
                : null;
            this.setCommentFormat(lineComment, blockCommentStart, blockCommentEnd);

            this.supportedLanguage = true;
        }

        switch (languageCode) {
            case "apex":
            case "javascript":
            case "javascriptreact":
            case "typescript":
            case "typescriptreact":
            case "vue":
            case "vue-html":
            case "dart":
            case "svelte":
                this.highlightJSDoc = true;
                break;

            case "elixir":
            case "python":
            case "tcl":
            case "ruby":
            case "shellscript":
            case "perl":
            case "r":
                this.ignoreFirstLine = true;
                break;
            
            case "plaintext":
                this.isPlainText = true;
                this.supportedLanguage = !!this.contributions.highlightPlainText;
                break;
        }
    }

    /**
     * 从 better-comments.tags 配置构建 tags 列表（含转义与 decoration），无效时回退默认标签
     */
    private setTags(): void {
        const raw = this.contributions?.tags;
        const items = Array.isArray(raw) && raw.length > 0 ? raw : this.getDefaultTags();
        if (!raw || !Array.isArray(raw) || (raw as unknown[]).length === 0) {
            this.log.warn('未读取到 better-comments.tags 配置，已使用内置默认标签');
        }
        for (const item of items) {
            const tag = typeof item.tag === 'string' ? item.tag : String(item?.tag ?? '');
            if (!tag) {
                this.log.warn('跳过无效的标签项：tag 为空或非字符串');
                continue;
            }
            const color = typeof item.color === 'string' ? item.color : 'transparent';
            const backgroundColor = typeof item.backgroundColor === 'string' ? item.backgroundColor : 'transparent';
            const options: vscode.DecorationRenderOptions = { color, backgroundColor };
            options.textDecoration = "";

            if (item.strikethrough) {
                options.textDecoration += "line-through";
            }
            if (item.underline) {
                options.textDecoration += " underline";
            }
            if (item.bold) {
                options.fontWeight = "bold";
            }
            if (item.italic) {
                options.fontStyle = "italic";
            }

            const escapedSequence = tag.replace(/([()[{*+.$^\\|?])/g, '\\$1');
            this.tags.push({
                tag,
                escapedTag: escapedSequence.replace(/\//gi, "\\/"),
                ranges: [],
                decoration: vscode.window.createTextEditorDecorationType(options)
            });
        }
        if (this.tags.length === 0) {
            this.log.warn('未得到有效标签，已使用内置默认标签');
            for (const item of this.getDefaultTags()) {
                let opts: vscode.DecorationRenderOptions = { color: item.color, backgroundColor: item.backgroundColor };
                opts.textDecoration = [item.strikethrough && 'line-through', item.underline && 'underline'].filter(Boolean).join(' ') || '';
                if (item.bold) opts.fontWeight = 'bold';
                if (item.italic) opts.fontStyle = 'italic';
                const escapedSequence = item.tag.replace(/([()[{*+.$^\\|?])/g, '\\$1');
                this.tags.push({
                    tag: item.tag,
                    escapedTag: escapedSequence.replace(/\//gi, "\\/"),
                    ranges: [],
                    decoration: vscode.window.createTextEditorDecorationType(opts)
                });
            }
        }
    }

    /** 当配置未加载或为空时使用的默认标签（与 package.json 默认一致） */
    private getDefaultTags(): Array<{ tag: string; color: string; strikethrough: boolean; underline: boolean; bold: boolean; italic: boolean; backgroundColor: string }> {
        return [
            { tag: '!', color: '#FF2D00', strikethrough: false, underline: false, bold: false, italic: false, backgroundColor: 'transparent' },
            { tag: '?', color: '#3498DB', strikethrough: false, underline: false, bold: false, italic: false, backgroundColor: 'transparent' },
            { tag: '//', color: '#474747', strikethrough: true, underline: false, bold: false, italic: false, backgroundColor: 'transparent' },
            { tag: 'todo', color: '#FF8C00', strikethrough: false, underline: false, bold: false, italic: false, backgroundColor: 'transparent' },
            { tag: '*', color: '#98C379', strikethrough: false, underline: false, bold: false, italic: false, backgroundColor: 'transparent' },
        ];
    }

    /** 返回各 tag 的 escapedTag 数组，用于拼正则 */
    private getTagEscapedPattern(): string[] {
        return this.tags.map(t => t.escapedTag);
    }

    /** 按不区分大小写的标签名在 this.tags 中查找 */
    private findTagByKey(tagKey: string): CommentTag | undefined {
        return this.tags.find(t => t.tag.toLowerCase() === tagKey);
    }

    /** 对字符串进行正则特殊字符转义 */
    private escapeRegExp(input: string): string {
        return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * 根据语言配置设置 delimiter、blockCommentStart/End 及单行/块高亮开关
     * @param singleLine 行注释起始符，null 表示仅块注释（如 HTML）
     * @param start 块注释起始
     * @param end 块注释结束
     */
    private setCommentFormat(
            singleLine: string | string[] | null,
            start: string | null = null,
            end: string | null = null): void {

        this.delimiter = "";
        this.blockCommentStart = "";
        this.blockCommentEnd = "";

        if (singleLine) {
            if (typeof singleLine === 'string') {
                this.delimiter = this.escapeRegExp(singleLine).replace(/\//ig, "\\/");
            }
            else if (singleLine.length > 0) {
                var delimiters = singleLine
                            .map(s => this.escapeRegExp(s))
                            .join("|");
                this.delimiter = delimiters;
            }
        }
        else {
            this.highlightSingleLineComments = false;
        }

        if (start && end) {
            this.blockCommentStart = this.escapeRegExp(start);
            this.blockCommentEnd = this.escapeRegExp(end);
            this.highlightMultilineComments = !!this.contributions.multilineComments;
        }
    }

    //#endregion 私有方法
}
