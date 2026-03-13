import * as path from 'path';
import * as vscode from 'vscode';

import * as json5 from 'json5';
import { TextDecoder } from 'util';

export class Configuration {
    private readonly commentConfig = new Map<string, CommentConfig | undefined>();
    private readonly languageConfigFiles = new Map<string, string>();

    /**
     * 创建配置实例并加载各语言定义
     */
    public constructor() {
        this.UpdateLanguagesDefinitions();
    }

    /**
     * 根据已安装扩展生成各语言对应的配置文件路径映射
     * 外部扩展可覆盖 VSCode 默认的语言配置
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

    /** 回退到 JavaScript 注释配置的语言 ID（如 Vue 单文件组件） */
    private static readonly COMMENT_CONFIG_FALLBACKS: Readonly<Record<string, string>> = {
        vue: 'javascript',
        'vue-html': 'javascript',
    };

    /**
     * 获取指定语言的注释配置
     * Vue / Vue-HTML 会回退为 JavaScript 注释语法（用于 script 块）
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