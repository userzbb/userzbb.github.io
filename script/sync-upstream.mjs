#!/usr/bin/env node
// sync-upstream.mjs — 合并上游 Momo 主题更新
//
// `pnpm momo update` 只跟踪 origin（自己的仓库），够不到真正的上游 Motues/Momo，
// 且它用的是 `git pull --ff-only`，本地一旦领先上游就会直接失败。
// 本脚本走完整的上游合并流程：
//
//   前置检查 → 存档分支 → fetch → merge → 冲突分流 → 验证 → 提示推送
//
// 这个文件是独立的、上游不存在的，因此永远不参与合并冲突。
import { capture, c, CliError, confirm, fail, git, log, parseArgs, ROOT, run } from './momo/lib.js'

const UPSTREAM_REMOTE = 'upstream'
const UPSTREAM_BRANCH = 'main'
const UPSTREAM_REF = `${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH}`

// 只有在「我们删了、上游改了」时才可以安全地保持删除。
// 若内容文件是「双方都改过」（UU），说明用户自己也动过，必须交给人处理。
const AUTO_RESOLVE_PREFIXES = ['src/content/']
const AUTO_RESOLVE_CODES = ['DU']

const USAGE = 'node script/sync-upstream.mjs [--dry-run] [--yes] [--no-verify] [--no-archive]'
const OPTIONS = {
  'dry-run': { type: 'boolean', desc: '只诊断上游差异与预测冲突，不做任何修改' },
  yes: { alias: 'y', type: 'boolean', desc: '跳过确认' },
  verify: { type: 'boolean', default: true, desc: '合并后运行 install 与 build 验证（--no-verify 关闭）' },
  archive: { type: 'boolean', default: true, desc: '合并前建存档分支（--no-archive 关闭）' },
}

// ---------------- 输出 ----------------

function printHelp() {
  log.raw(`\n${c.bold('sync-upstream')}  ${c.gray('合并上游 Momo 主题更新')}`)
  log.raw()
  log.raw(`${c.bold('用法')}  ${USAGE}`)
  log.raw()
  log.raw('流程：前置检查 → 存档分支 → git fetch → git merge → 冲突分流 → 验证 → 提示推送。')
  log.raw('内容文件的「我们删了/上游改了」冲突会自动保持删除；其余冲突一律停下交给人工处理。')
  log.raw()
  log.raw(c.bold('选项'))
  const rows = Object.entries(OPTIONS).map(([name, def]) => [
    def.type === 'string' ? `--${name} <value>` : `--${name}${def.alias ? `, -${def.alias}` : ''}`,
    def.desc ?? '',
  ])
  const width = Math.max(...rows.map(([l]) => l.length))
  for (const [left, desc] of rows) log.raw(`  ${left.padEnd(width + 2)}${desc}`)
  log.raw()
}

// ---------------- git 辅助 ----------------

/** git 命令失败时抛出可读错误（capture 失败返回 null，无法区分原因） */
function gitOrFail(args, hint) {
  const out = git(args)
  if (out === null) fail(`${hint ?? 'git 命令失败'}：git ${args.join(' ')}`)
  return out
}

const shortSha = (rev) => (rev ? rev.slice(0, 8) : '未知')

/** 读取 unmerged 文件的状态码，返回 { path, code }[] */
function unmergedEntries() {
  // core.quotepath=false 让中文路径不再被转义成 \xxx
  const raw = git(['-c', 'core.quotepath=false', 'status', '--porcelain']) ?? ''
  const out = []
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    const code = line.slice(0, 2)
    // 未合并状态：DD AU UD UA DU AA UU
    if (!/^(DD|AU|UD|UA|DU|AA|UU)$/.test(code)) continue
    let path = line.slice(3).trim()
    if (path.startsWith('"') && path.endsWith('"')) path = path.slice(1, -1)
    out.push({ path, code })
  }
  return out
}

const canAutoResolve = ({ path, code }) =>
  AUTO_RESOLVE_CODES.includes(code) && AUTO_RESOLVE_PREFIXES.some((p) => path.startsWith(p))

