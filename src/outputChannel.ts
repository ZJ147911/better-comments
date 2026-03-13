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

let logChannel: vscode.LogOutputChannel | undefined;
let optionsMinLevel: LogLevel | undefined;

function getOutputConfig(): { minLevel: LogLevel; filterKeyword: string } {
    const cfg = vscode.workspace.getConfiguration('better-comments');
    const level = cfg.get<string>('output.minLevel', 'debug');
    const keyword = (cfg.get<string>('output.filterKeyword') ?? '').trim();
    return {
        minLevel: LEVEL_ORDER[level as LogLevel] !== undefined ? (level as LogLevel) : 'debug',
        filterKeyword: keyword,
    };
}

function write(level: LogLevel, message: string) {
    const { minLevel: cfgMin, filterKeyword: kw } = getOutputConfig();
    const effectiveMin = optionsMinLevel ?? cfgMin;
    if (LEVEL_ORDER[level] < LEVEL_ORDER[effectiveMin]) return;
    if (kw && !message.toLowerCase().includes(kw.toLowerCase())) return;
    logChannel?.[level](message);
}

/**
 * 创建并注册 Better Comments 日志通道（使用 VS Code LogOutputChannel，与内置 Git 等扩展一致的级别与颜色）。
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

/** 空实现，不输出任何内容 */
export const noopLogger: Logger = {
    debug() {},
    info() {},
    warn() {},
    error() {},
};
