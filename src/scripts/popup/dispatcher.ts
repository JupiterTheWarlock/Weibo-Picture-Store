/*
 * Copyright (c) 2018 The Weibo-Picture-Store Authors. All rights reserved.
 * Use of this source code is governed by a MIT-style license that can be
 * found in the LICENSE file.
 */

import { Utils } from "../sharre/utils.js";
import {
    K_WEIBO_CLIP_TYPE,
    K_WEIBO_CLIP_VALUE,
    K_WEIBO_SCHEME_TYPE,
    K_URL_TEMPLATE_ENABLED,
    K_URL_TEMPLATE_VALUE,
    PConfig,
} from "../sharre/constant.js";
import { SectionTable } from "./section-table.js";
import { WeiboClipKey, WeiboConfig, WeiboConfigType } from "../sharre/weibo-config.js";
import { WeiboUpload } from "../sharre/weibo-action.js";
import { fetchBlob } from "../sharre/fetch-blob.js";
import { chromeStorageLocal, chromeStorageSync } from "../sharre/chrome-storage.js";

interface IHybridSectionData {
    sectionTable: SectionTable;
    data: WB.PackedItem | WB.PackedItem[];
}

interface IPreStore extends WB.PackedItem {
    fullDirectoryPath: string;
}

export class Dispatcher {
    config: WeiboConfigType;
    batch: boolean;
    list: Map<HTMLElement, IHybridSectionData>;
    main: HTMLElement;
    copier: HTMLTextAreaElement;
    linker: HTMLInputElement;
    checkout: { clear: boolean };
    nid: string;
    directorySymbol: string;
    classifyMap: Map<Blob, string>;
    preStoreMap: Map<string, IPreStore[]>;
    weiboUpload: WeiboUpload;
    urlTemplateEnabled: boolean;
    urlTemplateValue: string;

    constructor() {
        this.config = null;
        this.batch = false;
        this.list = new Map();
        this.main = document.querySelector("#main");
        this.copier = document.querySelector("#transfer-to-clipboard");
        this.linker = document.querySelector("input.custom-clip");
        this.checkout = { clear: true };
        this.nid = Utils.randomString(16);
        this.directorySymbol = "\ud83d\udcc1";
        this.classifyMap = new Map();
        this.preStoreMap = new Map();
        this.weiboUpload = new WeiboUpload(true);
        this.urlTemplateEnabled = false;
        this.urlTemplateValue = "";
    }

    /** @public */
    async init() {
        await this.genConfigProxy();
        await this.startFromBlank();
        this.registerEvents();
        this.renderSection({});
    }

    /** @private */
    async genConfigProxy() {
        this.config = new Proxy(await WeiboConfig.getTypeMapping(), {
            get: (target, key, receiver) => {
                return Reflect.get(target, key, receiver);
            },
            set: (target, key, value, receiver) => {
                const result = Reflect.set(target, key, value, receiver);
                if (result) {
                    switch (key) {
                        case "scheme":
                            this.renderScheme();
                            chrome.storage.local.set({
                                [K_WEIBO_SCHEME_TYPE]: this.config.scheme,
                            });
                            break;
                        case "clip":
                            this.renderClipSize();
                            chrome.storage.local.set({
                                [K_WEIBO_CLIP_TYPE]: this.config.clip,
                            });
                            break;
                    }
                }
                return result;
            },
        });
    }

    /** @private */
    async startFromBlank() {
        const data = await chromeStorageLocal.promise;
        const syncData = await chromeStorageSync.promise;
        this.linker.value = data[K_WEIBO_CLIP_VALUE] || "";
        this.urlTemplateEnabled = Boolean(syncData[K_URL_TEMPLATE_ENABLED]);
        this.urlTemplateValue = syncData[K_URL_TEMPLATE_VALUE] || "";
        for (const [name, value] of Object.entries(this.config)) {
            document.querySelector<HTMLInputElement>(`[name="${name}"][value="${value}"]`).checked = true;
        }
        document.querySelector<HTMLAnchorElement>("a.head-copy-mode").dataset.batch = String(this.batch);
    }

    /** @private */
    registerEvents() {
        const link = document.querySelector<HTMLInputElement>(`[name="clip"][value="4"]`);
        const copy = document.querySelector<HTMLAnchorElement>("a.head-copy-mode");

        copy.addEventListener("click", (e) => {
            this.batch = !this.batch;
            copy.dataset.batch = String(this.batch);
            this.renderCopyMode();
        });

        this.linker.addEventListener("input", (e) => {
            WeiboConfig.clipMapping[4] = this.linker.value;
            this.renderClipSize();
            chrome.storage.local.set({
                [K_WEIBO_CLIP_VALUE]: this.linker.value,
            });
        });

        this.linker.addEventListener("focus", (e) => {
            if (!link.checked) {
                link.checked = true;
            }
            if (this.config.clip !== link.value) {
                this.config.clip = link.value as WeiboClipKey;
            }
        });

        for (const name of Object.keys(this.config)) {
            const nodeList = document.querySelectorAll(`[name="${name}"]`);
            for (const node of nodeList) {
                node.addEventListener("change", <K extends keyof WeiboConfigType>(e: Event) => {
                    const target = e.target as HTMLInputElement;
                    if (target.checked) {
                        this.config[name as K] = target.value as WeiboConfigType[K];
                    }
                });
            }
        }

        this.copyEventHandler();
        this.pasteEventHandler();
    }

