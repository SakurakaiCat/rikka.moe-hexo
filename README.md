# rikka.moe-hexo

[rikka.moe](https://rikka.moe) —— Akari 的个人博客：写一点字，留一点光。

基于 [Hexo 8](https://hexo.io) 与 [Cupertino 主题](https://github.com/MrWillCom/hexo-theme-cupertino)（vendored 于 `themes/cupertino/`），另含一套自托管 Node API：签名簿、访问统计、赞助墙、付费书籍下载、NASA APOD 背景图。

## 目录结构

```
├── _config.yml           # Hexo 站点配置
├── _config.cupertino.yml # 主题覆盖配置（hero、插入脚本、APOD 背景等）
├── source/               # 内容：文章、页面、静态资源
│   ├── zh-cn/ zh-tw/ en/ ja/   # 四个语言版本
│   └── _posts/             # 文章（articles / thoughts / gallery）
├── api/                  # Node API（node:http + better-sqlite3）
│   ├── migrations/       # SQL 迁移，启动时按文件名顺序自动应用
│   └── lib/              # 业务实现（guestbook / analytics / afdian / md5）
├── scripts/              # Hexo 扩展：多语言首页与归档、sitemap、按语言隔离的 Atom feed
├── tools/                # 运维脚本：deploy.sh（发布）、api-preview.sh（本地联调）
├── themes/cupertino/     # 主题（vendored 副本，非 submodule）
└── .github/              # Dependabot（npm 生态，根目录）
```

## 语言版本

站点按 `source/zh-cn|zh-tw|en|ja` 生成各自独立的首页、归档、分类与标签页（`scripts/generators.js`）；Atom feed（`scripts/feeds.js`）与 sitemap（`scripts/sitemap.js`）同样按语言隔离，feed 不混排语言，sitemap 带 hreflang 交替链接。

## 本地开发

要求 Node.js ≥ 22。

```bash
npm install
npm run api:build     # esbuild 打包 api/index.ts → api/dist/index.mjs
npm run api:start     # 启动 API（默认 127.0.0.1:18080）
npx hexo server       # 本地站点预览
```

`tools/api-preview.sh` 用仓库内构建产物在 `0.0.0.0:18081` 启动 API，供本地站点联调，不影响生产服务（`PREVIEW_*` 环境变量优先于 `PORT/HOST`）。

## API 环境变量

所有凭据一律经环境变量注入，**仓库内不保存任何密钥**。生产环境的主机 env 文件位于 `/opt/rikka/blog.env`；同名变量已注册为本仓库的 GitHub Actions Secrets，供 CI 使用。

| 变量 | 用途 | 说明 |
| --- | --- | --- |
| `PORT` / `HOST` | 监听地址 | 默认 `18080` / `127.0.0.1` |
| `DB_PATH` | SQLite 数据库路径 | 默认 `./data/rikka.db` |
| `MIGRATIONS_DIR` | 迁移目录 | 默认 `api/migrations` |
| `NASA_API_KEY` | [NASA APOD](https://api.nasa.gov) 背景图 | 未设置时 `/api/nasa-apod` 返回 `not_configured` |
| `GUESTBOOK_HASH_SALT` | 签名簿访客指纹（IP/UA）SHA-256 盐 | 生产必须设置；缺失时回退到弱内置盐 |
| `ANALYTICS_HASH_SALT` | 访问统计哈希盐 | 同上，可回退为 `GUESTBOOK_HASH_SALT` |
| `AIFADIAN_API_TOKEN` / `AIFADIAN_USER_ID` | [爱发电](https://afdian.com) 赞助墙 | 兼容 `AFDIAN_*`、`api_token` 等历史别名；未设置时赞助端点返回 `not_configured` |
| `SIGNING_SECRET`（或 `BOOK_KEYS`） | 付费书籍下载令牌（`ts:md5` 签名，30 分钟有效） | 使用书籍功能时必须设置 |
| `PREMIUM_DOWNLOAD_URL` | 付费书籍下载直链 | 使用书籍功能时必须设置 |

数据库为 SQLite（`better-sqlite3`，经 `api/d1.ts` 的 D1 兼容适配层访问），迁移在启动时幂等执行。`data/` 目录含访客数据（签名簿留言、统计），已被 `.gitignore` 排除，**勿提交**。

## 部署

`tools/deploy.sh`：`hexo clean && hexo generate` 后 rsync 到 webroot（默认 `/var/www/rikka.moe`），上一版构建保留为 `WEBROOT.prev`，回滚即两次 `mv`；nginx 直接读目录，无需 reload。API 为独立的 systemd 服务（端口 18080），随 nginx 同域反代到 `/api`。

## 许可

站点内容采用 [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/)。
