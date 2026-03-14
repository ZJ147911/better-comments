/**
 * 输出面板日志通道
 * @file outputChannel.ts
 * @description 使用 VS Code LogOutputChannel 提供分级日志与筛选，供配置/解析器等注入使用
 */

import * as vscode from 'vscode';

const CHANNEL_NAME = 'Better Comments';

/** 级别对应的数值，用于比较最低级别 */
const LEVEL_ORDER: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
};

let logChannel: vscode.LogOutputChannel | undefined;
/** 配置缓存，避免频繁读取 */
let cachedConfig: { minLevel: LogLevel; filterKeyword: string } | null = null;

/** 从 VS Code 配置读取输出筛选（完整键名 better-comments.output.*） */
function getOutputConfig(): { minLevel: LogLevel; filterKeyword: string } {
	if (cachedConfig) {
		return cachedConfig;
	}
	const cfg = vscode.workspace.getConfiguration('better-comments');
	const level = cfg.get<string>('output.minLevel', 'debug');
	const keyword = (cfg.get<string>('output.filterKeyword') ?? '').trim();
	cachedConfig = {
		minLevel:
			LEVEL_ORDER[level as LogLevel] !== undefined
				? (level as LogLevel)
				: 'debug',
		filterKeyword: keyword,
	};
	return cachedConfig;
}

/** 按级别与关键词筛选后写入 OutputChannel */
function write(level: LogLevel, message: string): void {
	// 只保留关键词过滤
	const { filterKeyword: kw } = getOutputConfig();
	if (kw && !message.toLowerCase().includes(kw.toLowerCase())) {
		return;
	}

	// 为不同级别添加前缀，确保 debug 日志能够被打印
	const prefix = `[${level.toUpperCase()}]`;
	logChannel?.appendLine(`${prefix} ${message}`);
}

/**
 * 创建并注册 Better Comments 日志通道（LogOutputChannel，级别与颜色由编辑器渲染）
 * @param context 扩展上下文，用于将 channel 加入 subscriptions
 * @returns 带 debug/info/warn/error、appendLine 的日志对象
 */
export function createOutputChannel(
	context: vscode.ExtensionContext,
): {
	debug: (message: string) => void;
	info: (message: string) => void;
	warn: (message: string) => void;
	error: (message: string) => void;
	appendLine: (text: string) => void;
} {
	logChannel = vscode.window.createOutputChannel(CHANNEL_NAME, { log: true });
	context.subscriptions.push(logChannel);
	return {
		debug(msg) {
			write('debug', msg);
		},
		info(msg) {
			write('info', msg);
		},
		warn(msg) {
			write('warn', msg);
		},
		error(msg) {
			write('error', msg);
		},
		appendLine(text: string) {
			logChannel?.appendLine(text);
		},
	};
}