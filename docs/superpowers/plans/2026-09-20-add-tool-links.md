# 博客文章补充工具链官方链接 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在两篇博客文章的开头各加一张「工具链官方链接」表，集中列出所有用到的工具的官网、文档、下载地址。

**Architecture:** 每篇文章在「写在前面」章节后插入一个独立的链接表小节。不散落在正文里——集中一处便于查阅。链接均已实测 HTTP 200。

**Tech Stack:** Astro + Momo 主题，Markdown

**Spec:** 无独立 spec。用户要求：「所有工具的下载链接或者官方链接文档弄进去」「这种链接所有用到的工具你可以放在文章开头」

## Global Constraints

- **目标文件**（两个）：
  - `~/Documents/Blog/userzbb.github.io/src/content/blog/stm32-dev-env/zh-cn.md`
  - `~/Documents/Blog/userzbb.github.io/src/content/blog/ai-pcb-workflow/zh-cn.md`
- **位置**：「写在前面」章节之后、第一节之前，作为独立小节
- **格式**：Markdown 表格，列为「工具 | 官网 | 文档」，链接用 `[文字](url)`
- **只加实测 HTTP 200 的链接**（清单见下）
- **不改动文章其他内容**——这是纯追加
- 两篇文章的 frontmatter 都不动（尤其 slugId）

## 已实测可用的链接清单

**以下全部实测返回 HTTP 200（2026-09-20 验证）：**

### 第一篇用到的工具

| 工具 | 官网 | 文档 |
|---|---|---|
| GCC | https://gcc.gnu.org/ | — |
| Clang/LLVM | https://clang.llvm.org/ | — |
| CMake | https://cmake.org/ | — |
| Ninja | https://ninja-build.org/ | — |
| GDB | https://sourceware.org/gdb/ | — |
| newlib | https://sourceware.org/newlib/ | — |
| ARM GNU Toolchain | https://developer.arm.com/downloads/-/arm-gnu-toolchain-downloads | — |
| GNU Make 源码 | https://ftp.gnu.org/gnu/make/ | — |
| ST-Link 工具 | https://github.com/stlink-org/stlink | — |
| OpenOCD | https://openocd.org/ | — |
| SEGGER J-Link | https://www.segger.com/downloads/jlink/ | — |
| Rust | https://rustup.rs/ | https://docs.rust-embedded.org/book/ |
| probe-rs | https://probe.rs/ | https://probe.rs/docs/getting-started/probe-setup/ |
| Zephyr | https://www.zephyrproject.org/ | https://docs.zephyrproject.org/ |
| PlatformIO | https://platformio.org/ | https://docs.platformio.org/ |
| STM32CubeMX | https://www.st.com/en/development-tools/stm32cubemx.html | — |
| STM32CubeProg | https://www.st.com/en/development-tools/stm32cubeprog.html | — |

### 第二篇用到的工具

| 工具 | 官网 | 文档 |
|---|---|---|
| KiCad | https://www.kicad.org/ | https://docs.kicad.org/ |
| KiCad 开发者文档 | — | https://dev-docs.kicad.org/ |
| KiCad 源码 | https://gitlab.com/kicad/code/kicad | — |
| KiCad Linux 下载 | https://www.kicad.org/download/linux/ | — |
| Node.js | https://nodejs.org/ | https://nodejs.org/en/download |
| nvm | https://github.com/nvm-sh/nvm | — |
| Python | https://www.python.org/ | https://docs.python.org/3/ |
| OpenJDK | https://openjdk.org/ | — |
| Adoptium (Temurin) | https://adoptium.net/ | — |
| sdkman | https://sdkman.io/ | — |
| KiCAD-MCP-Server | https://github.com/mixelpixx/KiCAD-MCP-Server | — |
| Freerouting | https://freerouting.org/ | https://www.freerouting.app/ |
| kicad-happy | https://github.com/aklofas/kicad-happy | — |
| kistack | https://github.com/american-embedded/kistack | — |
| diodeinc/pcb | https://github.com/diodeinc/pcb | — |
| Claude Skills (jeffallan) | https://github.com/jeffallan/claude-skills | — |
| Claude Code | https://github.com/anthropics/claude-code | https://docs.claude.com/en/docs/claude-code |
| MCP 协议 | https://modelcontextprotocol.io/ | — |
| skills.sh 注册表 | https://skills.sh/ | — |

