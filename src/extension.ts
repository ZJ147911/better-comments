import * as vscode from 'vscode';
import { Configuration } from './configuration';
import { Parser } from './parser';

const DEBOUNCE_MS = 100;

export async function activate(context: vscode.ExtensionContext) {
    let activeEditor: vscode.TextEditor | undefined;
    const configuration = new Configuration();
    const parser = new Parser(configuration);
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
        await parser.SetRegex(editor.document.languageId);
        triggerUpdateDecorations();
    }

    if (vscode.window.activeTextEditor) {
        await updateForEditor(vscode.window.activeTextEditor);
    }

    context.subscriptions.push(
        vscode.extensions.onDidChange(() => configuration.UpdateLanguagesDefinitions()),
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