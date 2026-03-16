# Better Comments 当前逻辑梳理

## 一、入口与激活（extension.ts）

- **activate()** 被调用时：
  1. 创建日志通道 `createOutputChannel(context)`。
  2. 用 **getTagDefs(log)** 从配置构建全局标签定义 `tagDefs`（含 VS Code decoration），并把这些 decoration 加入 `context.subscriptions` 以便停用时释放。
  3. 维护两个核心状态：
     - **activeEditor**：当前激活的文本编辑器。
     - **currentState**：当前语言的高亮状态（`HighlightState`，仅单语言路径使用）。
  4. 若有当前激活编辑器，先执行一次 **updateForEditor(activeEditor)**。
  5. 注册所有事件订阅（见下文「触发时机」）。

---

## 二、配置与标签（config / tags）

### 2.1 语言注释配置（config.ts）

- **getCommentConfiguration(languageCode, log)**：按语言 ID 取 `lineComment` / `blockComment`。
  - 优先从已安装扩展的 `language-configuration.json` 读（带缓存）。
  - Vue/Svelte 等通过 **COMMENT_CONFIG_FALLBACKS** 回退到 JavaScript。
  - 未找到或解析失败时使用 **BUILDIN_COMMENT_CONFIGS** 内置表（覆盖常见语言）。
- **JSDOC_LANGUAGE_IDS** / **IGNORE_FIRST_LINE_LANGUAGE_IDS**：由 highlight 使用，决定是否启用 JSDoc 高亮、是否忽略首行（如 shebang）。

### 2.2 标签定义（tags.ts）

- **getTagItems(languageId?)**：读 `better-comments.tags`（或语言维度的 `languageSpecificTags`），返回 **TagItemSingle[]**（tag 已展开为单字符串）。
- **getTagDefs(log, languageId?)**：在 getTagItems 基础上构建 **TagDef[]**（tag、escapedTag、decoration）。每个 tag 一个 decoration。
- 扩展激活时只调一次 **getTagDefs(log)** 得到全局 `tagDefs`；混合语言路径会再按区域语言调 **getTagDefs(log, region.languageId)** 取区域专用 tagDefs。

---

## 三、高亮的两条路径

### 3.1 单语言路径（当前文件只有一种语言）

1. **updateForEditor(editor)** 被调用时：
   - 先尝试 **handleHybridLanguage(editor)**；若返回 true 则结束（走混合路径）。
   - 否则：用 **getCommentConfiguration(languageId, log)** 取注释配置，再 **buildHighlightState(commentConfig, languageId, tagDefs, getHighlightOptions())** 得到 **currentState**。
   - 然后 **triggerUpdateDecorations()**。
2. **updateDecorations()** 被触发时：
   - 再次尝试 handleHybridLanguage；若处理了则 return。
   - 若 **!currentState?.supported** 则直接 return。
   - **collectHighlightRanges(editor, currentState, log)** 得到 **rangesByTag**。
   - **applyDecorations(editor, tagDefs, rangesByTag, log)** 把区间应用到编辑器的各 tag 的 decoration。

### 3.2 混合语言路径（Vue / Svelte 等单文件多语言）

1. **handleHybridLanguage(editor)**：
   - 用 **isHybridLanguage(languageId)** 判断是否为混合语言；若是，取 **getHybridConfigForLanguage(languageId)**。
   - 用 **extractRegions(text, blockRegions)** 从全文提取 **DocumentRegion[]**（每段有 startOffset、endOffset、languageId）。
   - 若 regions 非空：**collectHighlightRangesInRegions(editor, regions, tagDefs, getHighlightOptions(), log)** 得到合并后的 **rangesByTag**；再合并全局 tagDefs 与各区域的 **getTagDefs(log, region.languageId)**，**applyDecorations(editor, allTagDefs, rangesByTag, log)**。
2. 混合路径下不维护 **currentState**；每次 updateDecorations 时若走混合路径，都会重新提取区域并按区域语言收集区间。

---

## 四、触发时机（何时跑“收集 + 应用装饰”）

| 事件 | 行为 |
|------|------|
| **扩展激活** | 若有 activeTextEditor，执行 updateForEditor(activeEditor)。 |
| **onDidChangeActiveTextEditor** | 更新 isEditorFocused，执行 updateForEditor(editor)。 |
| **onDidOpenTextDocument** | 若打开的就是当前激活编辑器的文档，执行 updateForEditor(activeTextEditor)。 |
| **onDidChangeTextDocument** | 仅当文档是 activeEditor 的文档、且 isEditorFocused、且与上次编辑器交互间隔 ≤50ms 时，**triggerUpdateDecorations()**（防抖 100ms 后执行 updateDecorations）。 |
| **onDidSaveTextDocument** | 若保存的文档是 activeEditor 的文档，**triggerUpdateDecorations()**。 |
| **onDidChangeTextEditorSelection** | 若事件属于 activeEditor，更新 lastEditorInteraction 和 isEditorFocused。 |
| **onDidChangeVisibleTextEditors** | 根据 activeEditor 是否仍在可见列表中更新 isEditorFocused。 |
| **onDidChangeTextEditorViewColumn** | 若事件属于 activeEditor，按当前可见编辑器列表更新 isEditorFocused。 |
| **extensions.onDidChange** | 调用 updateLanguageDefinitions(log)；若有 activeEditor 则 updateForEditor(activeEditor)。 |

