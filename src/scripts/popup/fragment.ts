/*
 * Copyright (c) 2018 The Weibo-Picture-Store Authors. All rights reserved.
 * Use of this source code is governed by a MIT-style license that can be
 * found in the LICENSE file.
 */

import { Utils } from "../sharre/utils.js";

// language=HTML
const headHTML = `
    <div class="head-setting">
        <div class="head-network-protocol">
            <label title="使用http协议(全局)">
                <input type="radio" name="scheme" value="1">
                <span>http</span>
            </label>
            <label title="使用https协议(全局)">
                <input type="radio" name="scheme" value="2">
                <span>https</span>
            </label>
            <label title="使用相对协议(全局)">
                <input type="radio" name="scheme" value="3">
                <span>自适应</span>
            </label>
        </div>
        <div class="head-split-line"></div>
        <div class="head-clip">
            <label title="使用原始图片">
                <input type="radio" name="clip" value="1">
                <span>原图</span>
            </label>
            <label title="中等裁剪尺寸">
                <input type="radio" name="clip" value="2">
                <span>中等尺寸</span>
            </label>
            <label title="缩略图裁剪尺寸">
                <input type="radio" name="clip" value="3">
                <span>缩略图</span>
            </label>
            <label title="自定义裁剪尺寸">
                <input type="radio" name="clip" value="4">
                <input type="text" placeholder="自定义尺寸" spellcheck="false" autocomplete="off" class="custom-clip" id="custom-clip-input">
                <button type="button" class="custom-clip-dropdown" title="选择预设尺寸">
                    <i class="fa fa-caret-down"></i>
                </button>
                <div class="custom-clip-options" style="display: none;">
                    <div class="custom-clip-option" data-value="wap800">wap800 - 800 像素宽度原比例缩放</div>
                    <div class="custom-clip-option" data-value="wap720">wap720 - 720 像素宽度原比例缩放</div>
                    <div class="custom-clip-option" data-value="wap360">wap360 - 360 像素宽度原比例缩放</div>
                    <div class="custom-clip-option" data-value="wap240">wap240 - 240 像素宽度原比例缩放</div>
                    <div class="custom-clip-option" data-value="wap180">wap180 - 180 像素宽度原比例缩放</div>
                    <div class="custom-clip-option" data-value="wap50">wap50 - 50 像素宽度原比例缩放</div>
                    <div class="custom-clip-option" data-value="bmiddle">bmiddle - 440 像素宽度原比例缩放</div>
                    <div class="custom-clip-option" data-value="small">small - 200 像素宽度原比例缩放</div>
                    <div class="custom-clip-option" data-value="thumb300">thumb300 - 300 像素正方形裁剪</div>
                    <div class="custom-clip-option" data-value="thumb180">thumb180 - 180 像素正方形裁剪</div>
                    <div class="custom-clip-option" data-value="thumb150">thumb150 - 150 像素正方形裁剪</div>
                    <div class="custom-clip-option" data-value="square">square - 80 像素正方形裁剪</div>
                </div>
                <a
                  title="如何设置自定义尺寸或链接"
                  target="_blank"
                  href="https://github.com/Semibold/Weibo-Picture-Store/blob/master/docs/custom-clip.md"
                >
                  <i class="fa fa-info-circle"></i>
                </a>
            </label>
        </div>
    </div>
    <div class="head-feature">
        <a class="head-copy-mode" title="切换复制模式"><i class="fa fa-circle-o"></i><i class="fa fa-check-circle-o"></i></a>
        <a class="head-browsing-history" title="查看上传记录"><i class="fa fa-history"></i></a>
    </div>`;

// language=HTML
const footHTML = `
    <div class="foot-bottom">
        <i class="fa fa-angle-double-left"></i>
        <div class="foot-menu">
            <a href="${chrome.i18n.getMessage("project_issue")}" target="_blank" title="通过GitHub反馈问题">GitHub</a>
            <a href="mailto:${chrome.i18n.getMessage("author_email")}" title="通过电子邮件反馈问题">反馈</a>
            <a href="${chrome.i18n.getMessage(
                "project_donate",
            )}" target="_blank" title="扩展很棒，捐赠以表支持 +1s">捐赠</a>
            <a href="${chrome.i18n.getMessage(
                "project_readme",
            )}" target="_blank" title="操作指南及更新日志">更新日志</a>
        </div>
    </div>`;

document.getElementById("head").append(Utils.parseHTML(headHTML));
document.getElementById("foot").append(Utils.parseHTML(footHTML));

/**
 * 初始化自定义尺寸输入功能
 * 实现不进行自动筛选的下拉选择器
 * @private
 */
function initCustomClipInput(): void {
    const input = document.getElementById("custom-clip-input") as HTMLInputElement;
    const dropdown = document.querySelector(".custom-clip-dropdown") as HTMLButtonElement;
    const options = document.querySelector(".custom-clip-options") as HTMLDivElement;
    const optionItems = document.querySelectorAll(".custom-clip-option") as NodeListOf<HTMLDivElement>;

    if (!input || !dropdown || !options) return;

    // 切换下拉菜单显示/隐藏
    dropdown.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const isVisible = options.style.display !== "none";
        options.style.display = isVisible ? "none" : "block";
    });

    // 选择预设选项
    optionItems.forEach((item) => {
        item.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const value = item.getAttribute("data-value");
            if (value) {
                input.value = value;
                options.style.display = "none";
                // 触发input事件，通知其他组件值已改变
                input.dispatchEvent(new Event("input", { bubbles: true }));
            }
        });
    });

    // 点击其他地方关闭下拉菜单
    document.addEventListener("click", () => {
        options.style.display = "none";
    });

    // 阻止点击输入框和选项区域时关闭菜单
    input.addEventListener("click", (e) => {
        e.stopPropagation();
    });

    options.addEventListener("click", (e) => {
        e.stopPropagation();
    });
}

// 初始化自定义尺寸输入功能
initCustomClipInput();
