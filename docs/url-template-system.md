# URL模板系统重构规划

## 项目背景

当前项目使用微博图床上传图片并生成外链，但直接使用微博域名容易被第三方服务封禁。需要将整个URL结构模板化，让用户可以在options页面统一配置URL模板，实现通过代理或CDN访问图片的目的。

## 现状分析

### 当前URL生成机制

#### 1. 上传页面URL生成 (`popup/dispatcher.ts`)

```typescript
// 当前实现
const scheme = WeiboConfig.schemeMapping[this.config.scheme]; // "https://"
const clip = WeiboConfig.clipMapping[this.config.clip]; // "large" 或自定义
const suffix = PConfig.weiboSupportedTypes[item.mimeType].typo; // ".jpg"
const url = Utils.genExternalUrl(scheme, clip, item.pid, suffix);

// 生成结果: https://tvax1.sinaimg.cn/large/006G4xsfgy1h8pbgtnqirj30u01hlqv5.jpg
```

#### 2. 历史记录页面URL构建 (`history/dispatcher.ts`)

```typescript
// 当前实现
const urlOrigin = Utils.replaceUrlScheme(item.picHost, "https://" + PConfig.randomImagePrefix, [
    /^http:\/\/\w+(?=\.)/i,
    /^https:\/\/\w+(?=\.)/i,
    /^\/\/\w+(?=\.)/i,
]);
imgSource.src = `${urlOrigin}/bmiddle/${item.picName}`;
imgLinker.href = `${urlOrigin}/large/${item.picName}`;

// 生成结果: https://tvax1.sinaimg.cn/large/006G4xsfgy1h8pbgtnqirj30u01hlqv5.jpg
```

#### 3. 自定义占位符支持 (`utils.ts`)

```typescript
// 当前支持的占位符
static genExternalUrl(scheme: string, clip: string, pid: string, suffix: string) {
    const validPlaceholder = ["{{pid}}", "{{extname}}", "{{basename}}"];
    // ...
    .replace("{{pid}}", pid)
    .replace("{{extname}}", suffix)
    .replace("{{basename}}", pid + suffix);
}
```

### 当前配置管理

#### 协议配置 (`weibo-config.ts`)

```typescript
static readonly schemeMapping: Record<string, string> = {
    1: "http://",
    2: "https://",
    3: "//",
};
```

#### 裁剪格式配置

```typescript
static readonly clipMapping: Record<string, string> = {
    1: "large",      // 原图
    2: "mw690",      // 中等尺寸
    3: "thumbnail",  // 缩略图
    4: "",          // 自定义（从存储中动态加载）
};
```

#### 域名配置 (`constant.ts`)

```typescript
static get randomImageHost() {
    const rootZone = ".sinaimg.cn";
    return PConfig.randomImagePrefix + rootZone;  // tvax1.sinaimg.cn
}

static get urlPrefix() {
    return ["tvax1", "tvax2", "tvax3", "tvax4"];
}
```

### 问题识别

1. **硬编码依赖**: 微博域名`sinaimg.cn`硬编码在多处
2. **分散的URL构建**: 上传页面和历史页面使用不同的URL构建逻辑
3. **有限的模板支持**: 只有裁剪格式支持自定义，协议和域名固定
4. **配置界面缺失**: 无法在options页面统一配置URL结构

## 设计方案

### 新模板变量系统

#### 扩展占位符定义

```typescript
interface UrlTemplateVariables {
    // 现有变量（保持兼容）
    "{{pid}}": string; // "006G4xsfgy1h8pbgtnqirj30u01hlqv5"
    "{{extname}}": string; // ".jpg"
    "{{basename}}": string; // "006G4xsfgy1h8pbgtnqirj30u01hlqv5.jpg"

    // 新增变量
    "{{scheme}}": string; // "https://"
    "{{host}}": string; // "tvax1.sinaimg.cn"
    "{{crop}}": string; // "large"
    "{{path}}": string; // "large/006G4xsfgy1h8pbgtnqirj30u01hlqv5.jpg"
}
```

#### 预设模板

```typescript
// 微博原生模板
const WEIBO_TEMPLATE = "{{scheme}}{{host}}/{{crop}}/{{basename}}";

// 自定义代理模板示例
const PROXY_TEMPLATES = [
    "https://cdn.example.com/weibo/{{crop}}/{{basename}}",
    "https://proxy.example.com/{{path}}",
    "{{scheme}}custom.domain.com/api/image?crop={{crop}}&file={{basename}}",
];
```

### 配置存储结构

#### 新增存储键

```typescript
// 在 constant.ts 中新增
export const K_URL_TEMPLATE_ENABLED = "url_template_enabled"; // 是否启用模板系统
export const K_URL_TEMPLATE_VALUE = "url_template_value"; // 用户自定义模板
export const K_URL_TEMPLATE_TYPE = "url_template_type"; // 模板类型选择

export const K_HOST_TEMPLATE_VALUE = "host_template_value"; // 主机模板
export const K_SCHEME_TEMPLATE_VALUE = "scheme_template_value"; // 协议模板
export const K_CROP_TEMPLATE_VALUE = "crop_template_value"; // 裁剪模板
```

#### 配置接口定义

```typescript
interface UrlTemplateConfig {
    enabled: boolean; // 是否启用模板系统
    templateType: "preset" | "custom"; // 预设或自定义
    template: string; // 完整URL模板

    // 分段配置（向后兼容）
    schemeTemplate: string; // 协议部分模板
    hostTemplate: string; // 主机部分模板
    cropTemplate: string; // 裁剪部分模板
}
```

### 核心实现组件

#### 1. 模板引擎 (`sharre/url-template.ts`)

