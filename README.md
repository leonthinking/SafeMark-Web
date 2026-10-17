# SafeMark Web

[在线使用 SafeMark](https://safemark-web.vercel.app)

浏览器本地图片水印工具。选择图片、调整文字水印、下载 PNG/JPEG，全过程在浏览器中完成。

本项目是独立的网页版，不修改 [SafeMark iOS 开源项目](https://github.com/leonthinking/SafeMark-OpenSource)。代码、图标和内置示例插画均按 MIT 许可证提供。

## 功能

- 选择或拖入一张 JPG、PNG、静态 WebP 图片。
- 实时预览、原图对比、平铺/单个水印、预设文字。
- 调整字号、不透明度、颜色、角度、间距，单个水印支持上/中/下位置。
- 原始像素尺寸导出 PNG 或 JPEG；JPEG 使用 92% 编码质量，并将透明区域填为白色。
- 响应式布局、键盘操作、明确的文件与解码错误提示。

单张上限为 25 MiB、2400 万像素、最长边 8192 px。暂不支持 HEIC、GIF、SVG 和动画 WebP。浏览器内存不足仍可能导致解码/导出失败，请减小图片。动画 PNG 会被浏览器作为静态帧绘制，导出不保留动画。颜色配置、EXIF 与原始编码元数据不会原样保留；这不是无损图片编辑器。极端字号或多行水印会使用有界临时画布采样，可能降低文字锐度。

## 隐私架构

线上只有 `public/` 下的静态资源，没有后端、图片上传接口、账号系统、第三方统计、广告或远程字体。图片与水印文字仅存在于页面内存，不使用 Cookie、localStorage、sessionStorage 或 IndexedDB 存储。文件名不会发送到服务器。

`vercel.json` 与 HTML 设置内容安全策略，包括 `connect-src 'none'`、`form-action 'none'` 和仅允许本地/同源图片资源。选图前先检查格式和尺寸，再通过 Blob URL 在浏览器内解码，Canvas 绘制后下载。本应用不保存编辑内容，重新加载后恢复默认；浏览器自行管理标签页和会话恢复。网页加载后可断网编辑与导出，首次打开或刷新仍需要网络。

访问静态网页本身会向 Vercel 产生正常 HTTP 请求，托管服务仍可能记录 IP、请求时间等常规日志。点击 GitHub 链接会打开外部网站。本应用不把用户图片、文字或文件名附加到这些请求中。

## 本地运行与测试

Node.js 20 或更新版本：

```sh
npm run dev
# 打开 http://127.0.0.1:4173

npm ci
npm test
npx playwright install chromium webkit
npm run test:browser
```

运行和部署不需要安装依赖；Playwright 仅用于开发测试。浏览器测试覆盖断网编辑/导出、无新增网络请求、无持久化存储、输出尺寸/透明度/水印像素、格式错误处理和移动布局。

## Vercel

连接本仓库，Framework Preset 选 Other。`vercel.json` 已设置无需构建与安装、仅发布 `public/`，并设置安全响应头。或者使用已登录的 Vercel CLI：

```sh
vercel link
vercel --prod
vercel git connect
```

不要添加图片上传接口、分析 SDK 或外部字体，否则需要重新审查隐私说明和网络行为。修改配置后也应核对生产环境的 CSP。Fork 后请替换 `public/index.html` 中的源码与反馈链接。

## 反馈

[提交问题](https://github.com/leonthinking/SafeMark-Web/issues)。请仅使用合成测试图片，勿在 Issue 中附带敏感资料。

水印只用于说明图片用途，不能保证防复制或防篡改。
