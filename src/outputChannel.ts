/**
 * 输出面板日志通道
 * @file outputChannel.ts
 * @description 使用 VS Code LogOutputChannel 提供分级日志与筛选，供配置/解析器等注入使用
 */

import * as vscode from 'vscode';

const CHANNEL_NAME = 'Better Comments';

/** 日志级别从低到高的有序列表，用于比较 minLevel */
const LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

let logChannel: vscode.LogOutputChannel | undefined;
/** 是否已在本次会话中显示过输出通道（首次写日志时自动展示） */
let channelShown = false;
/** 配置缓存，避免频繁读取 */
let cachedConfig: { minLevel: LogLevel; filterKeyword: string } | null = null;

function isLevelEnabled(level: LogLevel, minLevel: LogLevel): boolean {
	return LEVELS.indexOf(level) >= LEVELS.indexOf(minLevel);
}

/** 从 VS Code 配置读取输出筛选（完整键名 better-comments.output.*） */
function getOutputConfig(): { minLevel: LogLevel; filterKeyword: string } {
	if (cachedConfig) {
		return cachedConfig;
	}
	const cfg = vscode.workspace.getConfiguration('better-comments');
	const rawLevel = cfg.get<string>('output.minLevel', 'debug');
	const level = LEVELS.includes(rawLevel as LogLevel)
		? (rawLevel as LogLevel)
		: 'debug';
	const keyword = (cfg.get<string>('output.filterKeyword') ?? '')
		.trim()
		.toLowerCase();
	cachedConfig = {
		minLevel: level,
		filterKeyword: keyword,
	};
	return cachedConfig;
}

/** 按级别与关键词筛选后写入 OutputChannel，并应用 minLevel */
function write(level: LogLevel, message: string): void {
	if (!logChannel) return;

	const { minLevel, filterKeyword: kw } = getOutputConfig();
	// 级别过滤：低于配置的最低级别不输出
	if (!isLevelEnabled(level, minLevel)) return;
	if (kw) {
		const lower = message.toLowerCase();
		if (!lower.includes(kw)) return;
	}

	// 首次 error 时展示输出面板中的 Better Comments 通道，便于用户注意到错误
	if (level === 'error' && !channelShown) {
		channelShown = true;
		logChannel.show(true);
	}

	// 使用 LogOutputChannel 的按级方法，便于在「输出」与「Log (Extension Host)」中正确显示
	switch (level) {
		case 'debug':
			logChannel.debug(message);
			break;
		case 'info':
			logChannel.info(message);
			break;
		case 'warn':
			logChannel.warn(message);
			break;
		case 'error':
			logChannel.error(message);
			break;
		default:
			logChannel.info(message);
	}
}

/**
 * 创建并注册 Better Comments 日志通道（LogOutputChannel，级别与颜色由编辑器渲染）
 * @param context 扩展上下文，用于将 channel 加入 subscriptions
 * @returns 符合 Logger 接口的日志对象（含 appendLine）
 */
export function createOutputChannel(context: vscode.ExtensionContext): Logger {
	logChannel = vscode.window.createOutputChannel(CHANNEL_NAME, { log: true });
	context.subscriptions.push(logChannel);

	// 配置变更时清除缓存，使 minLevel / filterKeyword 立即生效
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration('better-comments.output')) {
				cachedConfig = null;
			}
		}),
	);

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
			if (logChannel) {
				logChannel.appendLine(text);
			}
		},
	};
}