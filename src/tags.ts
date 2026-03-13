/**
 * 标签定义构建
 * @file tags.ts
 * @description 从 better-comments.tags 配置构建 TagDef 列表（含转义与 decoration），无类，纯函数
 */

import * as vscode from 'vscode';

/** 内置默认标签项（与 package.json 默认一致） */
const DEFAULT_TAG_ITEMS: TagItem[] = [
    { tag: '!', color: '#FF2D00', strikethrough: false, underline: false, bold: false, italic: false, backgroundColor: 'transparent' },
    { tag: '?', color: '#3498DB', strikethrough: false, underline: false, bold: false, italic: false, backgroundColor: 'transparent' },
    { tag: '//', color: '#474747', strikethrough: true, underline: false, bold: false, italic: false, backgroundColor: 'transparent' },
    { tag: 'todo', color: '#FF8C00', strikethrough: false, underline: false, bold: false, italic: false, backgroundColor: 'transparent' },
    { tag: '*', color: '#98C379', strikethrough: false, underline: false, bold: false, italic: false, backgroundColor: 'transparent' },
];

/**
 * 将单个 TagItem 转为 TagDef（含 escapedTag 与 decoration）
 * @param item 配置项中的单条标签
 * @returns 用于高亮匹配与装饰的 TagDef
 */
function itemToTagDef(item: TagItem): TagDef {
    const tag = typeof item.tag === 'string' ? item.tag : String(item?.tag ?? '');
    const color = typeof item.color === 'string' ? item.color : 'transparent';
    const backgroundColor = typeof item.backgroundColor === 'string' ? item.backgroundColor : 'transparent';
    const options: vscode.DecorationRenderOptions = { color, backgroundColor };
    options.textDecoration = '';
    if (item.strikethrough) options.textDecoration += 'line-through';
    if (item.underline) options.textDecoration += ' underline';
    if (item.bold) options.fontWeight = 'bold';
    if (item.italic) options.fontStyle = 'italic';

    const escaped = tag.replace(/([()[{*+.$^\\|?])/g, '\\$1');
    const escapedTag = escaped.replace(/\//gi, '\\/');

    return {
        tag,
        escapedTag,
        decoration: vscode.window.createTextEditorDecorationType(options),
    };
}

/**
 * 从当前工作区配置读取 better-comments.tags，无效或空时返回默认标签项
 * @returns 标签项数组及是否来自默认配置，供 buildTagDefs 使用
 * @remarks 不写日志，仅做读取与兜底
 */
export function getTagItems(): { items: TagItem[]; fromDefault: boolean } {
    const cfg = vscode.workspace.getConfiguration('better-comments');
    const raw = cfg.get<TagItem[]>('tags');
    if (Array.isArray(raw) && raw.length > 0) return { items: raw, fromDefault: false };
    return { items: DEFAULT_TAG_ITEMS, fromDefault: true };
}

/**
 * 根据标签项构建 TagDef 列表（含 VS Code 装饰类型）
 * @param items 标签项数组，通常来自 getTagItems().items
 * @param log 可选日志，用于无效项与默认兜底告警
 * @returns TagDef 数组；若 items 全无效则使用内置默认项构建
 * @remarks 会创建 decoration，调用方应在扩展停用时 dispose
 */
export function buildTagDefs(items: TagItem[], log?: Logger): TagDef[] {
    const result: TagDef[] = [];

    for (const item of items) {
        const tag = typeof item.tag === 'string' ? item.tag : String(item?.tag ?? '');
        if (!tag) {
            log?.warn('跳过无效的标签项：tag 为空或非字符串');
            continue;
        }
        result.push(itemToTagDef(item as TagItem));
    }

    if (result.length === 0) {
        log?.warn('未得到有效标签，已使用内置默认标签');
        for (const item of DEFAULT_TAG_ITEMS) {
            result.push(itemToTagDef(item));
        }
    }

    return result;
}

/**
 * 一次性获取当前配置下的 TagDef 列表（便捷方法）
 * @param log 可选日志；若配置为空使用了默认标签会打一条 warn
 * @returns 当前 better-comments.tags 对应的 TagDef 数组
 */
export function getTagDefs(log?: Logger): TagDef[] {
    const { items, fromDefault } = getTagItems();
    const defs = buildTagDefs(items, log);
    if (fromDefault && defs.length > 0) log?.warn('未读取到 better-comments.tags 配置，已使用内置默认标签');
    return defs;
}
