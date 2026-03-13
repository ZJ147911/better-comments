/**
 * 标签定义构建
 * @file tags.ts
 * @description 从 better-comments.tags 配置构建 TagDef 列表（含转义与 decoration），无类，纯函数
 */

import * as vscode from "vscode";

/** 内置默认标签项（与 package.json 默认一致），导出形态为 TagItemSingle */
const DEFAULT_TAG_ITEMS: TagItemSingle[] = [
  { tag: "!", color: "#FF2D00", strikethrough: false, underline: false, bold: false, italic: false, backgroundColor: "transparent" },
  { tag: "?", color: "#3498DB", strikethrough: false, underline: false, bold: false, italic: false, backgroundColor: "transparent" },
  { tag: "//", color: "#474747", strikethrough: true, underline: false, bold: false, italic: false, backgroundColor: "transparent" },
  { tag: "todo", color: "#FF8C00", strikethrough: false, underline: false, bold: false, italic: false, backgroundColor: "transparent" },
  { tag: "*", color: "#98C379", strikethrough: false, underline: false, bold: false, italic: false, backgroundColor: "transparent" },
];

/** 正则特殊字符，用于转义标签以安全嵌入正则 */
const REGEX_SPECIAL = /([()[{*+.$^\\|?/])/g;

/**
 * 将 tag 规范为字符串数组（支持 string | string[]）
 */
function normalizeTagNames(tag: string | string[] | undefined): string[] {
  if (typeof tag === "string") return tag ? [tag] : [];
  if (Array.isArray(tag)) return tag.filter((t): t is string => typeof t === "string" && t.length > 0);
  return [];
}

/**
 * 将 TagItem[] 展开为 tag 均为单字符串的 TagItemSingle[]（配置中 tag 为数组时拆成多条，样式一致）
 */
function expandToSingleTagItems(items: TagItem[]): TagItemSingle[] {
  const result: TagItemSingle[] = [];
  for (const item of items) {
    const names = normalizeTagNames(item.tag);
    if (names.length === 0) continue;
    const base: Omit<TagItemSingle, "tag"> = {
      color: item.color,
      backgroundColor: item.backgroundColor,
      strikethrough: item.strikethrough,
      underline: item.underline,
      bold: item.bold,
      italic: item.italic,
    };
    for (const tag of names) {
      result.push({ ...base, tag });
    }
  }
  return result;
}

/** 从样式字段生成唯一 key，用于同一样式复用同一 decoration */
function styleKey(item: TagItemSingle): string {
  return JSON.stringify({
    color: item.color ?? "transparent",
    backgroundColor: item.backgroundColor ?? "transparent",
    strikethrough: !!item.strikethrough,
    underline: !!item.underline,
    bold: !!item.bold,
    italic: !!item.italic,
  });
}

/** 根据样式选项创建 DecorationRenderOptions */
function decorationOptionsFromItem(item: TagItemSingle): vscode.DecorationRenderOptions {
  const color = typeof item.color === "string" ? item.color : "transparent";
  const backgroundColor = typeof item.backgroundColor === "string" ? item.backgroundColor : "transparent";
  const parts: string[] = [];
  if (item.strikethrough) parts.push("line-through");
  if (item.underline) parts.push("underline");
  return {
    color,
    backgroundColor,
    textDecoration: parts.length ? parts.join(" ") : undefined,
    ...(item.bold && { fontWeight: "bold" }),
    ...(item.italic && { fontStyle: "italic" }),
  };
}

/**
 * 从当前工作区配置读取 better-comments.tags，无效或空时返回默认标签项
 * @returns 导出配置为 TagItemSingle[]（tag 均为单字符串）及是否来自默认配置
 * @remarks 不写日志，仅做读取与兜底
 */
export function getTagItems(): { items: TagItemSingle[]; fromDefault: boolean } {
  const cfg = vscode.workspace.getConfiguration("better-comments");
  const raw = cfg.get<TagItem[]>("tags");
  if (Array.isArray(raw) && raw.length > 0) {
    return { items: expandToSingleTagItems(raw), fromDefault: false };
  }
  return { items: DEFAULT_TAG_ITEMS, fromDefault: true };
}

/** 将 TagItemSingle[] 填入 tagDefMap，同一样式复用同一 decoration */
function fillTagDefMap(
  items: TagItemSingle[],
  tagDefMap: Map<string, TagDef>,
  decorationByStyle: Map<string, vscode.TextEditorDecorationType>,
): void {
  for (const item of items) {
    const key = styleKey(item);
    let decoration = decorationByStyle.get(key);
    if (!decoration) {
      decoration = vscode.window.createTextEditorDecorationType(decorationOptionsFromItem(item));
      decorationByStyle.set(key, decoration);
    }
    tagDefMap.set(item.tag, {
      tag: item.tag,
      escapedTag: item.tag.replace(REGEX_SPECIAL, "\\$1"),
      decoration,
    });
  }
}

/**
 * 根据 TagItemSingle[] 构建 TagDef 列表（同一样式复用同一 decoration）
 * 同一 tag 名在配置中出现多次时，后边的规则覆盖前边的规则
 */
function buildTagDefs(items: TagItemSingle[], log?: Logger): TagDef[] {
  const tagDefMap = new Map<string, TagDef>();
  const decorationByStyle = new Map<string, vscode.TextEditorDecorationType>();
  fillTagDefMap(items, tagDefMap, decorationByStyle);
  if (tagDefMap.size === 0) {
    log?.warn("未得到有效标签，已使用内置默认标签");
    fillTagDefMap(DEFAULT_TAG_ITEMS, tagDefMap, decorationByStyle);
  }
  return Array.from(tagDefMap.values());
}

/**
 * 一次性获取当前配置下的 TagDef 列表（便捷方法）
 * @param log 可选日志；若配置为空使用了默认标签会打一条 warn
 * @returns 当前 better-comments.tags 对应的 TagDef 数组
 */
export function getTagDefs(log?: Logger): TagDef[] {
  const { items, fromDefault } = getTagItems();
  const defs = buildTagDefs(items, log);
  if (fromDefault && defs.length > 0) log?.warn("未读取到 better-comments.tags 配置，已使用内置默认标签");
  return defs;
}