/**
 * 本次合并会碰到的文件（用于展示冲突面）。
 *
 * 分三类：内容文件（自己的文章）、代码/配置文件（需要人工合并的高危区）、
 * 其余（样式、组件等 —— 同样可能冲突，不能漏报）。
 */
function changeSummary(fromRef, toRef) {
  const names = git(['diff', '--name-only', fromRef, toRef]) ?? ''
  const files = names.split('\n').map((s) => s.trim()).filter(Boolean)

  const isConfig = (f) =>
    /^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|astro\.config\.mjs|svelte\.config\.js|tsconfig\.json|pagefind\.yml|src\/config\.ts|src\/content\.config\.ts)$/.test(f) ||
    /^src\/(i18n|types)\//.test(f)
  const isContent = (f) => /^src\/content\//.test(f)

  return {
    total: files.length,
    config: files.filter(isConfig),
    content: files.filter(isContent),
    other: files.filter((f) => !isConfig(f) && !isContent(f)),
  }
}

/**
 * 上游新增、而本地恰好存在同名未跟踪文件 —— git 会直接中止合并
 * （不覆盖本地文件，但也不会自动解决）。提前算出来，给出明确指引。
 */
function untrackedCollisions(fromRef, toRef) {
  const added = git(['diff', '--name-only', '--diff-filter=A', fromRef, toRef]) ?? ''
  const candidates = added.split('\n').map((s) => s.trim()).filter(Boolean)
  if (!candidates.length) return []
  const untracked = (git(['-c', 'core.quotepath=false', 'ls-files', '--others', '--exclude-standard']) ?? '')
    .split('\n').map((s) => s.trim()).filter(Boolean)
  const set = new Set(untracked)
  return candidates.filter((f) => set.has(f))
}

// ---------------- 主流程 ----------------

