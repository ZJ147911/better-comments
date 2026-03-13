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

    if (vscode.window.activeTextEditor) {
        activeEditor = vscode.window.activeTextEditor;
        await parser.SetRegex(activeEditor.document.languageId);
        triggerUpdateDecorations();
    }

    context.subscriptions.push(
        vscode.extensions.onDidChange(() => configuration.UpdateLanguagesDefinitions()),
        vscode.window.onDidChangeActiveTextEditor(async editor => {
            if (!editor) return;
            activeEditor = editor;
            await parser.SetRegex(editor.document.languageId);
            triggerUpdateDecorations();
        }),
        vscode.workspace.onDidChangeTextDocument(event => {
            if (activeEditor && event.document === activeEditor.document) {
                triggerUpdateDecorations();
            }
        })
    );
}

export function deactivate() { }