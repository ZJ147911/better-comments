/**
 * Better Comments 扩展入口
 * @file extension.ts
 * @description 激活时创建配置与解析器，订阅编辑器/文档/扩展变化，按语言更新注释高亮装饰
 */

import * as vscode from 'vscode';
import { Configuration } from './configuration';
import { Parser } from './parser';
import { createOutputChannel } from './outputChannel';

/** 文档内容变化后延迟执行高亮更新的毫秒数，避免频繁重算 */
const DEBOUNCE_MS = 100;

/**
 * 扩展激活时调用：初始化输出通道、配置与解析器，并注册各类事件订阅
 * @param context 扩展上下文，用于注册 subscriptions
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const log = createOutputChannel(context);

    let activeEditor: vscode.TextEditor | undefined;
    const configuration = new Configuration(log);
    const parser = new Parser(configuration, log);
    let decorationTimeout: ReturnType<typeof setTimeout> | undefined;

    /** 对当前激活编辑器执行单行/块/JSDoc 查找并应用装饰 */
    function updateDecorations(): void {
        if (!activeEditor || !parser.supportedLanguage) return;
        parser.FindSingleLineComments(activeEditor);
        parser.FindBlockComments(activeEditor);
        parser.FindJSDocComments(activeEditor);
        parser.ApplyDecorations(activeEditor);
    }

    /** 防抖：在 DEBOUNCE_MS 后执行 updateDecorations */
    function triggerUpdateDecorations(): void {
        if (decorationTimeout) clearTimeout(decorationTimeout);
        decorationTimeout = setTimeout(() => {
            decorationTimeout = undefined;
            updateDecorations();
        }, DEBOUNCE_MS);
    }

    /** 切换或打开编辑器时，按文档语言设置解析器并触发高亮 */
    async function updateForEditor(editor: vscode.TextEditor | undefined): Promise<void> {
        if (!editor) return;
        activeEditor = editor;
        const languageId = editor.document.languageId;
        await parser.SetRegex(languageId);
        log.debug(`语言: ${languageId}，支持: ${parser.supportedLanguage ? '是' : '否'}`);
        triggerUpdateDecorations();
    }

    log.info('Better Comments 已激活');

    if (vscode.window.activeTextEditor) {
        await updateForEditor(vscode.window.activeTextEditor);
    }

    context.subscriptions.push(
        vscode.extensions.onDidChange(() => {
            log.debug('扩展列表变化，重新加载语言配置');
            configuration.UpdateLanguagesDefinitions();
            if (activeEditor) updateForEditor(activeEditor);
        }),
        vscode.window.onDidChangeActiveTextEditor(editor => updateForEditor(editor)),
        vscode.workspace.onDidOpenTextDocument(doc => {
            if (vscode.window.activeTextEditor?.document === doc) {
                updateForEditor(vscode.window.activeTextEditor);
            }
        }),
        vscode.workspace.onDidChangeTextDocument(event => {
            if (activeEditor && event.document === activeEditor.document) {
                triggerUpdateDecorations();
            }
        })
    );
}

/** 扩展停用时调用（当前无清理逻辑） */
export function deactivate(): void {}