    /** @private */
    copyEventHandler() {
        document.addEventListener("click", (e) => {
            const target = e.target as HTMLElement;
            const buttonCopy = target.closest<HTMLElement>(".button-copy");

            if (buttonCopy) {
                const buffer: string[] = [];
                const type = buttonCopy.dataset.type as "URL" | "HTML" | "UBB" | "Markdown";
                const prev = document.activeElement as HTMLElement;

                if (this.batch) {
                    for (const hybrid of this.list.values()) {
                        const d = this.transformer(hybrid.data);
                        if (Array.isArray(d)) {
                            d.forEach((item) => buffer.push(item[type]));
                        } else {
                            buffer.push(d[type]);
                        }
                    }
                } else {
                    const section = buttonCopy.closest("section");
                    const d = this.transformer(this.list.get(section).data);
                    if (Array.isArray(d)) {
                        d.forEach((item) => buffer.push(item[type]));
                    } else {
                        buffer.push(d[type]);
                    }
                }

                this.copier.value = buffer.join("\n");
                this.copier.focus();
                this.copier.select();

                if (document.execCommand("copy")) {
                    // color for error: #F2355B
                    buttonCopy.animate(
                        [
                            { backgroundColor: "#00a1d6" },
                            { backgroundColor: "#0F2742", offset: 0.3 },
                            { backgroundColor: "#0F2742" },
                        ],
                        { duration: 500, easing: "ease", fill: "backwards" },
                    );
                } else {
                    chrome.notifications.create(this.nid, {
                        type: "basic",
                        iconUrl: chrome.i18n.getMessage("notify_icon"),
                        title: chrome.i18n.getMessage("warn_title"),
                        message: "操作失败：链接没有复制到剪切板中(lll￢ω￢)",
                    });
                }

                this.copier.blur();
                if (prev) {
                    prev.focus();
                }
            }
        });
    }

    /** @private */
    pasteEventHandler() {
        document.addEventListener("paste", (e) => {
            if (document.activeElement == null || document.activeElement === document.body) {
                const items = e.clipboardData.items;
                const queues: Promise<unknown>[] = [];
                const buffer: Blob[] = [];

                for (const item of items) {
                    if (item.kind === "file" && typeof item.getAsFile === "function") {
                        const file = item.getAsFile();
                        file && buffer.push(file);
                    }
                    if (item.kind === "string" && typeof item.getAsString === "function") {
                        queues.push(
                            new Promise((resolve, reject) => {
                                item.getAsString((str) => {
                                    const multiple = str.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
                                    const multipleBuffer = [];

                                    while (multiple.length) {
                                        const url = multiple.shift();
                                        if (Utils.isValidURL(url)) {
                                            multipleBuffer.push(
                                                fetchBlob(url)
                                                    .then((blob) => buffer.push(blob))
                                                    .catch(Utils.noop),
                                            );
                                        }
                                    }

                                    Promise.all(multipleBuffer).then(resolve);
                                });
                            }).catch(Utils.noop),
                        );
                    }
                }

                Promise.all(queues).then((result) => this.requester(buffer));
            }
        });
    }

    /**
     * @private
     * @param {PackedItem[]|PackedItem|void} data - No internal validation.
     *        `data.length` MUST be greater than 0 if data is array.
     *
     * @param {boolean} [clear]
     */
    renderSection(data?: WB.PackedItem | WB.PackedItem[], clear?: boolean): boolean {
        if (!data) {
            return false;
        }

        if (clear) {
            this.checkout.clear = false;
            this.clearCurrentList();
        }

        const sectionTable = new SectionTable(this.getLastItemFromList(this.transformer(data))).init();
        const hybrid: IHybridSectionData = { sectionTable, data };

        this.fillCopyMode(sectionTable.domNodes.section);
        this.list.set(sectionTable.domNodes.section, hybrid);
        this.main.append(sectionTable.domNodes.section);
        return true;
    }

    /** @private */
    renderScheme() {
        for (const hybrid of this.list.values()) {
            hybrid.sectionTable.repaint(this.getLastItemFromList(this.transformer(hybrid.data)));
        }
    }

    /** @private */
    renderClipSize() {
        for (const hybrid of this.list.values()) {
            hybrid.sectionTable.repaint(this.getLastItemFromList(this.transformer(hybrid.data)));
        }
    }

