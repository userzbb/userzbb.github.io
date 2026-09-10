// update.js — pnpm momo update：拉取仓库更新并同步依赖
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  CONFIG_PATHS,
  c,
  confirm,
  fail,
  fromRoot,
  git,
  gitInfo,
  log,
  pathExists,
  run,
  runPnpm,
} from '../lib.js'
import backupCommand from './backup.js'

const short = (rev) => (rev ? rev.slice(0, 8) : '未知')

/** 读取某个提交上的 package.json 版本号 */
function versionAt(rev) {
  const raw = git(['show', `${rev}:package.json`])
  if (!raw) return null
  try {
    return JSON.parse(raw).version ?? null
  } catch {
    return null
  }
}

/** 从更新指南里截取对应版本的说明 */
async function releaseNotes(version) {
  if (!version) return null
  const text = await readFile(fromRoot('doc/release_zh-cn.md'), 'utf8').catch(() => null)
  if (!text) return null
  const lines = text.split(/\r?\n/)
  const pattern = new RegExp(`^###\\s+v?${version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`)
  const start = lines.findIndex((line) => pattern.test(line))
  if (start < 0) return null
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,3}\s/.test(lines[i])) {
      end = i
      break
    }
  }
  return lines.slice(start, end).join('\n').trim()
}

/** 判断文件是否属于「配置文件」，升级后可能需要手工合并 */
function isConfigFile(file) {
  return CONFIG_PATHS.some((p) => file === p || file.startsWith(`${p}/`))
}