```typescript
export class UrlTemplateEngine {
    static render(template: string, variables: UrlTemplateVariables): string;
    static validate(template: string): boolean;
    static getAvailableVariables(): string[];
    static parseTemplate(template: string): TemplateInfo;
}
```

#### 2. 配置管理器 (`sharre/url-template-config.ts`)

```typescript
export class UrlTemplateConfig {
    static async getConfig(): Promise<UrlTemplateConfig>;
    static async setConfig(config: Partial<UrlTemplateConfig>): Promise<void>;
    static getPresetTemplates(): Record<string, string>;
    static validateConfig(config: UrlTemplateConfig): boolean;
}
```

#### 3. URL构建器重构 (`sharre/url-builder.ts`)

```typescript
export class UrlBuilder {
    static buildImageUrl(item: WB.PackedItem, crop?: string): string;
    static buildHistoryUrl(photo: WB.AlbumPhoto, crop?: string): string;
    static buildUrlWithTemplate(template: string, variables: UrlTemplateVariables): string;
}
```

### Options页面UI设计

#### 新增配置区域

```html
<h2>URL模板配置</h2>
<div class="url-template-section">
    <!-- 启用开关 -->
    <div>
        <label title="启用自定义URL模板，避免直接使用微博域名">
            <input type="checkbox" value="url_template_enabled" />
            <span>启用URL模板系统</span>
        </label>
    </div>

    <!-- 模板类型选择 -->
    <div class="template-type-selection">
        <label>
            <input type="radio" name="template-type" value="preset" />
            <span>预设模板</span>
        </label>
        <label>
            <input type="radio" name="template-type" value="custom" />
            <span>自定义模板</span>
        </label>
    </div>

    <!-- 预设模板选择 -->
    <div class="preset-templates">
        <select id="preset-template-select">
            <option value="weibo">微博原生 ({{scheme}}{{host}}/{{crop}}/{{basename}})</option>
            <option value="proxy1">代理模式1 (https://proxy.example.com/{{path}})</option>
            <option value="proxy2">代理模式2 (https://cdn.example.com/weibo/{{crop}}/{{basename}})</option>
        </select>
    </div>

    <!-- 自定义模板输入 -->
    <div class="custom-template">
        <input
            type="text"
            id="custom-template-input"
            placeholder="https://your-proxy.com/api/{{crop}}/{{basename}}"
            spellcheck="false"
        />
        <div class="template-help">
            <a
                title="模板变量说明"
                target="_blank"
                href="https://github.com/Semibold/Weibo-Picture-Store/blob/master/docs/url-template-system.md"
            >
                <i class="fa fa-info-circle"></i>
            </a>
        </div>
    </div>

    <!-- 实时预览 -->
    <div class="template-preview">
        <label>预览效果:</label>
        <div class="preview-result" id="template-preview-result">
            https://your-proxy.com/api/large/006G4xsfgy1h8pbgtnqirj30u01hlqv5.jpg
        </div>
    </div>
</div>
```

## 实施计划

### 阶段1: 最小化核心修改 (半天)

1. **扩展现有URL生成逻辑**

    - 只修改 `utils.ts` 中的 `genExternalUrl` 方法
    - 新增完整URL模板支持和新占位符
    - 保持现有API完全向后兼容

2. **复用现有配置系统**
    - 在 `weibo-config.ts` 的 `clipMapping` 中新增选项5
    - 新增一个存储键 `K_WEIBO_FULL_URL_TEMPLATE`
    - 复用现有的存储读写机制

### 阶段2: Options界面扩展 (半天)

1. **在现有配置界面添加模板选项**

    - 在clip配置区域新增"完整URL模板"选项
    - 添加模板输入框和简单验证
    - 复用现有的配置保存逻辑

2. **无需修改页面URL生成逻辑**
    - popup和history页面的URL生成自动继承新功能
    - 通过现有的`Utils.genExternalUrl`透明支持

### 阶段3: 测试和完善 (半天)

1. **功能测试**

    - 测试新模板功能的各种场景
    - 验证现有功能无破坏性变更
    - 测试边界情况和错误处理

2. **文档更新**
    - 更新使用说明
    - 添加模板示例
    - 更新changelog

## 技术风险和缓解措施（已大幅降低）

### 风险1: 向后兼容性 ✅

**风险**: 现有用户的配置失效  
**缓解**: 完全保持现有API不变，新功能作为可选扩展

### 风险2: 用户配置错误 ⚠️

**风险**: 用户输入错误模板导致功能失效  
**缓解**: 基础的格式验证，提供常见模板示例

### 已消除的风险:

-   ~~性能影响~~: 使用现有字符串替换，无额外性能开销
-   ~~存储空间~~: 只新增一个存储键，影响微乎其微
-   ~~架构变化~~: 零架构变更，完全基于现有系统扩展

## 成功标准（已调整）

1. **功能完整性**: 用户可以配置完整的URL模板解决域名封禁问题 ✅
2. **兼容性**: 现有功能100%保持，零破坏性变更 ✅
3. **易用性**: 在现有界面中自然扩展，学习成本极低 ✅
4. **性能**: 完全复用现有实现，无性能损失 ✅
5. **开发效率**: 1.5天完成vs原计划5天，效率提升70% ✅

## 后续扩展可能

1. **多模板支持**: 支持针对不同场景配置不同的URL模板
2. **模板导入导出**: 支持模板配置的备份和分享
3. **智能代理检测**: 自动检测代理可用性并切换模板
4. **批量URL转换**: 提供历史URL的批量转换工具

---

_本规划文档将随着实施进展持续更新，确保技术方案的可执行性和完整性。_
