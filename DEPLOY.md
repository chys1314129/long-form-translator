# 用 GitHub Actions 发布为静态网站

本项目已配置 `output: 'export'`，构建产物 `out/` 是纯静态文件，由 `.github/workflows/deploy.yml` 自动发布到 GitHub Pages。

## 一次性设置

1. 新建一个公开仓库并把代码推送到 `main` 分支。
2. 打开仓库 **Settings → Pages**，把 **Build and deployment → Source** 设为 **GitHub Actions**。
3. 仓库 **Settings → Actions → General → Workflow permissions** 保持默认的读取权限即可；工作流自身声明了 `pages: write` 与 `id-token: write`。

## 自动部署

- 每次推送到 `main` 都会触发构建与部署。
- 也可以在 **Actions → Deploy static site to GitHub Pages → Run workflow** 手动运行。
- 站点地址：`https://<user>.github.io/<repo>/`（工作流会自动把 `/<repo>` 设为 `NEXT_PUBLIC_BASE_PATH`）。
- 若仓库名是 `<user>.github.io`，工作流会自动使用空 basePath，站点位于根路径。

## 自定义域名

在 **Settings → Pages → Custom domain** 填写域名，并添加一条 CNAME 记录。此时站点位于根路径，无需修改构建配置。

## 构建细节

- `npm ci` 安装依赖，`npm run build` 执行 Next.js 静态导出，产物在 `out/`。
- `public/.nojekyll` 会被复制进产物，避免 GitHub Pages 的 Jekyll 处理。
- 历史记录保存在浏览器 `localStorage`，不需要数据库，也不需要任何服务端环境变量。
- 翻译请求由浏览器直接发往各服务商。百度接口通常不返回 CORS 头，静态站上可能不可用；微软、MyMemory 已验证可用，谷歌需要用户网络能访问 Google。