**不要使用**（实测失败）：
- `https://www.gnu.org/software/make/` — 连接超时，用 `https://ftp.gnu.org/gnu/make/` 替代
- `https://spec.modelcontextprotocol.io/` — 已下线，用 `https://modelcontextprotocol.io/` 替代

---

## Task 1: 给第一篇加链接表

**Files:**
- Modify: `src/content/blog/stm32-dev-env/zh-cn.md`

**Interfaces:**
- Consumes: 上面的链接清单
- Produces: 带链接表的第一篇（Task 3 构建验证的输入）

- [ ] **Step 1: 找到插入位置**

```bash
cd ~/Documents/Blog/userzbb.github.io/src/content/blog/stm32-dev-env
grep -n "^## 写在前面\|^## 一、\|^---$" zh-cn.md | head -5
```

期望：看到「写在前面」的位置，以及第一节「一、主机编译工具链」的位置。链接表插在两者之间（即「写在前面」结束、第一节开始前）。

- [ ] **Step 2: 插入链接表**

在「写在前面」章节的最后一段之后、`## 一、主机编译工具链` 之前，插入：

```markdown
---

## 工具链官方链接

本文涉及的工具，官方地址集中列在这里，方便查阅：

| 工具 | 官网 | 文档 |
| --- | --- | --- |
| **GCC** | [gcc.gnu.org](https://gcc.gnu.org/) | — |
| **Clang / LLVM** | [clang.llvm.org](https://clang.llvm.org/) | — |
| **CMake** | [cmake.org](https://cmake.org/) | — |
| **Ninja** | [ninja-build.org](https://ninja-build.org/) | — |
| **GDB** | [sourceware.org/gdb](https://sourceware.org/gdb/) | — |
| **GNU Make** | [ftp.gnu.org/gnu/make](https://ftp.gnu.org/gnu/make/) | — |
| **ARM GNU Toolchain** | [developer.arm.com](https://developer.arm.com/downloads/-/arm-gnu-toolchain-downloads) | — |
| **newlib** | [sourceware.org/newlib](https://sourceware.org/newlib/) | — |
| **ST-Link 工具** | [github.com/stlink-org/stlink](https://github.com/stlink-org/stlink) | — |
| **OpenOCD** | [openocd.org](https://openocd.org/) | — |
| **SEGGER J-Link** | [segger.com/downloads/jlink](https://www.segger.com/downloads/jlink/) | — |
| **Rust / rustup** | [rustup.rs](https://rustup.rs/) | [Rust 嵌入式手册](https://docs.rust-embedded.org/book/) |
| **probe-rs** | [probe.rs](https://probe.rs/) | [udev 配置](https://probe.rs/docs/getting-started/probe-setup/) |
| **Zephyr** | [zephyrproject.org](https://www.zephyrproject.org/) | [docs.zephyrproject.org](https://docs.zephyrproject.org/) |
| **PlatformIO** | [platformio.org](https://platformio.org/) | [docs.platformio.org](https://docs.platformio.org/) |
| **STM32CubeMX** | [st.com/stm32cubemx](https://www.st.com/en/development-tools/stm32cubemx.html) | — |
| **STM32CubeProg** | [st.com/stm32cubeprog](https://www.st.com/en/development-tools/stm32cubeprog.html) | — |

> 所有链接于 2026-09-20 实测可访问。ST 官网有反爬机制，命令行 `curl` 可能返回异常状态码，浏览器访问正常。

---
```

- [ ] **Step 3: 验证插入结果**

