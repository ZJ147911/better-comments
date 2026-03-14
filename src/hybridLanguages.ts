/**
 * 混合语言文件支持（如 Vue、Svelte、JSX 等）
 * @file hybridLanguages.ts
 * @description 从包含多种语言片段的文件中提取各区域的语言信息（配置化通用实现）
 */

/**
 * 通用的块级区域提取函数
 * @param text 文档完整文本
 * @param blockDefs 块区域定义列表
 * @returns 区域列表，按在文档中的位置排序
 */
export function extractBlockRegions(
	text: string,
	blockDefs: BlockRegionDef[],
): DocumentRegion[] {
	const regions: DocumentRegion[] = [];
	const tagNames = blockDefs.map((def) => def.tagName).join('|');
	
	// 构建正则表达式
	const pattern = `<(${tagNames})([^>]*)>([\\s\\S]*?)<\\/\\1>|<(${tagNames})([^>]*)\\s*\\/>`;
	const blockRegex = new RegExp(pattern, 'gi');

	let match: RegExpExecArray | null;
	while ((match = blockRegex.exec(text)) !== null) {
		const tagName = (match[1] || match[4]).toLowerCase();
		const attrs = match[2] || match[5] || '';
		const tagStart = match.index;

		// 跳过自闭合标签
		if (attrs.trimEnd().endsWith('/')) continue;

		const openTagEnd = text.indexOf('>', tagStart) + 1;
		
		// 从开标签结束位置向后查找闭合标签（避免 lastIndexOf 的陷阱）
		const closeTagStart = text.indexOf(`</${tagName}`, openTagEnd);
		
		if (closeTagStart === -1) continue;

		const blockDef = blockDefs.find((def) => def.tagName === tagName);
		if (!blockDef) continue;

		// 根据 lang 属性确定语言 ID
		let languageId = blockDef.defaultLanguageId;
		if (blockDef.langAttributeMap) {
			for (const [langValue, langId] of Object.entries(
				blockDef.langAttributeMap,
			)) {
				if (new RegExp(`lang=["']${langValue}["']`).test(attrs)) {
					languageId = langId;
					break;
				}
			}
		}

		regions.push({
			startOffset: openTagEnd,
			endOffset: closeTagStart,
			languageId,
		});
	}

	return regions.sort((a, b) => a.startOffset - b.startOffset);
}

/** Vue 文件的块区域定义 */
const vueBlockRegions: BlockRegionDef[] = [
	{ tagName: 'template', defaultLanguageId: 'vue-html' },
	{
		tagName: 'script',
		defaultLanguageId: 'javascript',
		langAttributeMap: {
			ts: 'typescript',
			tsx: 'typescriptreact',
			jsx: 'javascriptreact',
		},
	},
	{
		tagName: 'style',
		defaultLanguageId: 'css',
		langAttributeMap: {
			scss: 'scss',
			less: 'less',
			stylus: 'stylus',
		},
	},
];

export const vueHybridConfig = {
	mainLanguageId: 'vue',
	enabled: true,
	blockRegions: vueBlockRegions,
	extractRegions: extractBlockRegions,
};

/** Svelte 文件的块区域定义 */
const svelteBlockRegions: BlockRegionDef[] = [
	{
		tagName: 'script',
		defaultLanguageId: 'javascript',
		langAttributeMap: { ts: 'typescript' },
	},
	{
		tagName: 'style',
		defaultLanguageId: 'css',
		langAttributeMap: { scss: 'scss', less: 'less' },
	},
];

export const svelteHybridConfig = {
	mainLanguageId: 'svelte',
	enabled: true,
	blockRegions: svelteBlockRegions,
	extractRegions: extractBlockRegions,
};

/** Astro 文件的块区域定义 */
const astroBlockRegions: BlockRegionDef[] = [
	{
		tagName: 'script',
		defaultLanguageId: 'javascript',
		langAttributeMap: { ts: 'typescript' },
	},
	{
		tagName: 'style',
		defaultLanguageId: 'css',
		langAttributeMap: { scss: 'scss', less: 'less' },
	},
	{ tagName: 'markdown', defaultLanguageId: '``' },
];

export const astroHybridConfig = {
	mainLanguageId: 'astro',
	enabled: true,
	blockRegions: astroBlockRegions,
	extractRegions: extractBlockRegions,
};

/** 获取所有支持的混合语言配置 */
export function getHybridLanguageConfigs(): Map<string, HybridLanguageConfig> {
	const configs = new Map<string, HybridLanguageConfig>();
	configs.set('vue', vueHybridConfig);
	configs.set('svelte', svelteHybridConfig);
	configs.set('astro', astroHybridConfig);
	return configs;
}

/**
 * 检查某个语言是否为混合语言
 */
export function isHybridLanguage(languageId: string): boolean {
	return getHybridLanguageConfigs().has(languageId);
}

/**
 * 为指定语言获取混合语言配置
 */
export function getHybridConfigForLanguage(
	languageId: string,
): HybridLanguageConfig | undefined {
	return getHybridLanguageConfigs().get(languageId);
}
