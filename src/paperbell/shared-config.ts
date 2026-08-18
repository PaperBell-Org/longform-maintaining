/**
 * VENDORED COPY of PaperBell's public shared contract (`paperbell-shared-config.ts`).
 *
 * Source of truth lives in the PaperBell main plugin. This file is intentionally a
 * zero-dependency copy (no Obsidian/plugin imports) so we can type our IPC surface
 * without a build/submodule coupling — as the upstream file's own docstring recommends.
 *
 * SYNC POLICY: this copy is pinned to `PPB_SCHEMA_VERSION`. When PaperBell bumps its
 * schema, re-vendor this file and reconcile the compatibility check in `client.ts`.
 * See MAINTAINING.md → "PaperBell relationship".
 *
 * Last synced against PaperBell **0.4.7**, whose published contract is "附录 A" of the host's
 * README-ZH (its plugin repo ships docs + release binaries, not sources — that appendix *is*
 * the upstream file for vendoring purposes). Type names here match it verbatim so the next
 * re-vendor is a readable diff. What 0.4.7 changed for us:
 *   - `schemaVersion` is **2** (v1 → v2 narrowed the broadcast payload from the full config
 *     to {@link PaperBellPublicConfig}; the per-client push still carries the restricted one);
 *   - `PaperBellSharedConfigPublic` was renamed {@link PaperBellRestrictedConfig}, with the
 *     old name kept upstream as a deprecated alias;
 *   - `profile` / `cimpoFolders` (optional) and the completion-result quota fields were added;
 *   - `llm.baseUrl` / `llm.model` are now *effective* values — `baseUrl` has no trailing slash
 *     and both fall back to the host's built-in defaults instead of echoing empty user input.
 * Additions are not a schema bump upstream, so treat unknown optional fields as absent and
 * never compare `schemaVersion` for equality.
 *
 * One deliberate deviation from the appendix: `PPBClient.requestSharedConfig()` is typed
 * with the current name, `PaperBellRestrictedConfig`, where upstream's own appendix still
 * writes the deprecated alias. Identical type, quieter deprecation.
 *
 * ⚠️ PROPOSAL — NOT YET UPSTREAM: the `projects` scope and everything it drags in
 * (`PPB_PROJECTS_CHANGED_EVENT`, `PPBProject`, `PPBProjectsQuery`, `PPBProjectsResult`,
 * `PPBClient.requestProjects` / `onProjectsChange`) are *our* proposal to the host, written
 * up in docs/PROPOSAL_PROJECTS_SCOPE.md. 0.4.7 still does not implement it, which is why the
 * client methods are optional and every consumer gates on capability + `typeof` checks rather
 * than on `PPB_SCHEMA_VERSION` — that constant tracks the host's number and nothing else, so
 * the "host schema is newer than vendored" warning keeps working.
 *
 * ── Original header ──────────────────────────────────────────────────────────
 * PaperBell 对外共享契约(消费方 / IPC 表面)。
 * 安全约定:
 * - `PaperBellSharedConfig` 是主插件内部持有的完整形态(含 `llm.apiKey`)。
 * - 经 IPC 对外暴露的一律是 `*Public` 变体,永不包含 apiKey / 激活码等密钥。
 */

/** 契约版本号,便于未来兼容判断。 */
export const PPB_SCHEMA_VERSION = 2;

/**
 * 宿主挂载完成后在 `app.workspace` 上 trigger 的事件名,载荷为 {@link PPBHostApi}。
 * 子插件与 PaperBell 的加载顺序不确定,推荐握手模式(先主动探测,探不到再等事件)。
 *
 * 宿主**每次**装载都会广播它 —— 所以这条监听同时承担「首次握手」和「宿主重载后重新
 * 握手」两个职责,必须常驻:握手成功后摘掉监听,PaperBell 更新一次就再也连不回来。
 */
export const PPB_READY_EVENT = "paperbell:ready";

/**
 * 宿主核心配置(语言 / 用户资料)变更时在 `app.workspace` 上 trigger 的事件名,
 * 载荷为公开层的 {@link PaperBellPublicConfig} —— schema v2 起已由完整配置收窄至此。
 * 要拿到含 LLM / 账户的受限层,用 {@link PPBClient.onConfigChange}。
 */
export const PPB_CONFIG_CHANGED_EVENT = "paperbell:config-changed";

/**
 * 已注册子插件名单变化时在 `app.workspace` 上 trigger 的事件名(宿主内部使用,
 * 供其设置页刷新入口卡片列表)。子插件通常无需订阅 —— 仅为契约完整性而保留。
 */
export const PPB_PLUGINS_CHANGED_EVENT = "paperbell:plugins-changed";

