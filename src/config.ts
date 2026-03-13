/**
 * 语言注释配置加载
 * @file config.ts
 * @description 从已安装扩展的 language-configuration.json 读取各语言的 lineComment/blockComment，带缓存与回退
 */

import * as path from 'path';
import * as vscode from 'vscode';

/** 将 Uint8Array 解码为 UTF-8 字符串；Node 用 Buffer，Web 用全局 TextDecoder，不依赖 util */
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

/** 已解析的语言注释配置缓存，key 为 languageId */
const commentConfigCache = new Map<string, CommentConfig | undefined>();
/** 各语言 ID 到其 language-configuration 文件路径的映射 */
let languageConfigFiles = new Map<string, string>();

/** 无独立 language 配置时回退的语言 ID（注释风格对齐到已知语言） */
const COMMENT_CONFIG_FALLBACKS: Readonly<Record<string, string>> = {
    vue: 'javascript',
    'vue-html': 'javascript',
    svelte: 'javascript',
};

// ---------------------------------------------------------------------------
// 常见开发语言：行注释、块注释（与 language-configuration 一致，用于正则构建）
// ---------------------------------------------------------------------------

/** 使用 JSDoc 风格块注释（/** ... *\/）高亮的语言 ID */
export const JSDOC_LANGUAGE_IDS: ReadonlySet<string> = new Set([
    'apex', 'javascript', 'javascriptreact', 'typescript', 'typescriptreact',
    'vue', 'vue-html', 'dart', 'svelte',
]);

/** 需忽略首行（如 shebang）的语言 ID，避免误高亮 */
export const IGNORE_FIRST_LINE_LANGUAGE_IDS: ReadonlySet<string> = new Set([
    'elixir', 'python', 'tcl', 'ruby', 'shellscript', 'perl', 'r',
]);

/** 内置注释配置：扩展未提供或加载失败时使用；覆盖常见语言的行注释、块注释 */
const BUILDIN_COMMENT_CONFIGS: Readonly<Record<string, CommentConfig>> = {
    // 仅块注释
    html: { blockComment: ['<!--', '-->'] },
    htm: { blockComment: ['<!--', '-->'] },
    xml: { blockComment: ['<!--', '-->'] },
    css: { blockComment: ['/*', '*/'] },

    // C 风格：// + /* */
    c: { lineComment: '//', blockComment: ['/*', '*/'] },
    cpp: { lineComment: '//', blockComment: ['/*', '*/'] },
    csharp: { lineComment: '//', blockComment: ['/*', '*/'] },
    go: { lineComment: '//', blockComment: ['/*', '*/'] },
    java: { lineComment: '//', blockComment: ['/*', '*/'] },
    javascript: { lineComment: '//', blockComment: ['/*', '*/'] },
    typescript: { lineComment: '//', blockComment: ['/*', '*/'] },
    javascriptreact: { lineComment: '//', blockComment: ['/*', '*/'] },
    typescriptreact: { lineComment: '//', blockComment: ['/*', '*/'] },
    jsonc: { lineComment: '//', blockComment: ['/*', '*/'] },
    kotlin: { lineComment: '//', blockComment: ['/*', '*/'] },
    less: { lineComment: '//', blockComment: ['/*', '*/'] },
    scss: { lineComment: '//', blockComment: ['/*', '*/'] },
    rust: { lineComment: '//', blockComment: ['/*', '*/'] },
    swift: { lineComment: '//', blockComment: ['/*', '*/'] },
    dart: { lineComment: '//', blockComment: ['/*', '*/'] },
    scala: { lineComment: '//', blockComment: ['/*', '*/'] },

    // 多行注释符
    php: { lineComment: ['//', '#'], blockComment: ['/*', '*/'] },
    sql: { lineComment: '--', blockComment: ['/*', '*/'] },
    lua: { lineComment: '--', blockComment: ['--[[', ']]'] },

    // 仅行注释
    python: { lineComment: '#' },
    ruby: { lineComment: '#' },
    shellscript: { lineComment: '#' },
    perl: { lineComment: '#' },
    r: { lineComment: '#' },
    elixir: { lineComment: '#' },
    yaml: { lineComment: '#' },
    dockerfile: { lineComment: '#' },
    graphql: { lineComment: '#' },
    makefile: { lineComment: '#' },
    properties: { lineComment: ['#', '!'] },
    ini: { lineComment: [';', '#'] },
};

