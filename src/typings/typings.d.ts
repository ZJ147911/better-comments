/**
 * 全局类型补充（供测试或遗留代码使用，主要类型已迁至 src/types.d.ts）
 */
interface CommentTag {
	tag: string;
	escapedTag: string;
	decoration: unknown;
	ranges: Array<unknown>;
}

interface Contributions {
	multilineComments?: boolean;
	useJSDocStyle?: boolean;
	highlightPlainText?: boolean;
	tags?: Array<{
		tag: string;
		color?: string;
		strikethrough?: boolean;
		underline?: boolean;
		bold?: boolean;
		italic?: boolean;
		backgroundColor?: string;
	}>;
}