/**
 * **提案(尚未上游实现)**:项目清单发生变化时宿主在 `app.workspace` 上 trigger 的事件名。
 * 语义对齐 {@link PPB_CONFIG_CHANGED_EVENT} —— 有它子插件就不必每次开界面都重新拉取。
 */
export const PPB_PROJECTS_CHANGED_EVENT = "paperbell:projects-changed";

/** 用户资料。宿主未填任何一项时整个 `profile` 字段缺席。 */
export interface PaperBellUserProfile {
	name?: string;
	title?: string;
	email?: string;
	institution?: string;
	avatar?: string;
}

/** 宿主的 CIMPO 文件夹布局(可选)。 */
export interface PaperBellCimpoFolders {
	concepts: string;
	inputs: string;
	metadata: string;
	projects: string;
	outputs: string;
}

/**
 * 公开层广播载荷:{@link PPB_CONFIG_CHANGED_EVENT} 在 workspace 总线上携带的形态,
 * 无需握手、无需 scope。schema v1 → v2 的破坏性变更就是把它从完整配置收窄到这里。
 * 注意与 {@link PPBClient.onConfigChange} 区分 —— 后者是宿主对已授权子插件的定向推送,
 * 载荷是更宽的 {@link PaperBellRestrictedConfig}。
 */
export interface PaperBellPublicConfig {
	schemaVersion: number;
	language: "en" | "zh";
	profile?: PaperBellUserProfile;
}

/** Cards Wrangler 期望从 PaperBell 主插件读到的共享配置(消费方契约)。 */
export interface PaperBellSharedConfig {
	schemaVersion: number; // 便于未来兼容判断
	language: "en" | "zh"; // 统一 UI 语言,供子插件跟随
	llm: {
		providerId?: string; // AI 提供方 id(如 "anthropic" / "openai" / 自定义提供方)
		providerName?: string; // 提供方展示名
		api: "anthropic" | "openai"; // 决定请求/响应形态(复用现有 ProviderApi)
		baseUrl: string; // 调度网关基址(0.4.7 起为生效值:已去掉尾部斜杠,留空时回落到默认地址)
		apiKey: string; // 鉴权密钥 / 会话 token
		model: string; // 默认模型 id(0.4.7 起用户没选过时回落到内置默认模型)
		models?: { extract?: string; query?: string }; // 可选:按任务路由
	};
	account?: {
		// 可选,当前仅展示/透传,不强校验
		userId?: string;
		plan?: string; // free | pro | ...
		displayName?: string;
	};
	cimpoFolders?: PaperBellCimpoFolders;
}

/**
 * LLM 配置的对外(去密钥)形态:剔除 `apiKey`,改以布尔 `hasApiKey` 表示宿主是否已配置密钥。
 */
export type PaperBellLLMConfigPublic = Omit<
	PaperBellSharedConfig["llm"],
	"apiKey"
> & {
	/** 宿主是否已配置可用的 API 密钥(密钥本身不外泄)。 */
	hasApiKey: boolean;
};

/**
 * 完整 LLM 凭据(**含 `apiKey`**),经 `requestLLMCredentials()`(scope: `llm-credentials`)
 * 取回。属敏感数据 —— 首次请求会弹同意框,子插件须自行妥善保管、避免落盘或日志外泄。
 */
export type PaperBellLLMCredentials = PaperBellSharedConfig["llm"];

/** IPC 默认返回的账户信息(非敏感)。 */
export interface PaperBellAccountInfo {
	userId?: string;
	plan?: string;
	displayName?: string;
	email?: string;
	/** 许可证是否处于激活态。 */
	isActive: boolean;
}

/** 经 IPC 对外暴露的共享配置(去密钥)。受限层,需 `config` scope。 */
export interface PaperBellRestrictedConfig {
	schemaVersion: number;
	language: "en" | "zh";
	llm: PaperBellLLMConfigPublic;
	account?: PaperBellAccountInfo;
	profile?: PaperBellUserProfile;
	cimpoFolders?: PaperBellCimpoFolders;
}

/** @deprecated 上游 0.4.7 起改名为 {@link PaperBellRestrictedConfig};别名同样保留。 */
export type PaperBellSharedConfigPublic = PaperBellRestrictedConfig;

/** 主插件自身信息(供子插件发现能力)。 */
export interface PaperBellPluginInfo {
	id: string; // 'paperbell'
	name: string;
	version: string;
	schemaVersion: number;
	isActivated: boolean;
	/** 已开放的能力/scope 列表。 */
	capabilities: PPBScope[];
}