**triggerUpdateDecorations()** 会做严格校验：必须有 activeEditor、且 activeEditor 就是当前 activeTextEditor、且该编辑器在 visibleTextEditors 中，再设 100ms 防抖定时器，到期执行 **updateDecorations()**。

---

## 五、highlight 模块内部流程（单语言 / 单区域）

1. **resolveCommentFormat(commentConfig, languageCode, options)**  
   根据 CommentConfig 和语言 ID 得到 CommentFormat（delimiter、blockCommentStart/End、highlightSingleLine/Block/JSDoc、ignoreFirstLine、isPlainText 等）。

2. **buildHighlightState(...)**  
   调用 resolveCommentFormat，再根据 format 和 tagDefs 构建单行正则 **singleLineRegex**（可能为 null），返回 **HighlightState**（supported、format、tagDefs、singleLineRegex）。

3. **collectHighlightRanges(editor, state, log)**  
   内部调 **findAllRanges(editor, state, rangesByTag, log)**（无 region），返回 **RangesByTag**。

4. **findAllRanges(editor, state, rangesByTag, log, region?)**  
   - 若有 region，只处理文档中 region 范围内的文本；否则全文。
   - 按 format 开关依次：  
     - 单行注释：用 state.singleLineRegex 匹配，按 tag 写入 rangesByTag（支持 ignoreFirstLine）。  
     - 块注释：用语言的 blockCommentStart/End 拼正则，**processBlockContent** → **matchBlockContentLines** 按行匹配标签并写入 rangesByTag。  
     - JSDoc：仅当 format.highlightJSDoc && format.highlightBlock 时，用 JSDOC_BLOCK_REGEX + getJSDocLineTagRegex，同样 processBlockContent → matchBlockContentLines。
   - 标签匹配：长标签优先（sortTagDefsByLengthDesc）、纯单词标签加 `\b`、不区分大小写（findTagByKey 用 toLowerCase）。

5. **applyDecorations(editor, tagDefs, rangesByTag, log)**  
   对每个 tagDef，用 **editor.setDecorations(tagDef.decoration, rangesByTag.get(tagDef.tag) ?? [])**；未出现的 tag 传空数组以清除旧装饰。

---

## 六、混合语言（hybridLanguages + highlight 区域接口）

- **hybridLanguages.ts**：  
  - **extractBlockRegions(text, blockDefs)**：按块定义（如 Vue 的 template/script/style）用正则提取区域，返回 **DocumentRegion[]**（startOffset、endOffset、languageId）。  
  - **isHybridLanguage(languageId)** / **getHybridConfigForLanguage(languageId)**：判断并返回对应混合语言配置（含 extractRegions、blockRegions 等）。

- **highlight.ts**：  
  - **collectHighlightRangesForRegion(editor, region, tagDefs, options, log)**：对该 region 用 **getTagDefs(log, region.languageId)** 和 **getCommentConfiguration(region.languageId, log)** 建 state，再 **findAllRanges(..., region)**。  
  - **collectHighlightRangesInRegions(editor, regions, tagDefs, options, log)**：对每个 region 调 collectHighlightRangesForRegion，把各 region 的 rangesByTag 按 tag 合并成一个 RangesByTag 返回。

---

## 七、模块职责小结

| 模块 | 职责 |
|------|------|
| **extension.ts** | 激活时初始化 log、tagDefs、订阅事件；维护 activeEditor / currentState / 焦点与防抖；决定走单语言还是混合路径并调用 highlight 与 applyDecorations。 |
| **config.ts** | 语言注释配置的加载、缓存、回退与内置表；JSDoc/忽略首行语言集合；updateLanguageDefinitions。 |
| **tags.ts** | 从 better-comments.tags（及语言维度）读配置，展开为 TagItemSingle[]，构建 TagDef[]（含 decoration）。 |
| **highlight.ts** | 由 CommentConfig 得到 CommentFormat 与 HighlightState；单行/块/JSDoc 区间收集（findAllRanges、processBlockContent、matchBlockContentLines）；区域版 collectHighlightRangesForRegion/InRegions；applyDecorations。 |
| **hybridLanguages.ts** | 混合语言的区域提取（extractBlockRegions）、语言判断与配置（Vue/Svelte 等）。 |
| **outputChannel.ts** | 创建 LogOutputChannel，提供 debug/info/warn/error 等日志接口。 |
| **types.d.ts** | CommentConfig、CommentFormat、HighlightState、TagItem、TagItemSingle、TagDef、RangesByTag、DocumentRegion、Logger、HighlightOptions 等全局类型。 |

---

## 八、数据流简图

```
激活
  → getTagDefs(log) → tagDefs
  → updateForEditor(activeEditor)
       → handleHybridLanguage?
           是 → extractRegions → collectHighlightRangesInRegions → applyDecorations(allTagDefs)
           否 → getCommentConfiguration → buildHighlightState → currentState
                 → triggerUpdateDecorations()
                      → (防抖 100ms) → updateDecorations()
                           → handleHybridLanguage? 同上
                           → collectHighlightRanges(editor, currentState) → applyDecorations(tagDefs)
```

文档变更 / 保存 / 切换编辑器等事件最终都会落到 **updateForEditor** 或 **triggerUpdateDecorations**，再进入上述两条路径之一。
