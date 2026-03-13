import * as vscode from 'vscode';
import { Configuration } from './configuration';

export class Parser {
    private tags: CommentTag[] = [];
    private expression: string = "";

    private delimiter: string = "";
    private blockCommentStart: string = "";
    private blockCommentEnd: string = "";

    private highlightSingleLineComments = true;
    private highlightMultilineComments = false;
    private highlightJSDoc = false;

    /** 开启后允许纯文本文件也显示注释高亮 */
    private isPlainText = false;

    /** 用于避免文件首行（如 Python 的 shebang）被当作注释着色 */
    private ignoreFirstLine = false;

    /** 当检测到支持的语言时用于触发高亮逻辑 */
    public supportedLanguage = true;

    /** 从 package.json 读取的配置 */
    private contributions: Contributions = vscode.workspace.getConfiguration('better-comments') as any;

    /** 用于在启动时解析各语言注释配置 */
    private configuration: Configuration;

    /**
     * 创建 Parser 实例
     * @param config 语言注释配置
     */
    public constructor(config: Configuration) {

        this.configuration = config;

        this.setTags();
    }

    /**
     * 根据 package.json 中的配置设置用于匹配注释的正则
     * @param languageCode 当前语言的短标识，参见 https://code.visualstudio.com/docs/languages/identifiers
     */
    public async SetRegex(languageCode: string) {
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
    }

    /**
     * 查找所有按给定分隔符划分且匹配 package.json 中标签的单行注释
     * @param activeEditor 当前代码文档所在的编辑器
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
     * 按起始与结束分隔符查找块注释
     * @param activeEditor 当前代码文档所在的编辑器
     */
    public FindBlockComments(activeEditor: vscode.TextEditor): void {

        if (!this.highlightMultilineComments) return;
        
        let text = activeEditor.document.getText();

        const characters = this.getTagEscapedPattern();
        const commentMatchString = "(^)+([ \\t]*[ \\t]*)(" + characters.join("|") + ")([ ]*|[:])+([^*/][^\\r\\n]*)";

        let regexString = "(^|[ \\t])(";
        regexString += this.blockCommentStart;
        regexString += "[\\s])+([\\s\\S]*?)(";
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
     * 查找所有以 "*" 开头的多行 JSDoc 注释
     * @param activeEditor 当前代码文档所在的编辑器
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
     * 在找到所有相关注释后应用装饰
     * @param activeEditor 当前代码文档所在的编辑器
     */
    public ApplyDecorations(activeEditor: vscode.TextEditor): void {
        for (let tag of this.tags) {
            activeEditor.setDecorations(tag.decoration, tag.ranges);
            tag.ranges.length = 0;
        }
    }

    //#region 私有方法

    /**
     * 设置指定语言的注释分隔符 [//, #, --, ']
     * @param languageCode 当前语言的短标识，参见 https://code.visualstudio.com/docs/languages/identifiers
     */
    private async setDelimiter(languageCode: string): Promise<void> {
        this.supportedLanguage = false;
        this.ignoreFirstLine = false;
        this.isPlainText = false;

        const config = await this.configuration.GetCommentConfiguration(languageCode);
        if (config) {
            let blockCommentStart = config.blockComment ? config.blockComment[0] : null;
            let blockCommentEnd = config.blockComment ? config.blockComment[1] : null;

            this.setCommentFormat(config.lineComment || blockCommentStart, blockCommentStart, blockCommentEnd);

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
                this.supportedLanguage = this.contributions.highlightPlainText;
                break;
        }
    }

    /**
     * 初始化高亮标签供解析器使用
     */
    private setTags(): void {
        let items = this.contributions.tags;
        for (let item of items) {
            let options: vscode.DecorationRenderOptions = { color: item.color, backgroundColor: item.backgroundColor };
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

            let escapedSequence = item.tag.replace(/([()[{*+.$^\\|?])/g, '\\$1');
            this.tags.push({
                tag: item.tag,
                escapedTag: escapedSequence.replace(/\//gi, "\\/"),
                ranges: [],
                decoration: vscode.window.createTextEditorDecorationType(options)
            });
        }
    }

    /** 返回用于正则的转义标签模式（单行/块注释/JSDoc 匹配） */
    private getTagEscapedPattern(): string[] {
        return this.tags.map(t => t.escapedTag);
    }

    /** 按不区分大小写的标签名查找标签 */
    private findTagByKey(tagKey: string): CommentTag | undefined {
        return this.tags.find(t => t.tag.toLowerCase() === tagKey);
    }

    /**
     * 对字符串进行转义以便在正则中使用
     * @param input 待转义字符串
     * @returns 转义后的字符串
     */
    private escapeRegExp(input: string): string {
        return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * 设置单行与多行注释的高亮格式
     * @param singleLine 单行注释分隔符，为 null 表示不支持单行注释
     * @param start 块注释起始分隔符
     * @param end 块注释结束分隔符
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

            this.highlightMultilineComments = this.contributions.multilineComments;
        }
    }

    //#endregion 私有方法
}
