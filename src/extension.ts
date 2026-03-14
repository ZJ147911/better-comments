/**
 * Better Comments 扩展入口
 * @file extension.ts
 * @description 激活时创建输出通道、标签定义与高亮状态，订阅编辑器/文档/扩展变化，按语言更新注释高亮（无类，纯函数与模块）
 */

import * as vscode from 'vscode';

import { getCommentConfiguration, updateLanguageDefinitions } from './config';
import {
	buildHighlightState,
	collectHighlightRanges,
	applyDecorations,
	collectHighlightRangesInRegions,
} from './highlight';
import {
	isHybridLanguage,
	getHybridLanguageConfigs,
} from './hybridLanguages';
import { createOutputChannel } from './outputChannel';
import { getTagDefs } from './tags';

const DEBOUNCE_MS = 100;

function getHighlightOptions(): HighlightOptions {
	const cfg = vscode.workspace.getConfiguration('better-comments');
	return {
		multilineComments: !!cfg.get<boolean>('multilineComments'),
		highlightPlainText: !!cfg.get<boolean>('highlightPlainText'),
	};
}

/**
 * 扩展激活时调用：初始化输出通道、标签与语言配置，并注册各类事件订阅
 * @param context 扩展上下文，用于注册 subscriptions
 */
export async function activate(
	context: vscode.ExtensionContext,
): Promise<void> {
	const log = createOutputChannel(context);

	/** 当前激活的编辑器 */
	let activeEditor: vscode.TextEditor | undefined;
	/** 当前语言对应的高亮状态，切换编辑器时更新 */
	let currentState: HighlightState | null = null;
	/** 标签定义（含 decoration），激活时构建一次并注册 dispose */
	const tagDefs = getTagDefs(log);
	for (const t of tagDefs) {
		context.subscriptions.push(t.decoration);
	}

	let decorationTimeout: ReturnType<typeof setTimeout> | undefined;

	/** 处理混合语言文件的高亮 */
	async function handleHybridLanguage(
		editor: vscode.TextEditor,
	): Promise<boolean> {
		const languageId = editor.document.languageId;

		// 检查是否为混合语言文件
		if (isHybridLanguage(languageId)) {
			log.debug(`检测到混合语言：${languageId}，启用区域分析`);
			const hybridConfig = getHybridLanguageConfigs().get(languageId)!;

			if (hybridConfig.enabled) {
				const text = editor.document.getText();
				const regions = hybridConfig.extractRegions(
					text,
					hybridConfig.blockRegions,
				);
				log.debug(`提取到 ${regions.length} 个区域`);

				if (regions.length > 0) {
					const rangesByTag = await collectHighlightRangesInRegions(
						editor,
						regions,
						tagDefs,
						getHighlightOptions(),
						log,
					);
					// 合并所有区域的标签定义，确保所有可能的标签都能被应用
					const allTagDefs = new Map<string, TagDef>();
					tagDefs.forEach((tagDef) => allTagDefs.set(tagDef.tag, tagDef));
					// 为每个区域添加其语言特定的标签定义
					for (const region of regions) {
						const regionTagDefs = getTagDefs(log, region.languageId);
						regionTagDefs.forEach((tagDef) =>
							allTagDefs.set(tagDef.tag, tagDef),
						);
					}
					applyDecorations(
						editor,
						Array.from(allTagDefs.values()),
						rangesByTag,
						log,
					);
					return true;
				}
			}
		}

		return false;
	}

	/** 对当前激活编辑器按 currentState 收集区间并应用装饰 */
	async function updateDecorations(): Promise<void> {
		if (!activeEditor) return;

		// 尝试处理混合语言文件
		const handled = await handleHybridLanguage(activeEditor);
		if (handled) return;

		// 使用原有的单语言处理逻辑
		if (!currentState?.supported) return;
		const rangesByTag = collectHighlightRanges(activeEditor, currentState, log);
		applyDecorations(activeEditor, tagDefs, rangesByTag, log);
	}

	/** 防抖：在 DEBOUNCE_MS 后执行 updateDecorations */
	function triggerUpdateDecorations(): void {
		if (decorationTimeout) clearTimeout(decorationTimeout);
		decorationTimeout = setTimeout(async () => {
			decorationTimeout = undefined;
			await updateDecorations();
		}, DEBOUNCE_MS);
	}

	/** 切换或打开编辑器时，按文档语言构建高亮状态并触发一次高亮 */
	async function updateForEditor(
		editor: vscode.TextEditor | undefined,
	): Promise<void> {
		if (!editor) return;

		activeEditor = editor;

		// 尝试处理混合语言文件
		const handled = await handleHybridLanguage(editor);
		if (handled) return;

		// 使用原有的单语言处理逻辑
		const languageId = editor.document.languageId;
		const commentConfig = await getCommentConfiguration(languageId, log);
		currentState = buildHighlightState(
			commentConfig,
			languageId,
			tagDefs,
			getHighlightOptions(),
		);
		log.debug(
			`语言: ${languageId}，支持: ${currentState.supported ? '是' : '否'}`,
		);
		triggerUpdateDecorations();
	}

	log.info('Better Comments 已激活');

	if (vscode.window.activeTextEditor) {
		await updateForEditor(vscode.window.activeTextEditor);
	}

	context.subscriptions.push(
		vscode.extensions.onDidChange(() => {
			log.debug('扩展列表变化，重新加载语言配置');
			updateLanguageDefinitions(log);
			if (activeEditor) updateForEditor(activeEditor);
		}),
		vscode.window.onDidChangeActiveTextEditor((editor) =>
			updateForEditor(editor),
		),
		vscode.workspace.onDidOpenTextDocument((doc) => {
			if (vscode.window.activeTextEditor?.document === doc) {
				updateForEditor(vscode.window.activeTextEditor);
			}
		}),
		vscode.workspace.onDidChangeTextDocument((event) => {
			if (activeEditor && event.document === activeEditor.document) {
				triggerUpdateDecorations();
			}
		}),
	);
}

/** 扩展停用时调用（装饰已通过 context.subscriptions 自动释放） */
export function deactivate(): void {}
