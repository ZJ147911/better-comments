/**
 * Better Comments 扩展入口
 * @file extension.ts
 * @description 激活时创建输出通道、标签定义与高亮状态，订阅编辑器/文档/扩展变化，按语言更新注释高亮（无类，纯函数与模块）
 */

import * as vscode from 'vscode';

import { getCommentConfiguration, updateLanguageDefinitions, SKIP_HIGHLIGHT_LANGUAGE_IDS } from './config';
import {
	buildHighlightState,
	collectHighlightRanges,
	applyDecorations,
	collectHighlightRangesInRegions,
} from './highlight';
import {
	isHybridLanguage,
	getHybridConfigForLanguage,
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
			const hybridConfig = getHybridConfigForLanguage(languageId)!;

			if (hybridConfig.enabled) {
				const text = editor.document.getText();
				const regions = hybridConfig.extractRegions(
					text,
					hybridConfig.blockRegions,
				);
				log.debug(`[handleHybridLanguage] ✅ 提取到 ${regions.length} 个区域`);
				regions.forEach((region, index) => {
					log.debug(`[handleHybridLanguage]   区域 ${index + 1}: ${region.languageId} (${region.startOffset}-${region.endOffset})`);
				});

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
					log.debug(`[handleHybridLanguage] 应用装饰，共 ${Array.from(allTagDefs.values()).length} 个标签定义`);
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

		log.debug('[updateDecorations] 开始更新装饰');

		// 尝试处理混合语言文件
		const handled = await handleHybridLanguage(activeEditor);
		if (handled) {
			log.debug('[updateDecorations] ✅ 已处理混合语言文件');
			return;
		}

		// 使用原有的单语言处理逻辑
		if (!currentState?.supported) {
			log.debug('[updateDecorations] ⚠️ 当前语言不支持注释高亮');
			return;
		}

		log.debug(`[updateDecorations] 处理单语言文件：${activeEditor.document.languageId}`);
		const rangesByTag = collectHighlightRanges(activeEditor, currentState, log);
		applyDecorations(activeEditor, tagDefs, rangesByTag, log);
		log.debug('[updateDecorations] ✅ 装饰更新完成');
	}

	/** 防抖：在 DEBOUNCE_MS 后执行 updateDecorations */
	function triggerUpdateDecorations(): void {
		// 只在当前激活编辑器是文本编辑器且有焦点时才更新
		if (!activeEditor || !vscode.window.activeTextEditor) {
			return;
		}

		// 检查是否是同一个编辑器（确保焦点在当前编辑区）
		if (activeEditor !== vscode.window.activeTextEditor) {
			return;
		}

		// 检查编辑器是否可见（不在后台或被其他视图覆盖）
		const visibleEditors = vscode.window.visibleTextEditors;
		if (!visibleEditors.includes(activeEditor)) {
			return;
		}

		// 检查当前焦点是否在编辑器中（通过 selection 判断）
		// 如果焦点在终端、输入框等其他地方，selections 会是空的或者不变化
		const currentSelection = activeEditor.selection;
		if (currentSelection.isEmpty && activeEditor.document.getText().length === 0) {
			// 空文档且无选区，可能是焦点不在编辑器
			// 但为了兼容性，我们还是允许更新
		}

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

		// 忽略 txt、log 等非代码文件，不进行高亮匹配
		const languageId = editor.document.languageId;
		if (SKIP_HIGHLIGHT_LANGUAGE_IDS.has(languageId)) {
			log.debug(`[updateForEditor] 跳过非代码语言：${languageId}`);
			currentState = buildHighlightState(
				undefined,
				languageId,
				tagDefs,
				getHighlightOptions(),
			);
			triggerUpdateDecorations();
			return;
		}

		// 尝试处理混合语言文件
		const handled = await handleHybridLanguage(editor);
		if (handled) return;

		// 使用原有的单语言处理逻辑
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

	// 记录最后一次编辑器交互的时间
	let lastEditorInteraction = Date.now();
	// 标记当前焦点是否在编辑器中
	let isEditorFocused = false;

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
		vscode.window.onDidChangeActiveTextEditor((editor) => {
			// 当激活编辑器变化时，更新焦点状态
			isEditorFocused = !!editor;
			updateForEditor(editor);
		}),
		vscode.workspace.onDidOpenTextDocument((doc) => {
			if (vscode.window.activeTextEditor?.document === doc) {
				updateForEditor(vscode.window.activeTextEditor);
			}
		}),
		vscode.window.onDidChangeTextEditorSelection((event) => {
			// 记录用户在编辑器中的交互，并标记焦点在编辑器
			if (event.textEditor === activeEditor) {
				lastEditorInteraction = Date.now();
				isEditorFocused = true;
			}
		}),
		vscode.window.onDidChangeVisibleTextEditors((editors) => {
			// 当可见编辑器变化时，检查当前编辑器是否仍然可见
			isEditorFocused = activeEditor ? editors.includes(activeEditor) : false;
		}),
		vscode.window.onDidChangeTextEditorViewColumn((event) => {
			// 当编辑器视图列变化时（如拖拽移动），更新焦点状态
			if (event.textEditor === activeEditor) {
				const visibleEditors = vscode.window.visibleTextEditors;
				isEditorFocused = visibleEditors.includes(activeEditor);
			}
		}),
		vscode.workspace.onDidChangeTextDocument((event) => {
			if (!activeEditor || event.document !== activeEditor.document) {
				return;
			}

			// 严格检查：焦点必须在编辑器中
			if (!isEditorFocused) {
				return;
			}

			// 检查是否在最近 50ms 内有编辑器交互（缩短时间窗口）
			const now = Date.now();
			if (now - lastEditorInteraction > 50) {
				return;
			}

			triggerUpdateDecorations();
		}),
		vscode.workspace.onDidSaveTextDocument((doc) => {
			// 保存的文档是当前激活编辑器时，重新触发高亮
			if (activeEditor && activeEditor.document === doc) {
				triggerUpdateDecorations();
			}
		}),
	);
}

/** 扩展停用时调用（装饰已通过 context.subscriptions 自动释放） */
export function deactivate(): void {}
