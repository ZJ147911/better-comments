import * as vscode from 'vscode';

const CHANNEL_NAME = 'Better Comments';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** 可选日志接口，供 Configuration / Parser 等注入，未注入时无输出 */
export interface Logger {
    debug(message: string): void;
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

let channel: vscode.OutputChannel | undefined;
let minLevel: LogLevel = 'debug';

function timestamp(): string {
    return new Date().toLocaleTimeString('zh-CN', { hour12: false });
}

function write(level: LogLevel, message: string) {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;
    const prefix = `[${timestamp()}] [${level.toUpperCase()}]`;
    channel?.appendLine(`${prefix} ${message}`);
}

/**
 * 创建并注册 Better Comments 输出通道，扩展停用时自动释放。
 * @param context 扩展上下文，用于注册 subscription
 * @param options.minLevel 最低输出级别，低于此级别不输出，默认 'debug'
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
    channel = vscode.window.createOutputChannel(CHANNEL_NAME);
    context.subscriptions.push(channel);
    if (options?.minLevel) minLevel = options.minLevel;
    return {
        debug(msg) { write('debug', msg); },
        info(msg) { write('info', msg); },
        warn(msg) { write('warn', msg); },
        error(msg) { write('error', msg); },
        appendLine(text: string) {
            channel?.appendLine(text);
        },
        setMinLevel(level: LogLevel) {
            minLevel = level;
        },
    };
}

/** 空实现，不输出任何内容 */
export const noopLogger: Logger = {
    debug() {},
    info() {},
    warn() {},
    error() {},
};