/**
 * 根据已安装扩展重新扫描各语言的配置文件路径
 * @param log 日志接口，用于输出加载数量
 * @remarks 会清空 commentConfigCache，扩展列表变化时调用
 */
export function updateLanguageDefinitions(log: Logger): void {
    commentConfigCache.clear();
    interface LangContribution { id: string; configuration?: string; }
    interface PkgContributes { languages?: LangContribution[]; }
    for (const extension of vscode.extensions.all) {
        const contributes = (extension.packageJSON as { contributes?: PkgContributes }).contributes;
        if (!contributes?.languages) continue;
        for (const language of contributes.languages) {
            if (language.configuration) {
                languageConfigFiles.set(
                    language.id,
                    path.join(extension.extensionPath, language.configuration)
                );
            }
        }
    }
    log.info(`已加载 ${languageConfigFiles.size} 个语言的注释配置`);
}

/**
 * 获取指定语言的注释配置（lineComment / blockComment）
 * @param languageCode 当前语言的短标识，参见 https://code.visualstudio.com/docs/languages/identifiers
 * @param log 日志接口
 * @returns 注释配置，未找到或解析失败时为 undefined
 * @remarks 使用缓存；未找到时会先调用 updateLanguageDefinitions 再重试；Vue/Svelte 等会回退到 JavaScript 配置
 */
export async function getCommentConfiguration(
    languageCode: string,
    log: Logger
): Promise<CommentConfig | undefined> {
    if (commentConfigCache.has(languageCode)) {
        log.debug(`语言 "${languageCode}" 使用缓存配置`);
        return commentConfigCache.get(languageCode);
    }
    const resolvedId = COMMENT_CONFIG_FALLBACKS[languageCode] ?? languageCode;
    if (resolvedId !== languageCode) {
        log.debug(`语言 "${languageCode}" 回退到 "${resolvedId}" 的注释配置`);
    }
    if (!languageConfigFiles.has(resolvedId)) {
        log.debug(`未找到 "${resolvedId}" 的配置，重新扫描扩展`);
        updateLanguageDefinitions(log);
    }
    if (languageConfigFiles.has(resolvedId)) {
        try {
            const filePath = languageConfigFiles.get(resolvedId)!;
            const rawContent = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
            const content = decodeUtf8(rawContent);
            const config = parseJsonc(content) as { comments?: CommentConfig };
            let comments = config.comments;
            // HTML 等仅有块注释的语言：扩展配置缺少 blockComment 时用内置补全
            if (languageCode in BUILDIN_COMMENT_CONFIGS && !comments?.blockComment) {
                const builtin = BUILDIN_COMMENT_CONFIGS[languageCode];
                comments = { ...comments, blockComment: builtin.blockComment } as CommentConfig;
            }
            commentConfigCache.set(languageCode, comments);
            log.debug(`已从文件加载语言 "${languageCode}" 的注释配置`);
            return comments;
        } catch (e) {
            commentConfigCache.set(languageCode, undefined);
            log.error(`解析语言 "${languageCode}" 的配置文件失败: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
    const builtin = BUILDIN_COMMENT_CONFIGS[languageCode] ?? BUILDIN_COMMENT_CONFIGS[resolvedId];
    if (builtin) {
        commentConfigCache.set(languageCode, builtin);
        log.debug(`语言 "${languageCode}" 使用内置注释配置`);
        return builtin;
    }
    log.warn(`未找到语言 "${languageCode}" 的注释配置，已跳过`);
    return undefined;
}
