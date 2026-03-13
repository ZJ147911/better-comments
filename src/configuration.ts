import * as path from 'path';
import * as vscode from 'vscode';

import * as json5 from 'json5';
import { TextDecoder } from 'util';

export class Configuration {
    private readonly commentConfig = new Map<string, CommentConfig | undefined>();
    private readonly languageConfigFiles = new Map<string, string>();

    /**
     * Creates a new instance of the Parser class
     */
    public constructor() {
        this.UpdateLanguagesDefinitions();
    }

    /**
     * Generate a map of configuration files by language as defined by extensions
     * External extensions can override default configurations os VSCode
     */
    public UpdateLanguagesDefinitions() {
        this.commentConfig.clear();

        for (const extension of vscode.extensions.all) {
            const { contributes } = extension.packageJSON as { contributes?: { languages?: Array<{ id: string; configuration?: string }> } };
            if (!contributes?.languages) continue;
            for (const language of contributes.languages) {
                if (language.configuration) {
                    this.languageConfigFiles.set(
                        language.id,
                        path.join(extension.extensionPath, language.configuration)
                    );
                }
            }
        }
    }

    /** Language IDs that fall back to JavaScript comment config (e.g. Vue SFC). */
    private static readonly COMMENT_CONFIG_FALLBACKS: Readonly<Record<string, string>> = {
        vue: 'javascript',
        'vue-html': 'javascript',
    };

    /**
     * Gets the configuration information for the specified language.
     * Vue / Vue-HTML fall back to JavaScript comment syntax for script blocks.
     */
    public async GetCommentConfiguration(languageCode: string): Promise<CommentConfig | undefined> {
        if (this.commentConfig.has(languageCode)) {
            return this.commentConfig.get(languageCode);
        }

        const resolvedId = Configuration.COMMENT_CONFIG_FALLBACKS[languageCode] ?? languageCode;
        if (!this.languageConfigFiles.has(resolvedId)) {
            return undefined;
        }

        try {
            const filePath = this.languageConfigFiles.get(resolvedId)!;
            const rawContent = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
            const content = new TextDecoder().decode(rawContent);
            const config = json5.parse(content) as { comments?: CommentConfig };

            const comments = config.comments;
            this.commentConfig.set(languageCode, comments);
            return comments;
        } catch {
            this.commentConfig.set(languageCode, undefined);
            return undefined;
        }
    }
}