export default {
  name: 'update',
  summary: '拉取远端更新并同步依赖（更新前自动备份 src/config.ts）',
  usage: 'pnpm momo update [--dry-run] [--stash] [--rebase] [--no-backup] [--no-install]',
  details: [
    '流程：备份 src/config.ts → git fetch → 快进合并 → pnpm install → 提示需要手工合并的配置文件。',
    '工作区有未提交改动时会中止，可用 --stash 自动暂存（更新完自动恢复）。',
  ].join('\n'),
  options: {
    'dry-run': { type: 'boolean', desc: '只检查远端是否有更新，不做任何修改' },
    stash: { type: 'boolean', desc: '工作区有改动时自动 git stash，更新后恢复' },
    rebase: { type: 'boolean', desc: '本地有提交时用 git pull --rebase 变基' },
    force: { type: 'boolean', desc: '忽略未提交的改动直接更新（有覆盖风险）' },
    backup: { type: 'boolean', default: true, desc: '更新前自动备份配置（--no-backup 关闭）' },
    install: { type: 'boolean', default: true, desc: '更新后自动 pnpm install（--no-install 关闭）' },
    yes: { alias: 'y', type: 'boolean', desc: '跳过确认' },
  },

  async run({ flags }) {
    if (!(await pathExists(fromRoot('.git'))) || !gitInfo()) {
      fail('当前目录不是 git 仓库，无法自动更新')
    }

    const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'])
    if (!branch || branch === 'HEAD') fail('当前处于游离 HEAD 状态，请先切换到分支再更新')

    // 上游分支：优先使用已配置的上游，否则退回 origin/<branch>
    let upstream = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])
    if (!upstream) {
      const guess = `origin/${branch}`
      if (!git(['rev-parse', '--verify', '--quiet', `refs/remotes/${guess}`])) {
        fail(`分支 ${branch} 没有上游分支，请先执行：git push -u origin ${branch}`)
      }
      upstream = guess
    }
    const remote = upstream.split('/')[0]

    log.title('检查更新')
    log.info(`分支：${c.bold(branch)}  上游：${c.gray(upstream)}`)

    run('git', ['fetch', '--prune', remote], { quiet: true })
    log.info(c.gray(`已获取远端最新提交`))

    const before = git(['rev-parse', 'HEAD'])
    const after = git(['rev-parse', upstream])
    if (!after) fail(`无法解析上游分支 ${upstream}`)

    const behind = Number(git(['rev-list', '--count', `${before}..${after}`]) ?? 0)
    const ahead = Number(git(['rev-list', '--count', `${after}..${before}`]) ?? 0)

    if (behind === 0) {
      log.raw()
      log.ok(ahead > 0 ? `已是最新（本地领先远端 ${ahead} 个提交）` : '已是最新，无需更新')
      return
    }

    log.raw()
    log.info(`远端有 ${c.bold(String(behind))} 个新提交（本地领先 ${ahead} 个）：`)
    const commits = (git(['log', '--oneline', '--no-decorate', '-n', '15', `${before}..${after}`]) ?? '').split('\n')
    for (const line of commits) log.info(`  ${c.gray(line)}`)
    if (behind > commits.length) log.info(c.gray(`  …还有 ${behind - commits.length} 个提交`))

    const oldVersion = versionAt(before)
    const newVersion = versionAt(after)
    if (newVersion && oldVersion !== newVersion) {
      log.raw()
      log.info(`版本变化：${c.yellow(oldVersion ?? '未知')} → ${c.green(newVersion)}`)
    }

    if (ahead > 0 && !flags.rebase) {
      log.raw()
      fail('本地与远端都有新提交（历史分叉），请先处理：\n' +
        '  git pull --rebase   （推荐）\n' +
        '  或使用 pnpm momo update --rebase')
    }

    if (flags['dry-run']) {
      log.raw()
      log.dim('（--dry-run：未做任何修改）')
      return
    }

    // 工作区改动：默认中止，--stash 自动暂存，--force 忽略
    const dirty = (git(['status', '--porcelain']) ?? '') !== ''
    let stashed = false
    if (dirty) {
      if (flags.stash) {
        log.raw()
        log.step('工作区有改动，暂存中…')
        run('git', ['stash', 'push', '--include-untracked', '-m', `momo update ${new Date().toISOString()}`])
        stashed = true
      } else if (!flags.force) {
        log.raw()
        fail('工作区有未提交的改动，请先提交，或使用：\n' +
          '  pnpm momo update --stash   自动暂存并在更新后恢复\n' +
          '  pnpm momo update --force   忽略改动直接更新（有风险）')
      }
    }

    if (!flags.yes) {
      log.raw()
      const ok = await confirm(`确认更新到 ${short(after)}？`, { default: true })
      if (!ok) {
        if (stashed) run('git', ['stash', 'pop'], { allowFail: true })
        log.dim('已取消')
        return
      }
    }

    // 1) 更新前备份配置（默认只备份用户自己修改的 src/config.ts）
    if (flags.backup) {
      log.raw()
      log.step('备份 src/config.ts…')
      // out/name 传 undefined 以使用 backup 命令的默认值
      await backupCommand.run({
        flags: { all: false, config: false, list: false, name: undefined, out: undefined },
      })
    }

    // 2) 拉取更新
    log.raw()
    log.step('拉取更新…')
    run('git', ['pull', ...(flags.rebase ? ['--rebase'] : ['--ff-only']), remote, branch])

    const pulled = git(['rev-parse', 'HEAD'])
    log.ok(`已更新到 ${short(pulled)}`)

    // 3) 同步依赖
    if (flags.install) {
      log.raw()
      log.step('安装依赖…')
      runPnpm(['install'])
      log.ok('依赖已同步')
    } else {
      log.warn('已跳过 pnpm install（--no-install），依赖可能不一致')
    }

    // 4) 提示需要手工合并的配置文件
    const changed = (git(['diff', '--name-only', before, pulled]) ?? '').split('\n').filter(Boolean)
    const configChanged = changed.filter(isConfigFile)
    if (configChanged.length) {
      log.raw()
      log.warn(`本次更新改动了 ${configChanged.length} 个配置文件，可能需要按更新说明手工合并：`)
      for (const file of configChanged) log.info(`  ${c.yellow('•')} ${file}`)
      log.info(c.gray('参考 doc/release_zh-cn.md，或执行 pnpm momo restore 回滚更新前的 src/config.ts'))
    }

    const notes = await releaseNotes(newVersion)
    if (notes && newVersion !== oldVersion) {
      log.raw()
      log.title(`更新说明 ${newVersion}`)
      log.raw(notes)
    }

    // 5) 恢复暂存的改动
    if (stashed) {
      log.raw()
      log.step('恢复暂存的改动…')
      const status = run('git', ['stash', 'pop'], { allowFail: true })
      if (status !== 0) {
        log.warn('恢复暂存失败（可能有冲突），改动仍保存在 git stash 中，请手动处理：git stash list')
      } else {
        log.ok('已恢复暂存改动')
      }
    }

    log.raw()
    log.ok(`更新完成：${short(before)} → ${short(pulled)}`)
    log.info(c.gray('可执行 pnpm build 验证构建，或 pnpm dev 本地预览'))
  },
}