/** 可被请求的信息范围。每个 scope 独立授权。 */
export type PPBScope =
	| "account"
	| "config"
	| "plugin-info"
	| "llm-invoke"
	| "llm-credentials"
	| "activation"
	| "download-ticket"
	/** **提案(尚未上游实现)**:宿主维护的项目清单。见 docs/PROPOSAL_PROJECTS_SCOPE.md。 */
	| "projects";

/**
 * `llm-invoke`:请求宿主用其 AI 配置代发一次**非流式**补全。
 * 密钥不出宿主 —— 子插件只提交内容、拿回文本。
 */
export interface PPBCompletionParams {
	messages: Array<{ role: "user" | "assistant"; content: string }>;
	/** 系统提示(可选)。 */
	system?: string;
	/** 缺省使用宿主设置的默认模型。 */
	model?: string;
	/** 输出上限;anthropic 形态为上游必填,缺省 1024。 */
	maxTokens?: number;
	temperature?: number;
}

export interface PPBCompletionResult {
	ok: boolean;
	/** ok=true 时的模型输出文本。 */
	text: string;
	/** 实际使用的模型 id。 */
	model: string;
	/** ok=false 时的错误描述(不含密钥等敏感信息)。 */
	error?: string;
	/** ok=false 时的机读原因;目前只有免费档额度耗尽一种。 */
	errorCode?: "quota-exhausted";
	/** 免费档额度快照(宿主给出时)。`resetsAt` 为 epoch ms。 */
	quota?: { limit: number; remaining: number; resetsAt: number };
}

/**
 * `activation`:宿主许可证 / 激活状态(经 `requestActivationInfo()` 取回)。
 * 不含激活码本身 —— 仅暴露是否激活及其派生信息。
 */
export interface PaperBellActivationInfo {
	/** 许可证是否处于激活态。 */
	isActive: boolean;
	/** 到期时间(epoch ms),不适用时省略。 */
	expiresAt?: number;
	plan?: string; // free | pro | ...
	userId?: string;
	email?: string;
}

/** `download-ticket`:请求受保护下载链接时的参数。 */
export interface PPBProtectedDownloadParams {
	/** 下载服务基址,缺省 `https://paperbell.cn`。 */
	baseUrl?: string;
	/** 产品标识,缺省 `paperbell-core`。 */
	product?: string;
}

/**
 * `download-ticket`:宿主凭激活码换取的受保护下载凭据。至少含一个可下载 `url`;
 * 其余字段随宿主/产品而定。
 */
export interface PPBProtectedDownloadTicket {
	url: string;
	filename?: string;
	/** 链接有效期(秒)。 */
	expires_in?: number;
	version?: string;
	sha256?: string;
	[key: string]: unknown;
}

/**
 * `projects`(**提案,尚未上游实现**):宿主(Project Manager)维护的一条项目记录。
 *
 * 子插件用它把自己的产出挂到某个项目下 —— 展示用 `name`,写入交付物 frontmatter 用
 * `acronym`,将来做反向上报用 `id`。
 */
export interface PPBProject {
	/** 稳定 id。项目笔记重命名 / 移动后必须保持不变(因此不宜直接用 vault 路径)。 */
	id: string;
	/** 项目全称,下拉菜单的展示名。 */
	name: string;
	/**
	 * 项目缩写 / 代号 —— 交付物 frontmatter `project:` 实际写入的值。
	 * 宿主须保证同一 vault 内唯一;缺省时消费方回退到 `name`。
	 */
	acronym?: string;
	/** 项目笔记的 vault 路径(可选),供跳转 / 生成链接。 */
	notePath?: string;
	/** 生命周期状态。消费方默认只列 active / planned。 */
	status?: "active" | "planned" | "paused" | "done" | "archived";
	/** 项目根文件夹(可选),供子插件建议交付物落盘位置。 */
	folder?: string;
	/** 关联的 featured concepts(可选),供子插件预填 `concepts:`。 */
	concepts?: string[];
}

/** 拉取项目清单的过滤条件。全部可选,由宿主端做匹配。 */
export interface PPBProjectsQuery {
	/** 只返回这些状态的项目;缺省 `["active", "planned"]`。 */
	status?: NonNullable<PPBProject["status"]>[];
	/** 名称 / 缩写关键词。 */
	query?: string;
}

export interface PPBProjectsResult {
	ok: boolean;
	projects: PPBProject[];
	/** ok=false 时的错误描述。 */
	error?: string;
}