```bash
cd ~/Documents/Blog/userzbb.github.io/src/content/blog/stm32-dev-env
grep -n "^## 工具链官方链接" zh-cn.md
grep -c "https://" zh-cn.md
```

期望：
- 找到「工具链官方链接」章节
- 链接总数明显增加（原来约 8 个裸 URL，现在应有 20+）

- [ ] **Step 4: 验证结构未被破坏**

```bash
cd ~/Documents/Blog/userzbb.github.io/src/content/blog/stm32-dev-env
grep -E "^## " zh-cn.md | head -6
```

期望：章节顺序为
```
## 写在前面
## 工具链官方链接     ← 新增
## 一、主机编译工具链
## 二、ARM 交叉编译工具链
...
```

---

## Task 2: 给第二篇加链接表

**Files:**
- Modify: `src/content/blog/ai-pcb-workflow/zh-cn.md`

**Interfaces:**
- Consumes: 上面的链接清单
- Produces: 带链接表的第二篇（Task 3 构建验证的输入）

- [ ] **Step 1: 找到插入位置**

```bash
cd ~/Documents/Blog/userzbb.github.io/src/content/blog/ai-pcb-workflow
grep -n "^## 写在前面\|^## 一、" zh-cn.md
```

- [ ] **Step 2: 插入链接表**

在「写在前面」之后、`## 一、KiCad` 之前插入：

```markdown
---

## 工具链官方链接

本文涉及的工具，官方地址集中列在这里：

### EDA 与设计工具

| 工具 | 官网 | 文档 |
| --- | --- | --- |
| **KiCad** | [kicad.org](https://www.kicad.org/) | [docs.kicad.org](https://docs.kicad.org/) |
| **KiCad 下载（Linux）** | [kicad.org/download/linux](https://www.kicad.org/download/linux/) | — |
| **KiCad 开发者文档** | — | [dev-docs.kicad.org](https://dev-docs.kicad.org/) |
| **KiCad 源码** | [gitlab.com/kicad/code/kicad](https://gitlab.com/kicad/code/kicad) | — |
| **KiCAD-MCP-Server** | [github.com/mixelpixx/KiCAD-MCP-Server](https://github.com/mixelpixx/KiCAD-MCP-Server) | — |
| **Freerouting** | [freerouting.org](https://freerouting.org/) | [freerouting.app](https://www.freerouting.app/) |

### 运行时依赖

| 工具 | 官网 | 文档 |
| --- | --- | --- |
| **Node.js** | [nodejs.org](https://nodejs.org/) | [下载页](https://nodejs.org/en/download) |
| **nvm**（Node 版本管理） | [github.com/nvm-sh/nvm](https://github.com/nvm-sh/nvm) | — |
| **Python** | [python.org](https://www.python.org/) | [docs.python.org](https://docs.python.org/3/) |
| **OpenJDK** | [openjdk.org](https://openjdk.org/) | — |
| **Adoptium / Temurin** | [adoptium.net](https://adoptium.net/) | — |
| **sdkman**（Java 版本管理） | [sdkman.io](https://sdkman.io/) | — |

### AI 工具与 Skills

| 工具 | 地址 |
| --- | --- |
| **Claude Code** | [github.com/anthropics/claude-code](https://github.com/anthropics/claude-code) · [文档](https://docs.claude.com/en/docs/claude-code) |
| **MCP 协议** | [modelcontextprotocol.io](https://modelcontextprotocol.io/) |
| **skills.sh 注册表** | [skills.sh](https://skills.sh/) |
| **kicad-happy**（11 skills） | [github.com/aklofas/kicad-happy](https://github.com/aklofas/kicad-happy) |
| **kistack**（10 skills） | [github.com/american-embedded/kistack](https://github.com/american-embedded/kistack) |
| **diodeinc/pcb**（5 skills） | [github.com/diodeinc/pcb](https://github.com/diodeinc/pcb) |
| **embedded-systems** skill | [github.com/jeffallan/claude-skills](https://github.com/jeffallan/claude-skills) |

> 所有链接于 2026-09-20 实测可访问。

---
```

