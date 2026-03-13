import * as path from 'path';
import * as vscode from 'vscode';

/** 将 Uint8Array 解码为 UTF-8 字符串，不依赖 util 包（Node 用 Buffer，Web 用全局 TextDecoder） */
function decodeUtf8(bytes: Uint8Array): string {
    if (typeof Buffer !== 'undefined') {
        return Buffer.from(bytes).toString('utf-8');
    }
    return new (globalThis as { TextDecoder?: new () => { decode(b: Uint8Array): string } }).TextDecoder!().decode(bytes);
}

/** 解析带行注释与块注释的 JSON（JSONC），不依赖外部包 */
function parseJsonc(text: string): unknown {
    let inStr = false;
    let escape = false;
    let quote = '';
    let i = 0;
    const out: string[] = [];
    const len = text.length;
    while (i < len) {
        const c = text[i];
        if (escape) {
            out.push(c);
            escape = false;
            i++;
            continue;
        }
        if (inStr) {
            if (c === '\\') {
                escape = true;
                out.push(c);
                i++;
                continue;
            }
            if (c === quote) {
                inStr = false;
                out.push(c);
                i++;
                continue;
            }
            out.push(c);
            i++;
            continue;
        }
        if (c === '"' || c === "'") {
            inStr = true;
            quote = c;
            out.push(c);
            i++;
            continue;
        }
        if (c === '/' && i + 1 < len) {
            const next = text[i + 1];
            if (next === '/') {
                i += 2;
                while (i < len && text[i] !== '\n' && text[i] !== '\r') i++;
                if (i < len) out.push(text[i]);
                i++;
                continue;
            }
            if (next === '*') {
                i += 2;
                while (i + 1 < len && !(text[i] === '*' && text[i + 1] === '/')) i++;
                i += 2;
                continue;
            }
        }
        out.push(c);
        i++;
    }
    return JSON.parse(out.join(''));
}

export class Configuration {
    private readonly commentConfig = new Map<string, CommentConfig | undefined>();
    private readonly languageConfigFiles = new Map<string, string>();

    /**
     * 创建配置实例并加载各语言定义
     */
    public constructor() {
        this.UpdateLanguagesDefinitions();
    }

    /**
     * 根据已安装扩展生成各语言对应的配置文件路径映射
     * 外部扩展可覆盖 VSCode 默认的语言配置
     */
    public UpdateLanguagesDefinitions() {
        this.commentConfig.clear();

        interface LangContribution {
            id: string;
            configuration?: string;
        }
        interface PkgContributes {
            languages?: LangContribution[];
        }
        for (const extension of vscode.extensions.all) {
            const contributes = (extension.packageJSON as { contributes?: PkgContributes }).contributes;
            if (!contributes?.languages) continue;
            for (const language of contributes.languages) {
                if (language.configuration) {
                    this.languageConfigFiles.set(
                        language.id,
                        path.join(extension.extensionPath, language.configuration)
                    );
                }
            }
        }
    }

    /** 无独立 language 配置时回退的注释配置（按注释风格对齐到已知语言） */
    private static readonly COMMENT_CONFIG_FALLBACKS: Readonly<Record<string, string>> = {
        vue: 'javascript',
        'vue-html': 'javascript',
        svelte: 'javascript',
    };

    /**
     * 获取指定语言的注释配置
     * Vue / Vue-HTML 会回退为 JavaScript 注释语法（用于 script 块）
     */
    public async GetCommentConfiguration(languageCode: string): Promise<CommentConfig | undefined> {
        if (this.commentConfig.has(languageCode)) {
            return this.commentConfig.get(languageCode);
        }

        const resolvedId = Configuration.COMMENT_CONFIG_FALLBACKS[languageCode] ?? languageCode;
        if (!this.languageConfigFiles.has(resolvedId)) {
            return undefined;
        }

        try {
            const filePath = this.languageConfigFiles.get(resolvedId)!;
            const rawContent = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
            const content = decodeUtf8(rawContent);
            const config = parseJsonc(content) as { comments?: CommentConfig };

            const comments = config.comments;
            this.commentConfig.set(languageCode, comments);
            return comments;
        } catch {
            this.commentConfig.set(languageCode, undefined);
            return undefined;
        }
    }
}