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

/** 格式: 2026-03-13 16:39:58.727 */
function timestamp(): string {
    const d = new Date();
    const y = d.getFullYear();
    const M = String(d.getMonth() + 1).padStart(2, '0');
    const D = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    const ms = String(d.getMilliseconds()).padStart(3, '0');
    return `${y}-${M}-${D} ${h}:${m}:${s}.${ms}`;
}

/** ANSI 颜色（输出面板支持时生效） */
const ANSI = {
    reset: '\x1b[0m',
    dim: '\x1b[2m',
    gray: '\x1b[90m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
} as const;

const LEVEL_COLORS: Record<LogLevel, string> = {
    debug: ANSI.cyan,
    info: ANSI.green,
    warn: ANSI.yellow,
    error: ANSI.red,
};

function write(level: LogLevel, message: string) {
    const { minLevel: cfgMin, filterKeyword: kw } = getOutputConfig();
    const effectiveMin = optionsMinLevel ?? cfgMin;
    if (LEVEL_ORDER[level] < LEVEL_ORDER[effectiveMin]) return;
    if (kw && !message.toLowerCase().includes(kw.toLowerCase())) return;
    const ts = `${ANSI.gray}${timestamp()}${ANSI.reset}`;
    const levelTag = `${LEVEL_COLORS[level]}[${level}]${ANSI.reset}`;
    channel?.appendLine(`${ts} ${levelTag} ${message}`);
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
    optionsMinLevel = options?.minLevel;
    return {
        debug(msg) { write('debug', msg); },
        info(msg) { write('info', msg); },
        warn(msg) { write('warn', msg); },
        error(msg) { write('error', msg); },
        appendLine(text: string) {
            channel?.appendLine(text);
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