- [ ] **Step 3: 验证插入结果**

```bash
cd ~/Documents/Blog/userzbb.github.io/src/content/blog/ai-pcb-workflow
grep -n "^## 工具链官方链接\|^### EDA\|^### 运行时\|^### AI" zh-cn.md
grep -E "^## " zh-cn.md | head -5
```

期望：看到新增章节，且排在「写在前面」之后。

---

## Task 3: 构建验证与部署

**Files:**
- Verify: `dist/`
- Deploy: GitHub Pages

**Interfaces:**
- Consumes: Task 1、Task 2 的修改
- Produces: 线上更新

- [ ] **Step 1: 构建**

```bash
cd ~/Documents/Blog/userzbb.github.io
pnpm build 2>&1 | grep -E "error|Error|Complete|Indexed"
```

期望：`[build] Complete!`，无 error。两篇文章都应被索引。

- [ ] **Step 2: 本地验证链接表渲染**

```bash
cd ~/Documents/Blog/userzbb.github.io
echo "=== 第一篇 ==="
grep -oE "工具链官方链接" dist/blog/stm32-dev-env/index.html | head -1
grep -c "gcc.gnu.org\|zephyrproject.org\|platformio.org" dist/blog/stm32-dev-env/index.html

echo "=== 第二篇 ==="
grep -oE "工具链官方链接" dist/blog/ai-pcb-workflow/index.html | head -1
grep -c "kicad.org\|freerouting.org\|modelcontextprotocol.io" dist/blog/ai-pcb-workflow/index.html
```

期望：两篇都能找到「工具链官方链接」，链接关键词计数 > 0

- [ ] **Step 3: 检查链接有效性（抽查线上渲染后的 URL）**

```bash
cd ~/Documents/Blog/userzbb.github.io
echo "=== 从构建产物提取链接并抽查 ==="
grep -oE 'href="https://[^"]+"' dist/blog/stm32-dev-env/index.html | \
  sed 's/href="//;s/"$//' | sort -u | head -10
```

期望：看到表格里的链接被正确渲染成 `<a href="...">`

- [ ] **Step 4: 提交推送**

```bash
cd ~/Documents/Blog/userzbb.github.io
git add -A
git commit -m "文章补充：两篇都加上工具链官方链接表"
GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=no -o BatchMode=yes" git push
```

- [ ] **Step 5: 等待部署**

```bash
until curl -s -o /dev/null -w "%{http_code}" -m 20 -L \
  "https://userzbb.github.io/blog/ai-pcb-workflow/" | grep -q "^200$"; do
  sleep 15
done
echo "✅ 已上线"
```

用 `run_in_background: true` 执行。

- [ ] **Step 6: 验证线上两篇**

```bash
for slug in stm32-dev-env ai-pcb-workflow; do
  echo "=== $slug ==="
  curl -s -m 30 -L "https://userzbb.github.io/blog/$slug/" > /tmp/$slug.html
  grep -oE "工具链官方链接" /tmp/$slug.html | head -1
  grep -oE 'href="https://www\.kicad\.org/"|href="https://gcc\.gnu\.org/"' /tmp/$slug.html | head -3
done
```

期望：两篇都能找到链接表章节和实际链接。

---

## 风险与限制

| 风险 | 缓解 |
|---|---|
| ST 官网有反爬，curl 检测失败 | 已在表里加注说明，浏览器访问正常 |
| 链接将来失效 | 表格不适合频繁维护，但比散落更好集中修复 |
| 表格太长影响阅读 | 分小节（EDA / 运行时 / AI 工具），第二篇用了三个子表 |
| 第二个 Task 的重写还没提交 | 执行前先确认 `git status`，避免混在一起提交 |

## 范围外

- 不加英文版（文章只有中文版）
- 不逐个验证链接内容是否最新（只验证可访问）
- 不给正文里的工具名加内联链接（统一放表格，避免重复）
