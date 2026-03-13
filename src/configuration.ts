/**
 * 语言注释配置（类形式，与 extension/parser 配合）
 * @file configuration.ts
 * @description 从已安装扩展的 language-configuration.json 读取各语言注释格式，带缓存与回退
 */

import * as path from 'path';
import * as vscode from 'vscode';
import type { Logger } from './outputChannel';

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

/**
 * 语言注释配置管理：扫描扩展、加载并缓存各语言的 lineComment/blockComment
 */
export class Configuration {
    private readonly commentConfig = new Map<string, CommentConfig | undefined>();
    private readonly languageConfigFiles = new Map<string, string>();
    private readonly log: Logger;

    /**
     * 创建配置实例并立即扫描已安装扩展的语言定义
     * @param logger 可选，用于输出面板日志；未传则无输出
     */
    public constructor(logger?: Logger) {
        this.log = logger ?? { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
        this.UpdateLanguagesDefinitions();
    }

    /**
     * 根据已安装扩展生成各语言对应的 language-configuration 文件路径映射
     * @remarks 会清空 commentConfig 缓存；外部扩展可覆盖 VS Code 默认语言配置
     */
    public UpdateLanguagesDefinitions(): void {
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
        this.log.info(`已加载 ${this.languageConfigFiles.size} 个语言的注释配置`);
    }

    /** 无独立 language 配置时回退的语言 ID（如 vue -> javascript） */
    private static readonly COMMENT_CONFIG_FALLBACKS: Readonly<Record<string, string>> = {
        vue: 'javascript',
        'vue-html': 'javascript',
        svelte: 'javascript',
    };

    /**
     * 获取指定语言的注释配置（lineComment / blockComment）
     * @param languageCode 语言短标识
     * @returns 注释配置，未找到或解析失败为 undefined
     * @remarks Vue / Vue-HTML / Svelte 会回退为 JavaScript 注释语法
     */
    public async GetCommentConfiguration(languageCode: string): Promise<CommentConfig | undefined> {
        if (this.commentConfig.has(languageCode)) {
            this.log.debug(`语言 "${languageCode}" 使用缓存配置`);
            return this.commentConfig.get(languageCode);
        }

        const resolvedId = Configuration.COMMENT_CONFIG_FALLBACKS[languageCode] ?? languageCode;
        if (resolvedId !== languageCode) {
            this.log.debug(`语言 "${languageCode}" 回退到 "${resolvedId}" 的注释配置`);
        }
        if (!this.languageConfigFiles.has(resolvedId)) {
            this.log.debug(`未找到 "${resolvedId}" 的配置，重新扫描扩展`);
            this.UpdateLanguagesDefinitions();
            if (!this.languageConfigFiles.has(resolvedId)) {
                this.log.warn(`未找到语言 "${languageCode}" 的注释配置，已跳过`);
                return undefined;
            }
        }

        try {
            const filePath = this.languageConfigFiles.get(resolvedId)!;
            const rawContent = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
            const content = decodeUtf8(rawContent);
            const config = parseJsonc(content) as { comments?: CommentConfig };

            const comments = config.comments;
            this.commentConfig.set(languageCode, comments);
            this.log.debug(`已从文件加载语言 "${languageCode}" 的注释配置`);
            return comments;
        } catch (e) {
            this.commentConfig.set(languageCode, undefined);
            this.log.error(`解析语言 "${languageCode}" 的配置文件失败: ${e instanceof Error ? e.message : String(e)}`);
            return undefined;
        }
    }
}