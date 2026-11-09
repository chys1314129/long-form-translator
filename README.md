# Lingua · 长文翻译助手

一个可纯静态托管的长文翻译工作台，基于 Next.js App Router + React 19。文本会被无损切分，由浏览器并发翻译多个片段；翻译中断后可以继续剩余片段或单独重试失败片段。

## 特性

- 无损切分：段落 → 换行 → 句子 → 空白，兜底才硬切，拼接后与原文完全一致
- 浏览器内 3 并发翻译，逐片段流式回填进度
- 停止 / 继续 / 重试失败片段，译文可复制、下载
- 历史记录保存在浏览器 `localStorage`，最多保留 50 条
- 所有 API Key 只存本机浏览器，不经过本项目的服务器
- 纯静态导出（`output: 'export'`），可直接部署到 GitHub Pages

## 本地开发

```bash
npm install
npm run dev
```

打开 http://localhost:3000 。生产构建与静态导出：

```bash
npm run build   # 输出到 out/
npx serve out   # 本地预览静态产物
```

如果部署在子路径下（例如 GitHub Pages 项目站 `https://<user>.github.io/<repo>/`），构建时指定前缀：

```bash
NEXT_PUBLIC_BASE_PATH=/<repo> npm run build
```

## 部署到 GitHub Pages

仓库已包含 `.github/workflows/deploy.yml`：推送到 `main` 后由 GitHub Actions 构建静态站点并发布到 GitHub Pages。

1. 仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。
2. 推送到 `main`（或在 **Actions** 里手动运行 `Deploy static site to GitHub Pages`）。
3. 构建完成后访问 `https://<user>.github.io/<repo>/`。

详细说明见 [DEPLOY.md](./DEPLOY.md)。

## 翻译引擎

| 引擎 | 说明 | 静态站可用性 |
| --- | --- | --- |
| 微软翻译 | Edge 公共接口，免费，无需密钥（默认） | 浏览器直连，已验证支持 CORS |
| MyMemory | 免费备用，无需密钥，匿名约 5,000 字符/天 | 浏览器直连，支持 CORS |
| 谷歌翻译 | 公共接口，免费，无需密钥 | 需网络可访问 Google；跨域不可用时请换引擎 |
| 百度翻译 | 使用自己的 APP ID + 密钥 | 百度接口通常不开放 CORS，可能被浏览器拦截 |
| 自定义大模型 | OpenAI 兼容 / Anthropic / Gemini，内置常用预设 | 取决于服务商是否允许浏览器直连 |

静态站没有后端代理，所有请求都由浏览器直接发往翻译服务商：因此接口必须支持 CORS，且密钥会随请求发往对应服务商。若某个引擎报“跨域/网络失败”，换一个引擎即可。

## 目录结构

```
src/app/page.tsx            主界面（客户端组件）
src/lib/chunk.ts            无损分片
src/lib/engines.ts          各翻译引擎调用与百度 MD5 签名
src/lib/translate-client.ts 浏览器端并发调度与事件回调
src/lib/languages.ts        语言列表
.github/workflows/deploy.yml GitHub Pages 自动部署
```

## 说明

本项目是静态版本：原服务端 `/api/translate` 与 Postgres 历史已移除，翻译调度改在浏览器执行，历史记录改用 `localStorage`。