async function main({ flags }) {
  // 1) 前置检查
  if (!git(['rev-parse', '--git-dir'])) fail('当前目录不是 git 仓库')

  const branch = gitOrFail(['rev-parse', '--abbrev-ref', 'HEAD'], '无法确定当前分支')
  if (branch === 'HEAD') fail('当前处于游离 HEAD 状态，请先切换到分支')

  const remoteUrl = git(['remote', 'get-url', UPSTREAM_REMOTE])
  if (!remoteUrl) {
    fail(`未配置 ${UPSTREAM_REMOTE} remote。请先执行：\n` +
      `  git remote add ${UPSTREAM_REMOTE} https://github.com/Motues/Momo.git`)
  }

  log.title('同步上游')
  log.info(`分支：${c.bold(branch)}   上游：${c.dim(UPSTREAM_REF)}`)
  log.info(c.gray(`  ${remoteUrl}`))

  // 已跟踪文件的改动会让合并结果难以理解，直接中止。
  // 未跟踪文件不影响 merge（git 只在「上游恰好新增同名文件」时才拒绝），故不拦截，
  // 改由后面的 untrackedCollisions 预先检测并给出提示。
  const tracked = (git(['-c', 'core.quotepath=false', 'status', '--porcelain', '--untracked-files=no']) ?? '').trim()
  if (tracked) {
    fail('工作区有未提交的改动，请先提交后再运行本脚本。\n' +
      '（本脚本不会自动 stash —— 隐式藏起你的改动会让冲突难以理解）\n' +
      `当前改动：\n${tracked.split('\n').map((l) => `  ${l}`).join('\n')}`)
  }

  // 2) 获取上游
  log.raw()
  log.step('获取上游提交…')
  const fetchCode = run('git', ['fetch', UPSTREAM_REMOTE], { quiet: true, allowFail: true })
  if (fetchCode !== 0) fail(`无法从 ${UPSTREAM_REMOTE} 获取更新，请检查网络与 remote 配置`)

  const head = gitOrFail(['rev-parse', 'HEAD'], '无法解析当前 HEAD')
  const upstreamRev = git(['rev-parse', UPSTREAM_REF])
  if (!upstreamRev) fail(`无法解析 ${UPSTREAM_REF}`)

  const behind = Number(git(['rev-list', '--count', `${head}..${upstreamRev}`]) ?? 0)
  const ahead = Number(git(['rev-list', '--count', `${upstreamRev}..${head}`]) ?? 0)

  if (behind === 0) {
    log.raw()
    log.ok(ahead > 0 ? `已是最新（本地领先上游 ${ahead} 个提交）` : '已是最新，无需同步')
    return
  }

  log.info(`上游有 ${c.bold(String(behind))} 个新提交（本地领先 ${ahead} 个）：`)
  const commits = (git(['log', '--oneline', '--no-decorate', '-n', '10', `${head}..${upstreamRev}`]) ?? '').split('\n')
  for (const line of commits.filter(Boolean)) log.info(`  ${c.gray(line)}`)
  if (behind > commits.filter(Boolean).length) log.info(c.gray(`  …还有 ${behind - commits.filter(Boolean).length} 个提交`))

  const summary = changeSummary(head, upstreamRev)
  log.raw()
  log.info(`改动 ${c.bold(String(summary.total))} 个文件：` +
    `代码/配置 ${summary.config.length} 个，内容 ${summary.content.length} 个，其他 ${summary.other.length} 个`)

  // 代码/配置/其他都可能与本地改动重叠而冲突 —— 全部列出，不能只报「配置」那一类
  const risky = [...summary.config, ...summary.other]
  for (const f of risky.slice(0, 10)) log.info(`  ${c.yellow('⚠')} ${f}`)
  if (risky.length > 10) log.info(c.gray(`  …另有 ${risky.length - 10} 个文件`))
  if (risky.length) {
    log.info(c.gray('  这些文件若与本地改动重叠，需要人工合并'))
  }

  const collisions = untrackedCollisions(head, upstreamRev)
  if (collisions.length) {
    log.raw()
    log.warn(`有 ${collisions.length} 个文件上游新增，但本地存在同名未跟踪文件，git 会中止合并：`)
    for (const f of collisions) log.info(`  ${c.yellow('•')} ${f}`)
    log.info(c.gray('  请先改名或删除本地这些文件（或加入 .gitignore），再运行本脚本。'))
    log.info(c.gray('  你的文件不会被自动覆盖。'))
    process.exitCode = 1
    return
  }

  if (flags['dry-run']) {
    log.raw()
    log.dim('（--dry-run：未做任何修改）')
    return
  }

  if (!flags.yes) {
    log.raw()
    if (!(await confirm(`确认合并 ${UPSTREAM_REF} 到 ${branch}？`, { default: true }))) {
      log.dim('已取消')
      return
    }
  }

  // 3) 存档分支
  let archiveRef = null
  if (flags.archive) {
    log.raw()
    log.step('创建存档分支…')
    const stamp = new Date().toISOString().slice(0, 10)
    archiveRef = `upstream-sync/${stamp}`
    for (let i = 2; git(['rev-parse', '--verify', '--quiet', `refs/heads/${archiveRef}`]) && i < 100; i++) {
      archiveRef = `upstream-sync/${stamp}-${i}`
    }
    gitOrFail(['branch', archiveRef, head], '创建存档分支失败')
    log.ok(`已存档到 ${c.bold(archiveRef)} ${c.gray(`@ ${shortSha(head)}`)}`)
    log.info(c.gray(`回滚：git reset --hard ${archiveRef}`))
  }

  // 4) 合并
  log.raw()
  log.step(`合并 ${UPSTREAM_REF}…`)
  // 不能用 --ff-only：本地领先上游时它必然失败
  const mergeCode = run('git', ['merge', '--no-edit', UPSTREAM_REF], { allowFail: true })

  if (mergeCode === 0) {
    log.ok('合并完成，无冲突')
  } else {
    const conflicts = unmergedEntries()
    if (!conflicts.length) {
      log.raw()
      log.fail('合并失败，但没有检测到冲突文件，请手动排查：')
      log.info(c.gray(`  git status`))
      if (archiveRef) log.info(c.gray(`  回滚：git reset --hard ${archiveRef}`))
      process.exitCode = 1
      return
    }

    const auto = conflicts.filter(canAutoResolve)
    const manual = conflicts.filter((x) => !canAutoResolve(x))

    log.warn(`合并产生 ${conflicts.length} 个冲突`)

    if (auto.length) {
      log.raw()
      log.step(`自动保持删除（我们删了 / 上游改了）：${auto.length} 个`)
      for (const { path } of auto) {
        const code = run('git', ['rm', '--force', '--quiet', path], { allowFail: true, quiet: true })
        if (code === 0) log.info(`  ${c.green('✓')} ${path}`)
        else log.info(`  ${c.red('✗')} ${path} ${c.gray('（自动处理失败）')}`)
      }
    }

    // 处理完自动部分后重新检查
    const remaining = unmergedEntries()
    if (remaining.length) {
      log.raw()
      log.warn(`仍有 ${remaining.length} 个冲突需要人工处理：`)
      for (const { path, code } of remaining) {
        const label = code === 'UU' ? '双方都改过' : code === 'DU' ? '我们删了/上游改了' : code
        log.info(`  ${c.yellow('•')} ${path} ${c.gray(`(${label})`)}`)
      }
      log.raw()
      log.info(c.bold('处理建议：'))
      log.info('  保留本地版本：  git checkout --ours <file> && git add <file>')
      log.info('  采用上游版本：  git checkout --theirs <file> && git add <file>')
      log.info('  保留删除：      git rm --force <file>')
      log.info('  手工编辑后：    git add <file>')
      log.raw()
      log.info(`全部解决后执行 ${c.bold('git commit --no-edit')} 完成合并，再运行 ${c.bold('pnpm install && pnpm build')} 验证。`)
      if (archiveRef) log.info(c.gray(`放弃本次合并：git merge --abort && git reset --hard ${archiveRef}`))
      process.exitCode = 1
      return
    }

    log.raw()
    log.step('提交合并结果…')
    const commitCode = run('git', ['commit', '--no-edit'], { allowFail: true })
    if (commitCode !== 0) {
      log.fail('提交合并结果失败，请手动执行 git commit')
      if (archiveRef) log.info(c.gray(`回滚：git reset --hard ${archiveRef}`))
      process.exitCode = 1
      return
    }
    log.ok('合并完成')
  }

  const merged = git(['rev-parse', 'HEAD'])

  // 5) 验证
  if (flags.verify) {
    log.raw()
    log.title('验证')

    log.step('安装依赖（校验供应链策略）…')
    const installCode = run('pnpm', ['install', '--frozen-lockfile'], { allowFail: true })
    if (installCode === 0) log.ok('依赖安装通过')
    else log.warn('依赖安装失败，可能需要 pnpm clean --lockfile && pnpm install 重新解析')

    log.raw()
    log.step('构建…')
    const buildCode = run('pnpm', ['build'], { allowFail: true })
    if (buildCode === 0) log.ok('构建通过')
    else log.warn('构建失败，请检查上面的输出')

    if (installCode !== 0 || buildCode !== 0) {
      log.raw()
      log.warn('验证未全部通过。合并结果已保留，未自动回滚 —— 请修复后重新验证。')
      for (const cmd of ['git status', archiveRef && `git reset --hard ${archiveRef}`]) {
        if (cmd) log.info(c.gray(`  ${cmd}`))
      }
      process.exitCode = 1
      return
    }
  } else {
    log.raw()
    log.warn('已跳过验证（--no-verify），请手动执行 pnpm install && pnpm build')
  }

  // 6) 收尾
  log.raw()
  log.ok(`同步完成：${shortSha(head)} → ${shortSha(merged)}`)
  log.info(c.gray(`推送：git push origin ${branch}`))
  if (archiveRef) log.info(c.gray(`存档分支 ${archiveRef} 确认无误后可删除：git branch -D ${archiveRef}`))
}

try {
  const { flags } = parseArgs(process.argv.slice(2), OPTIONS)
  if (flags.help) {
    printHelp()
  } else {
    await main({ flags })
  }
} catch (error) {
  log.raw()
  if (error instanceof CliError) {
    log.fail(error.message)
  } else {
    log.fail(`执行出错：${error?.message ?? error}`)
    if (process.env.MOMO_DEBUG) console.error(error)
  }
  process.exitCode = 1
}