/** 调用方(子插件)身份。用于同意弹框展示、授权名单存储与设置入口卡片。 */
export interface PPBRequestSource {
	/** 稳定的插件 id(建议与其 manifest id 一致)。 */
	id: string;
	/** 展示名。 */
	name: string;
	/** 入口卡片描述,展示在 PaperBell 设置入口页。 */
	description?: string;
	/** 入口卡片图标(lucide 图标 id),缺省 "puzzle"。 */
	icon?: string;
	/**
	 * 用户在 PaperBell 设置入口页点击该子插件卡片时的回调,
	 * 由子插件自行决定行为(如打开自己的设置页)。缺省则卡片不可点击。
	 */
	onOpen?: () => void;
}

/** 一条已授权记录。 */
export interface PPBGrant {
	sourceId: string;
	sourceName: string;
	scopes: PPBScope[];
	grantedAt: number;
}

/**
 * 子插件握手后拿到的客户端。所有 request* 首次触达某 scope 会弹同意框,
 * 用户批准并记入授权名单后,后续同 scope 免弹;拒绝返回 null。
 */
export interface PPBClient {
	requestAccountInfo(): Promise<PaperBellAccountInfo | null>;
	requestSharedConfig(): Promise<PaperBellRestrictedConfig | null>;
	requestPluginInfo(): Promise<PaperBellPluginInfo | null>;
	/**
	 * 请求宿主代发一次补全(scope: llm-invoke)。
	 * 拒绝授权返回 null;宿主未配置或上游失败返回 `{ ok: false, error }`。
	 */
	requestCompletion(
		params: PPBCompletionParams,
	): Promise<PPBCompletionResult | null>;
	/**
	 * 请求完整 LLM 凭据(**含 apiKey**;scope: llm-credentials)。
	 * 拒绝授权 / 宿主缺失返回 null。属敏感数据,请勿落盘或写日志。
	 */
	requestLLMCredentials(): Promise<PaperBellLLMCredentials | null>;
	/** 请求宿主许可证 / 激活状态(scope: activation)。拒绝授权 / 宿主缺失返回 null。 */
	requestActivationInfo(): Promise<PaperBellActivationInfo | null>;
	/**
	 * 请求受保护下载链接(scope: download-ticket)。需宿主处于激活态;
	 * 拒绝授权 / 宿主缺失返回 null,未激活或换取失败由宿主抛错。
	 */
	requestProtectedDownloadTicket(
		params?: PPBProtectedDownloadParams,
	): Promise<PPBProtectedDownloadTicket | null>;
	/**
	 * 订阅受限层配置变更;返回取消订阅函数。
	 *
	 * 这是宿主对**本 client** 的定向推送,不是 workspace 总线 —— 因此它随 client 一起
	 * 失效:宿主重载后必须在 {@link PPB_READY_EVENT} 上重新握手并重新订阅。
	 */
	onConfigChange(
		cb: (config: PaperBellRestrictedConfig) => void,
	): () => void;
	/**
	 * 请求宿主的项目清单(scope: projects)。拒绝授权 / 宿主缺失返回 null。
	 *
	 * **提案,尚未上游实现** —— 因此是可选成员:已发布的宿主返回的 handle 上没有这个
	 * 方法,声明成必选会让类型撒谎。调用前必须做 `typeof` 检查。
	 */
	requestProjects?(
		params?: PPBProjectsQuery,
	): Promise<PPBProjectsResult | null>;
	/**
	 * 订阅项目清单变更;返回取消订阅函数。底层即 workspace 事件
	 * {@link PPB_PROJECTS_CHANGED_EVENT}。**提案,尚未上游实现**(同上,可选)。
	 */
	onProjectsChange?(cb: () => void): () => void;
	/** 注销客户端并清理订阅(不撤销授权)。 */
	unregister(): void;
}

/** 全局握手函数签名:`window.registerPPBplugin(source)`。 */
export type RegisterPPBPlugin = (source: PPBRequestSource) => PPBClient;

/** 挂在 `app.plugins.plugins['paperbell'].api` 上的宿主 API。 */
export interface PPBHostApi {
	registerPPBplugin: RegisterPPBPlugin;
	getPluginInfo(): PaperBellPluginInfo;
	/** 列出当前授权名单(供设置页/宿主管理)。 */
	listGrants(): PPBGrant[];
	/** 撤销某来源的全部授权。 */
	revokeGrant(sourceId: string): void;
}

/**
 * 宿主同时把握手函数挂到 `window` 上(早于 `api` 存在,为 QuickAdd 一类用户保留)。
 * 我们不用这条路径 —— 走 `app.plugins.plugins["paperbell"].api` 才有加载顺序保证 ——
 * 但它属于契约的一部分,保留声明以便与上游附录逐行对齐。
 */
declare global {
	interface Window {
		registerPPBplugin?: RegisterPPBPlugin;
	}
}
