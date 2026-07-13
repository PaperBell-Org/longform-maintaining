import type { Messages } from "./index";

/** Simplified Chinese catalog. Must cover every key in `en` (enforced by `Messages`). */
export const zh: Messages = {
  // ── 命令(命令面板) ──────────────────────────────────────────────────
  "cmd.compileCurrent": "用当前工作流编译当前项目",
  "cmd.compileProject": "编译项目…",
  "cmd.setupPandoc": "设置 Pandoc 导出",
  "cmd.openCurrentProject": "打开当前笔记所属项目",
  "cmd.previousScene": "上一个场景",
  "cmd.previousSceneAtIndent": "同缩进层级的上一个场景",
  "cmd.nextScene": "下一个场景",
  "cmd.nextSceneAtIndent": "同缩进层级的下一个场景",
  "cmd.indentScene": "增加场景缩进",
  "cmd.unindentScene": "减少场景缩进",
  "cmd.jumpToProject": "跳转到项目",
  "cmd.jumpToScene": "在当前项目中跳转到场景",
  "cmd.openPane": "打开 PaperOut 面板",
  "cmd.revealProject": "在文件树中定位当前项目",
  "cmd.focusNewScene": "聚焦新建场景输入框",
  "cmd.insertMultiScene": "插入多场景 frontmatter",
  "cmd.insertSingleScene": "插入单场景 frontmatter",
  "cmd.startSession": "开始新的写作会话",
  "cmd.markManuscriptSpan": "标记手稿引用片段",
  "cmd.insertManuscriptRef": "插入手稿引用",
  "cmd.newPaperProject": "新建 PaperBell 论文项目…",
  "cmd.convertToProject": "转换为单一 Index 项目…",
  "cmd.openMarket": "浏览 Pandoc 资产市场",

  // ── 通知与菜单 ────────────────────────────────────────────────────────
  "notice.pdfExport":
    "PaperOut To-Authors:已支持 PDF 导出。在命令面板运行“设置 Pandoc 导出”以检查前置条件。",
  "notice.goalMet": "已达成写作目标!",
  "menu.createProject": "新建 PaperOut 项目",
  "menu.newPaperProject": "新建 PaperBell 论文项目…",

  // ── 新建论文脚手架 ────────────────────────────────────────────────────
  "scaffold.title": "新建 PaperBell 论文项目",
  "scaffold.desc":
    "一键搭好完整论文项目——正稿、补充材料(SI)、回复信三个草稿,连同起步内容、元数据、参考文献,以及示例图/表资源,统统放进以标题命名的新文件夹。",
  "scaffold.nameLabel": "项目标题",
  "scaffold.nameDesc": "作为项目文件夹名与 Longform 项目名。请勿包含 : \\ 和 / 。",
  "scaffold.acronymLabel": "缩写",
  "scaffold.acronymDesc":
    "用于 PDF 文件名和标签的短代码。默认取标题首字母,之后可在 metadata.json 中修改。",
  "scaffold.create": "创建项目",
  "scaffold.invalidName": "请输入不含 : \\ 或 / 的项目标题。",
  "scaffold.created": "已创建 PaperBell 项目“{title}”。",
  "scaffold.failed": "创建项目失败:{error}",

  // ── 批量编译看板 ──────────────────────────────────────────────────────
  "matrix.title": "批量编译",
  "matrix.drafts": "个草稿",
  "matrix.dryRun": "干跑",
  "matrix.openPdf": "打开 PDF",
  "matrix.harvest": "抓行号",
  "matrix.run": "运行",
  "matrix.running": "运行中…",
  "matrix.skipped": "已跳过",
  "matrix.viewError": "查看错误",
  "matrix.errorTitle": "错误详情",
  "matrix.copyError": "复制",
  "matrix.errorCopied": "错误已复制到剪贴板。",
  "matrix.finished": "已完成",
  "matrix.workflow": "编译工作流",
  "matrix.clickStepHint": "点击步骤圆点可查看或编辑该步骤。",
  "matrix.noOptions": "该步骤没有可配置项。",
  "matrix.reorderHint": "拖动行来设定编译顺序(从上到下)。",

  // ── Pandoc 资产市场 ──────────────────────────────────────────────────
  "market.title": "Pandoc 资产市场",
  "market.items": "项",
  "market.search": "搜索资产…",
  "market.reload": "重新加载",
  "market.desktopNote":
    "移动端可浏览与下载,但模板列表和 PDF 导出需要桌面端。",
  "market.loadError": "无法加载市场目录。",
  "market.empty": "没有匹配搜索的资产。",
  "market.bundles": "套件",
  "market.assets": "单个资产",
  "market.assetsIncluded": "个资产",
  "market.requires": "依赖",
  "market.systemDeps": "系统工具",
  "market.unverified": "未经审核 —— 其 Lua 会在你本机运行。",
  "market.back": "返回",
  "market.clickForDetails": "点击查看说明与用法",
  "market.readmeError": "无法加载该资产的说明文档。",
  "market.noReadme": "该资产暂无使用说明。",

  // ── 设置 Pandoc 导出 ──────────────────────────────────────────────────
  "setup.title": "设置 Pandoc 导出",
  "setup.intro":
    "PDF 导出需要三个系统工具,外加 PaperBell 的 Pandoc 工具链(过滤器、模板、CSL)。可在下方的资产市场安装工具链,或粘贴一个工具链 .zip 链接。",
  "setup.notFound": "未找到",
  "setup.pdfEngine": "PDF 引擎",
  "setup.assets": "Pandoc 资产",
  "setup.assetsOk": "已找到 defaults/ 与 csl/。",
  "setup.assetsMissing": "尚未下载。可从资产市场安装,或在下方填写资产 URL。",
  "setup.market.name": "资产市场",
  "setup.market.desc": "浏览并安装配方、过滤器、模板与 CSL 样式 —— 更省心的方式。",
  "setup.market.button": "浏览资产市场…",
  "setup.url.name": "资产 URL(高级)",
  "setup.url.desc":
    "指向工具链 .zip(release 资产)的链接。上面的资产市场更方便。",
  "setup.download.name": "下载 / 更新资产",
  "setup.download.desc":
    "把工具链下载并解压到 {folder}。你在那里的修改不会被插件更新覆盖。",
  "setup.download.button": "下载资产",
  "setup.recheck": "重新检查",
  "setup.copyReport": "复制报告",
  "setup.copied": "已复制!",
  "setup.done": "完成",
  "setup.downloading": "正在下载 Pandoc 资产…",
  "setup.downloaded": "已下载 {count} 个资产文件到 {dest}。",
  "setup.downloadFailed": "资产下载失败:{error}",
  "market.install": "安装",
  "market.update": "更新",
  "market.installed": "已安装",
  "market.reinstall": "重装",
  "market.uninstall": "卸载",
  "market.uninstalling": "正在卸载",
  "market.uninstalled": "已卸载",
  "market.confirmUninstall":
    "删除「{name}」?其文件会从资产目录中移除(之后可重新安装)。",
  "market.installing": "安装中…",
  "market.installedNotice": "已安装",
  "market.failed": "失败:",

  // ── 资源管理器面板 ────────────────────────────────────────────────────
  "explorer.paneTitle": "PaperOut To-Authors",
  "explorer.tab.scenes": "场景",
  "explorer.tab.project": "项目",
  "explorer.tab.compile": "编译",
  "explorer.migration.body1":
    "PaperOut To-Authors 已升级,需要迁移到新的数据格式。过期的索引文件会被删除,部分场景文件可能会移动位置。建议在迁移前先备份你的库。",
  "explorer.migration.body2Prefix": "你可以查看文档,了解此次迁移做了什么:",
  "explorer.migration.body2Link": "点此查看",
  "explorer.migration.button": "开始迁移",
  "explorer.syncWaiting": "正在等待 Obsidian Sync 完成同步…",

  "settings.renderError":
    "渲染设置时出错了。关闭并重新打开本标签页即可重试——详细信息见开发者控制台。",

  // ── 设置:语言 ────────────────────────────────────────────────────────
  "settings.language.heading": "语言",
  "settings.language.name": "显示语言",
  "settings.language.desc":
    "PaperOut To-Authors 界面使用的语言。“自动”会跟随 PaperBell(已连接时)或 Obsidian 的语言。",
  "settings.language.auto": "自动(跟随 PaperBell / Obsidian)",
  "settings.language.en": "English",
  "settings.language.zh": "中文",

  // ── 设置:写作 ────────────────────────────────────────────────────────
  "settings.composition.heading": "写作",
  "settings.sceneTemplate.name": "新场景模板",
  "settings.sceneTemplate.desc":
    "通过“新建场景…”输入框创建新场景时,会使用此文件作为模板。如果你使用模板插件(Templater 或核心模板插件),它会用于处理该模板。此设置对所有项目生效,可在 PaperOut 面板的“项目 > 项目元数据”里按项目单独覆盖。",
  "settings.numberScenes.name": "在“场景”标签页显示场景编号",
  "settings.numberScenes.desc":
    "开启后,带子场景的场景会用点号分隔显示编号,如 1.1.2。把场景拖到已有场景下方的缩进层级,或使用缩进命令,即可创建子场景。",
  "settings.writeProperty.name": "将场景索引写入 frontmatter",
  "settings.writeProperty.desc":
    "开启后,会把场景索引和场景编号写入场景文件的 frontmatter。",

  // ── 设置:编译 ────────────────────────────────────────────────────────
  "settings.compile.heading": "编译",
  "settings.pandocExport.name": "Pandoc 导出",
  "settings.pandocExport.desc":
    "“运行 Pandoc 导出”编译步骤的设置。Pandoc 工具链(过滤器、模板、CSL)按需下载,因此大多数字段可以留空。",
  "settings.pandocExport.button": "设置 Pandoc 导出…",
  "settings.market.name": "Pandoc 资产市场",
  "settings.market.desc":
    "从资产仓库浏览、下载并安装 Pandoc 配方、过滤器、模板与 CSL 样式。",
  "settings.market.button": "浏览资产市场…",
  "settings.market.url.name": "市场目录 URL",
  "settings.market.url.desc":
    "指向资产仓库 index.json 的链接。留空则使用内置默认。",
  "settings.pandocUrl.name": "Pandoc 资源包 URL",
  "settings.pandocUrl.desc":
    "指向 Pandoc 工具链 .zip(过滤器/模板/CSL)的链接。“设置 Pandoc 导出 → 下载资源”会用到它。",
  "settings.pandocFolder.name": "Pandoc 资源文件夹",
  "settings.pandocFolder.desc":
    "包含 defaults/ 和 csl/ 的文件夹。留空则使用默认下载位置(PaperBell/pandoc)。可填绝对路径或库内相对路径。",
  "settings.pandocOutput.name": "Pandoc 输出文件夹",
  "settings.pandocOutput.desc":
    "写入 <缩写>_<日期>.pdf 的文件夹。可填库内相对路径,或填绝对路径以导出到库外(如 ~/Papers —— ~ 展开为你的用户主目录;若不存在会自动创建)。留空则写在编译产物旁边。",
  "settings.bibliography.name": "参考文献库",
  "settings.bibliography.desc":
    "用于引用的 .bib 文件路径。留空则在项目中自动探测 references.bib / mybib.bib。",
  "settings.globalBibliography.name": "全局参考文献库",
  "settings.globalBibliography.desc":
    "在每个项目自带 .bib 之外,额外合并进每次导出的 .bib 文件(可多个)。每行一个路径(或用逗号分隔);可填库内相对路径或绝对路径。遇到重复 cite key 时,项目自带的优先。",
  "settings.pandocBinary.name": "Pandoc 可执行文件",
  "settings.pandocBinary.desc":
    "pandoc 可执行文件的路径,或直接填 “pandoc”。常见的 Homebrew/MacTeX 目录会自动加入 PATH。",
  "settings.userScriptFolder.name": "用户脚本步骤文件夹",
  "settings.userScriptFolder.desc":
    "此文件夹中的 .js 文件会作为“用户脚本步骤”出现在编译面板中。",
  "settings.userSteps.loaded": "已加载 {count} 个步骤:",
  "settings.userSteps.none": "未加载任何步骤。",
  "settings.userSteps.desc":
    "用户脚本步骤会从此文件夹自动加载。此文件夹中 .js 文件的改动会在稍有延迟后与 PaperOut To-Authors 同步。如果你的脚本没有出现在这里或编译标签页中,可能是脚本有错误 —— 请查看开发者控制台。",

  // ── 设置:字数与写作会话 ──────────────────────────────────────────────
  "settings.wordCounts.heading": "字数与写作会话",
  "settings.showWordCount.name": "在状态栏显示字数",
  "settings.showWordCount.desc": "点击状态栏项目可显示当前聚焦笔记所属的项目。",
  "settings.newSessionDaily.name": "每天开始新的写作会话",
  "settings.newSessionDaily.desc":
    "你随时可以通过运行“开始新的写作会话”命令来手动开启新会话。关闭此项后,写作会话会跨多天延续,直到你手动开启新的会话。",
  "settings.sessionGoal.name": "会话字数目标",
  "settings.sessionGoal.desc": "单次写作会话要达成的字数目标。",
  "settings.goalAppliesTo.name": "目标作用范围",
  "settings.goalAppliesTo.desc":
    "你可以让字数目标针对你的全部写作,也可以让每个项目或每个场景各自拥有独立的目标。",
  "settings.goalAppliesTo.all": "所有项目的总字数",
  "settings.goalAppliesTo.project": "每个项目单独计算",
  "settings.goalAppliesTo.note": "每个场景或单场景项目",
  "settings.notifyOnGoal.name": "达成目标时通知",
  "settings.countDeletions.name": "删除的字数计入目标",
  "settings.countDeletions.desc":
    "开启后,删除字数会计为负的写作字数。单次会话不会低于零。",
  "settings.sessionsToKeep.name": "保留的会话数",
  "settings.sessionsToKeep.desc": "本地存储的会话数量。",
  "settings.storeSession.name": "存储会话数据",
  "settings.storeSession.desc":
    "写作会话数据的存储位置。默认与其它设置一起存放在插件的 data.json 文件中。你也可以改为存放在插件文件夹内单独的 .json 文件里,或库内的某个文件中 —— 出于选择性同步或 git 的考虑,你可能会这么做。",
  "settings.storeSession.data": "随插件设置一起存储",
  "settings.storeSession.pluginFolder": "作为插件文件夹内的 .json 文件",
  "settings.storeSession.file": "作为库内的一个文件",
  "settings.sessionFile.name": "会话存储文件",
  "settings.sessionFile.desc":
    "库内存储会话 JSON 的位置。不存在则创建,存在则覆盖。",

  // ── 设置:故障排查 ────────────────────────────────────────────────────
  "settings.troubleshooting.heading": "故障排查",
  "settings.waitForSync.name": "等待 Obsidian Sync",
  "settings.waitForSync.desc":
    "在 Obsidian Sync 完成首次同步前,阻止 PaperOut To-Authors 运行。如果你使用 Sync,并遇到场景消失或被误判为新场景的问题,可以开启此项。",
  "settings.fallbackWait.name": "启用兜底等待",
  "settings.fallbackWait.desc":
    "若无法检测到同步状态,则在查找场景前先等待下方指定的时间。",
  "settings.fallbackWaitTime.name": "兜底等待时间",
  "settings.fallbackWaitTime.desc": "无法检测到同步状态时的等待秒数。",

  // ── 设置:PaperBell ───────────────────────────────────────────────────
  "settings.paperbell.heading": "PaperBell",
  "settings.paperbell.connectedWithName": "已连接到 PaperBell —— {name}{plan}。",
  "settings.paperbell.connected": "已连接到 PaperBell。",
  "settings.paperbell.account.name": "账户与共享设置",
  "settings.paperbell.account.desc":
    "获取你的 PaperBell 账户与共享配置(语言、AI)。首次获取时 PaperBell 会请求你的授权。",
  "settings.paperbell.button.connect": "连接",
  "settings.paperbell.button.refresh": "刷新",
  "settings.paperbell.aiAvailable":
    "AI 功能通过 PaperBell 提供 —— 本插件不存储任何 API 密钥。",
  "settings.paperbell.notConnected":
    "尚未连接 PaperBell。安装并启用 PaperBell 插件即可跟随其语言并启用 AI 功能。不装它,本插件也能完整使用。",

  // ── 设置:致谢 ────────────────────────────────────────────────────────
  "settings.credits.heading": "致谢",
  "settings.credits.body":
    'PaperOut To-Authors —— PaperBell 套件的一部分,基于 <a href="https://github.com/kevboh/longform">Longform</a> 分支开发,原作者为 <a href="https://kevinbarrett.org">Kevin Barrett</a>。由 <a href="https://github.com/PaperBell-Org">PaperBell-Org</a> 维护。',
  "settings.credits.source":
    '源代码与问题反馈请见 <a href="https://github.com/PaperBell-Org">https://github.com/PaperBell-Org</a>。',
  "settings.credits.icon":
    '图标来自 <a href="https://www.flaticon.com/authors/zlatko-najdenovski" title="Zlatko Najdenovski">Zlatko Najdenovski</a>,取自 <a href="https://www.flaticon.com/" title="Flaticon">www.flaticon.com</a>。',
};
