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
 * Last synced against PaperBell host build `paperbell` v0.4.4: `schemaVersion` is still 1,
 * with backward-compatible additions — the `llm-credentials` / `activation` / `download-ticket`
 * scopes and their `request*` methods, the `paperbell:plugins-changed` event, and the
 * `providerId` / `providerName` / `hasApiKey` fields on the public LLM config.
 *
 * ── Original header ──────────────────────────────────────────────────────────
 * PaperBell 对外共享契约(消费方 / IPC 表面)。
 * 安全约定:
 * - `PaperBellSharedConfig` 是主插件内部持有的完整形态(含 `llm.apiKey`)。
 * - 经 IPC 对外暴露的一律是 `*Public` 变体,永不包含 apiKey / 激活码等密钥。
 */

/** 契约版本号,便于未来兼容判断。 */
export const PPB_SCHEMA_VERSION = 1;

/**
 * 宿主挂载完成后在 `app.workspace` 上 trigger 的事件名,载荷为 {@link PPBHostApi}。
 * 子插件与 PaperBell 的加载顺序不确定,推荐握手模式(事件只在宿主加载时触发一次,
 * 后加载的一方必须先主动探测)。
 */
export const PPB_READY_EVENT = "paperbell:ready";

/**
 * 宿主核心配置(语言 / LLM / 账户)变更时在 `app.workspace` 上 trigger 的事件名,
 * 载荷为 {@link PaperBellSharedConfigPublic}(去密钥)。
 */
export const PPB_CONFIG_CHANGED_EVENT = "paperbell:config-changed";

/**
 * 已注册子插件名单变化时在 `app.workspace` 上 trigger 的事件名(宿主内部使用,
 * 供其设置页刷新入口卡片列表)。子插件通常无需订阅 —— 仅为契约完整性而保留。
 */
export const PPB_PLUGINS_CHANGED_EVENT = "paperbell:plugins-changed";

/** Cards Wrangler 期望从 PaperBell 主插件读到的共享配置(消费方契约)。 */
export interface PaperBellSharedConfig {
	schemaVersion: number; // 便于未来兼容判断
	language: "en" | "zh"; // 统一 UI 语言,供子插件跟随
	llm: {
		providerId: string; // AI 提供方 id(如 "anthropic" / "openai" / 自定义提供方)
		providerName: string; // 提供方展示名
		api: "anthropic" | "openai"; // 决定请求/响应形态(复用现有 ProviderApi)
		baseUrl: string; // 调度网关基址
		apiKey: string; // 鉴权密钥 / 会话 token
		model: string; // 默认模型 id
		models?: { extract?: string; query?: string }; // 可选:按任务路由
	};
	account?: {
		// 可选,当前仅展示/透传,不强校验
		userId?: string;
		plan?: string; // free | pro | ...
		displayName?: string;
	};
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
export type PPBLLMCredentials = PaperBellSharedConfig["llm"];

/** IPC 默认返回的账户信息(非敏感)。 */
export interface PaperBellAccountInfo {
	userId?: string;
	plan?: string;
	displayName?: string;
	email?: string;
	/** 许可证是否处于激活态。 */
	isActive: boolean;
}

/** 经 IPC 对外暴露的共享配置(去密钥)。 */
export interface PaperBellSharedConfigPublic {
	schemaVersion: number;
	language: "en" | "zh";
	llm: PaperBellLLMConfigPublic;
	account?: PaperBellAccountInfo;
}

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
	| "download-ticket";

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
}

/**
 * `activation`:宿主许可证 / 激活状态(经 `requestActivationInfo()` 取回)。
 * 不含激活码本身 —— 仅暴露是否激活及其派生信息。
 */
export interface PPBActivationInfo {
	/** 许可证是否处于激活态。 */
	isActive: boolean;
	/** 到期时间(epoch ms),不适用时省略。 */
	expiresAt?: number;
	plan?: string; // free | pro | ...
	userId?: string;
	email?: string;
}

/** `download-ticket`:请求受保护下载链接时的参数。 */
export interface PPBDownloadTicketParams {
	/** 下载服务基址,缺省 `https://paperbell.cn`。 */
	baseUrl?: string;
	/** 产品标识,缺省 `paperbell-core`。 */
	product?: string;
}

/**
 * `download-ticket`:宿主凭激活码换取的受保护下载凭据。至少含一个可下载 `url`;
 * 其余字段随宿主/产品而定。
 */
export interface PPBDownloadTicket {
	url: string;
	[key: string]: unknown;
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
	requestSharedConfig(): Promise<PaperBellSharedConfigPublic | null>;
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
	requestLLMCredentials(): Promise<PPBLLMCredentials | null>;
	/** 请求宿主许可证 / 激活状态(scope: activation)。拒绝授权 / 宿主缺失返回 null。 */
	requestActivationInfo(): Promise<PPBActivationInfo | null>;
	/**
	 * 请求受保护下载链接(scope: download-ticket)。需宿主处于激活态;
	 * 拒绝授权 / 宿主缺失返回 null,未激活或换取失败由宿主抛错。
	 */
	requestProtectedDownloadTicket(
		params?: PPBDownloadTicketParams,
	): Promise<PPBDownloadTicket | null>;
	/**
	 * 订阅公开配置变更;返回取消订阅函数。
	 * 底层即 workspace 事件 {@link PPB_CONFIG_CHANGED_EVENT}。
	 */
	onConfigChange(
		cb: (config: PaperBellSharedConfigPublic) => void,
	): () => void;
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
