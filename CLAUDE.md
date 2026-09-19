# CLAUDE.md

个人博客：Momo 主题（Astro）+ 本地 CMS。上游仓库为 `Motues/Momo`。

## 环境

- Node.js **>= 22**（CI 用 24 LTS）
- pnpm **12.x**（`deploy.yml` 固定 `version: 12`，与本地保持一致）

> **不要降级到 pnpm 11。** 见下方「供应链策略」。

## 供应链策略（接手 PR 时最重要的一点）

pnpm 12 默认启用 `minimumReleaseAge`：**lockfile 里任何包的版本，如果发布时间在 cutoff 之内，`pnpm install` 会直接报错退出**。pnpm 11 没有这条策略。

典型的 CI 失败长这样：

```
[ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION] 6 lockfile entries failed verification:
  svelte@5.57.1 was published at 2026-09-18T23:51:08.000Z, within the minimumReleaseAge cutoff (...)
✗ Lockfile failed supply-chain policy check (638 entries in 4.7s)
```

**成因**：贡献者在本地生成 lockfile 时，把刚发布几小时的版本写了进去。他本地没配策略所以能装，CI 上就被拦。

**处理**：在本仓库重新解析，让 pnpm 自动回退到符合策略的版本：

```bash
pnpm clean --lockfile && pnpm install
```

新版比旧版**低**是预期结果，不是错误 —— 说明策略生效了。不要为了「升版本」去放宽策略。

**验证**（与 CI 完全相同的检查路径，改动 lockfile 后必须跑）：

```bash
pnpm install --frozen-lockfile
# 期望：✓ Lockfile passes supply-chain policies
```

### 接手 PR 的检查清单

1. 先跑 `pnpm install --frozen-lockfile`。失败就先按上面的方式重新解析再提交。
2. **区分失败原因**：供应链策略失败是 lockfile 里**个别包版本太新**，与依赖图无关。不要因为报错就回退 PR 的功能改动 —— 两者不相干。
3. 建议让贡献者**不要提交 `pnpm-lock.yaml`**，由维护者在本仓库统一生成。
4. 排查时可以先确认上游状态，避免误判为冲突：

```bash
git log -1 --format='%h %ad %s' --date=short upstream/main
git merge-base --is-ancestor upstream/main HEAD && echo "可 fast-forward，无冲突"
```

## 命令

| 指令 | 作用 |
| --- | --- |
| `pnpm install` | 安装依赖 |
| `pnpm dev` | 开发服务器，`http://localhost:4321` |
| `pnpm build` | 构建到 `dist/`（含 pagefind 搜索索引） |
| `pnpm preview` | 预览构建产物 |
| `pnpm cms` | 本地 CMS 后台，`http://localhost:5188` |
| `pnpm momo <cmd>` | 备份/恢复/更新/新建文章等，见 `pnpm momo --help` |

## 约定

- 站点信息、主题开关、多语言配置集中在 `src/config.ts`。
- 提交前跑 `pnpm build`，确认退出码为 0。
- 仓库内含上游 `upstream` remote（`Motues/Momo`）。更新主题优先用 `pnpm momo update`，它会先备份 `src/config.ts`。
