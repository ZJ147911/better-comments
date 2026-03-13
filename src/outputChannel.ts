/**
 * 输出面板日志通道
 * @file outputChannel.ts
 * @description 使用 VS Code LogOutputChannel 提供分级日志与筛选，供配置/解析器等注入使用
 */

import * as vscode from 'vscode';

const CHANNEL_NAME = 'Better Comments';

/** 日志级别，用于过滤与输出 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * 可选日志接口：扩展内各模块可注入，未注入时使用 noopLogger 无输出
 */
export interface Logger {
    debug(message: string): void;
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
}

/** 级别对应的数值，用于比较最低级别 */
const LEVEL_ORDER: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

let logChannel: vscode.LogOutputChannel | undefined;
/** 创建通道时传入的最低级别，优先于配置项 */
let optionsMinLevel: LogLevel | undefined;

/** 从 VS Code 配置读取输出筛选（完整键名 better-comments.output.*） */
function getOutputConfig(): { minLevel: LogLevel; filterKeyword: string } {
    const cfg = vscode.workspace.getConfiguration('better-comments');
    const level = cfg.get<string>('output.minLevel', 'debug');
    const keyword = (cfg.get<string>('output.filterKeyword') ?? '').trim();
    return {
        minLevel: LEVEL_ORDER[level as LogLevel] !== undefined ? (level as LogLevel) : 'debug',
        filterKeyword: keyword,
    };
}

/** 按级别与关键词筛选后写入 LogOutputChannel */
function write(level: LogLevel, message: string): void {
    const { minLevel: cfgMin, filterKeyword: kw } = getOutputConfig();
    const effectiveMin = optionsMinLevel ?? cfgMin;
    if (LEVEL_ORDER[level] < LEVEL_ORDER[effectiveMin]) return;
    if (kw && !message.toLowerCase().includes(kw.toLowerCase())) return;
    logChannel?.[level](message);
}

/**
 * 创建并注册 Better Comments 日志通道（LogOutputChannel，级别与颜色由编辑器渲染）
 * @param context 扩展上下文，用于将 channel 加入 subscriptions
 * @param options.minLevel 可选，最低输出级别，未传则使用配置 better-comments.output.minLevel
 * @returns 带 debug/info/warn/error、appendLine、setMinLevel 的日志对象
 */
export function createOutputChannel(
    context: vscode.ExtensionContext,
    options?: { minLevel?: LogLevel }
): {
    debug: (message: string) => void;
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
    appendLine: (text: string) => void;
    setMinLevel: (level: LogLevel) => void;
} {
    logChannel = vscode.window.createOutputChannel(CHANNEL_NAME, { log: true });
    context.subscriptions.push(logChannel);
    optionsMinLevel = options?.minLevel;
    return {
        debug(msg) { write('debug', msg); },
        info(msg) { write('info', msg); },
        warn(msg) { write('warn', msg); },
        error(msg) { write('error', msg); },
        appendLine(text: string) {
            logChannel?.appendLine(text);
        },
        setMinLevel(level: LogLevel) {
            optionsMinLevel = level;
        },
    };
}

/** 空实现日志，注入后不输出任何内容 */
export const noopLogger: Logger = {
    debug() {},
    info() {},
    warn() {},
    error() {},
};