    /** @private */
    renderCopyMode() {
        for (const hybrid of this.list.values()) {
            this.fillCopyMode(hybrid.sectionTable.domNodes.section);
        }
    }

    /** @private */
    fillCopyMode(section: HTMLElement) {
        const nodeList = section.querySelectorAll(".button-copy");
        const textContent = this.batch ? "Copy All" : "Copy";
        for (const node of nodeList) {
            node.textContent = textContent;
        }
    }

    /**
     * @private
     * @param {PackedItem[]|PackedItem} item
     * @return {*|AssignedPackedItem}
     */
    transformer(item: WB.PackedItem | WB.PackedItem[]): WB.AssignedPackedItem | WB.AssignedPackedItem[] {
        if (Array.isArray(item)) {
            return item.map((d) => this.transformer(d)) as WB.AssignedPackedItem[];
        }
        if (!item || !item.pid) {
            return item as WB.AssignedPackedItem;
        }
        const scheme = WeiboConfig.schemeMapping[this.config.scheme];
        const suffix = PConfig.weiboSupportedTypes[item.mimeType].typo;

        // 优先使用全局URL模板
        const clip =
            this.urlTemplateEnabled && this.urlTemplateValue
                ? this.urlTemplateValue
                : WeiboConfig.clipMapping[this.config.clip];

        const url = Utils.genExternalUrl(scheme, clip, item.pid, suffix);
        const file = item.blob as File;
        const filename = Utils.getFilenameWithoutSuffix(file && file.name);
        const assignedPackedItem = Object.assign(item, {
            URL: url,
            HTML: `<img src="${url}" alt="${filename}">`,
            UBB: `[IMG]${url}[/IMG]`,
            Markdown: `![${filename}](${url})`,
        });
        if (item.width && item.height && clip === WeiboConfig.clipMapping[1]) {
            // prettier-ignore
            assignedPackedItem.HTML = `<img src="${url}" alt="${filename}" width="${item.width}" data-width="${item.width}" data-height="${item.height}">`;
        }
        return assignedPackedItem;
    }

    /**
     * @private
     * @param {*[]|AssignedPackedItem[]} items
     * @return {*|AssignedPackedItem}
     */
    getLastItemFromList(items: WB.AssignedPackedItem | WB.AssignedPackedItem[]): WB.AssignedPackedItem {
        if (Array.isArray(items)) {
            const d = items.slice(-1).pop();
            if (d && d.URL) {
                return Object.assign({}, d, {
                    URL: this.directorySymbol + d.URL,
                    HTML: this.directorySymbol + d.HTML,
                    UBB: this.directorySymbol + d.UBB,
                    Markdown: this.directorySymbol + d.Markdown,
                });
            } else {
                return d;
            }
        } else {
            return items;
        }
    }

    /** @private */
    clearCurrentList() {
        if (this.list.size) {
            for (const hybrid of this.list.values()) {
                hybrid.sectionTable.destroy();
            }
            this.list.clear();
        }
    }

    /**
     * @public
     * @param {ArrayLike<Blob|File>} blobs
     * @param {string} [fullDirectoryPath] - Non-empty string indicates that it is from a folder.
     */
    requester(blobs: ArrayLike<Blob>, fullDirectoryPath?: string) {
        if (blobs && blobs.length) {
            this.weiboUpload.addQueues(Array.from(blobs));
            if (fullDirectoryPath) {
                for (const blob of Array.from(blobs)) {
                    this.classifyMap.set(blob, fullDirectoryPath);
                }
            }
            if (this.checkout.clear) {
                this.weiboUpload.triggerIteration((it) => {
                    if (it.done) {
                        if (this.preStoreMap.size) {
                            for (const [fullDirectoryPath, preStore] of this.preStoreMap.entries()) {
                                this.renderSection(preStore, this.checkout.clear);
                            }
                        }
                        this.preStoreMap.clear();
                        this.classifyMap.clear();
                        this.checkout.clear = true;
                    } else {
                        if (this.classifyMap.has(it.value.blob)) {
                            const fullDirectoryPath = this.classifyMap.get(it.value.blob);
                            const preStore: IPreStore[] = this.preStoreMap.get(fullDirectoryPath) || [];
                            preStore.push(Object.assign({ fullDirectoryPath }, it.value));
                            this.preStoreMap.set(fullDirectoryPath, preStore);
                            this.classifyMap.delete(it.value.blob);
                            if (
                                Array.from(this.classifyMap.values()).every((path) => path !== fullDirectoryPath) &&
                                preStore.length
                            ) {
                                this.renderSection(preStore, this.checkout.clear);
                                this.preStoreMap.delete(fullDirectoryPath);
                            }
                        } else {
                            this.renderSection(it.value, this.checkout.clear);
                        }
                    }
                });
            }
        }
    }
}
