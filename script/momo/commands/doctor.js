// doctor.js — pnpm momo doctor：检查本地环境与项目状态
import {
  CONFIG_PATHS,
  c,
  formatBytes,
  fromRoot,
  gitInfo,
  hasCommand,
  listFiles,
  log,
  pathExists,
  pathSize,
  pnpmVersion,
  readJson,
} from '../lib.js'

// Astro 7 要求 Node >= 22（见 doc/release_zh-cn.md 的 26.8.15 说明）
const MIN_NODE_MAJOR = 22
const LANGS = ['zh-cn', 'en']

/** 统计博客文章（按文件夹分组，与 CMS 一致） */
async function countArticles() {
  const base = fromRoot('src/content/blog')
  if (!(await pathExists(base))) return { articles: 0, files: 0, bytes: 0 }
  const files = (await listFiles(base)).filter((f) => {
    const lang = f.split(/[\\/]/).pop().replace(/\.md$/, '')
    return f.endsWith('.md') && LANGS.includes(lang)
  })
  const paths = new Set(files.map((f) => f.slice(base.length).replace(/\\/g, '/').replace(/\/[^/]+\.md$/, '')))
  return { articles: paths.size, files: files.length, bytes: await pathSize(base) }
}

export default {
  name: 'doctor',
  summary: '检查环境、依赖与项目状态',
  usage: 'pnpm momo doctor',
  options: {},

  async run() {
    const checks = []
    const add = (level, title, detail = '') => checks.push({ level, title, detail })

    // Node
    const nodeMajor = Number(process.versions.node.split('.')[0])
    if (nodeMajor >= MIN_NODE_MAJOR) add('ok', `Node.js ${process.version}`)
    else add('fail', `Node.js ${process.version} 过低`, `需要 >= ${MIN_NODE_MAJOR}（Astro 7 要求）`)

    // pnpm
    const pnpm = pnpmVersion()
    if (pnpm) add('ok', `pnpm ${pnpm}`)
    else add('warn', '未检测到 pnpm', '执行 npm install -g pnpm 安装')

    // 依赖
    for (const [dir, label] of [['node_modules', '根项目依赖'], ['cms/node_modules', 'CMS 依赖']]) {
      if (await pathExists(fromRoot(dir))) add('ok', `${label}已安装`, dir)
      else add('fail', `${label}未安装`, `执行 pnpm install`)
    }

    // 配置与内容
    const missing = []
    for (const rel of CONFIG_PATHS) {
      if (!(await pathExists(fromRoot(rel)))) missing.push(rel)
    }
    if (!missing.length) add('ok', `配置文件齐全`, `共 ${CONFIG_PATHS.length} 项`)
    else add('warn', `缺少配置文件`, missing.join('、'))

    const blog = await countArticles()
    add('ok', `博客文章 ${blog.articles} 篇`, `${blog.files} 个语言版本 / ${formatBytes(blog.bytes)}`)

    if (await pathExists(fromRoot('dist'))) add('ok', '已有构建产物 dist/', formatBytes(await pathSize(fromRoot('dist'))))
    else add('warn', '还没有构建产物', '可执行 pnpm build')

    // git
    if (!hasCommand('git')) add('warn', '未检测到 git', '无法使用 pnpm momo update / backup 的版本信息')
    const git = gitInfo()
    if (git) {
      add('ok', `Git 分支 ${git.branch || '未知'}`, `提交 ${git.commit || '未知'}`)
      if (git.dirty) add('warn', '工作区有未提交的改动', '更新前建议先提交或使用 pnpm momo update --stash')
    } else if (hasCommand('git')) {
      add('warn', '当前目录不是 git 仓库', '无法使用 pnpm momo update')
    }

    // 版本信息
    const pkg = await readJson(fromRoot('package.json'), {})
    if (pkg.version) add('ok', `项目版本 ${pkg.version}`)

    // 输出
    log.title('环境检查')
    for (const item of checks) {
      const icon = item.level === 'ok' ? c.green('✓') : item.level === 'warn' ? c.yellow('⚠') : c.red('✗')
      const detail = item.detail ? c.gray(`  ${item.detail}`) : ''
      log.info(`${icon} ${item.title}${detail}`)
    }

    const failed = checks.filter((item) => item.level === 'fail')
    const warned = checks.filter((item) => item.level === 'warn')
    log.raw()
    if (failed.length) {
      log.fail(`${failed.length} 项需要处理`)
      process.exitCode = 1
    } else if (warned.length) {
      log.warn(`${warned.length} 项提示，其余正常`)
    } else {
      log.ok('一切正常')
    }
  },
}
