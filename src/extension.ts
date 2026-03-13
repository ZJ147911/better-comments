import * as vscode from 'vscode';
import { Configuration } from './configuration';
import { Parser } from './parser';
import { createOutputChannel } from './outputChannel';

const DEBOUNCE_MS = 100;

export async function activate(context: vscode.ExtensionContext) {
    const log = createOutputChannel(context);

    let activeEditor: vscode.TextEditor | undefined;
    const configuration = new Configuration(log);
    const parser = new Parser(configuration, log);
    let decorationTimeout: ReturnType<typeof setTimeout> | undefined;

    function updateDecorations() {
        if (!activeEditor || !parser.supportedLanguage) return;
        parser.FindSingleLineComments(activeEditor);
        parser.FindBlockComments(activeEditor);
        parser.FindJSDocComments(activeEditor);
        parser.ApplyDecorations(activeEditor);
    }

    function triggerUpdateDecorations() {
        if (decorationTimeout) clearTimeout(decorationTimeout);
        decorationTimeout = setTimeout(() => {
            decorationTimeout = undefined;
            updateDecorations();
        }, DEBOUNCE_MS);
    }

    /** 当前激活的编辑器变化或打开的文件即为当前文档时，更新高亮 */
    async function updateForEditor(editor: vscode.TextEditor | undefined) {
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

export function deactivate() { }