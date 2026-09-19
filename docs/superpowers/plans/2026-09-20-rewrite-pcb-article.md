# 重写 AI PCB 博客文章 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `ai-pcb-workflow/zh-cn.md` 按第一篇《Fedora 嵌入式开发环境全栈配置指南》的结构重写——每个工具独立成节，统一「说明 → 安装 → 验证」三段式。

**Architecture:** 纯内容重写。现有文章内容正确但结构松散（三要素标题不统一、遗漏了 Node/Python/Java/ARM-GCC 四个工具、总览位置颠倒）。重写为 13 节，严格对齐第一篇。

**Tech Stack:** Astro + Momo 主题，Markdown，pnpm 构建

**Spec:** 无独立 spec。参照物是同一博客已有的 `src/content/blog/stm32-dev-env/zh-cn.md`

## Global Constraints

- **目标文件**：`~/Documents/Blog/userzbb.github.io/src/content/blog/ai-pcb-workflow/zh-cn.md`
- **参照模板**：`src/content/blog/stm32-dev-env/zh-cn.md`（同仓库，已发布）
- **frontmatter 格式**（Momo 主题，不可改动字段名）：
  ```yaml
  ---
  title: ...
  pubDate: 2026-09-20
  description: ...
  image: "https://www.loliapi.com/acg/"
  draft: false
  slugId: ai-pcb-workflow
  category: Hardware
  ---
  ```
- **slugId 必须保持 `ai-pcb-workflow`**，否则线上 URL 会变
- **必须保留**现有文章里的 10 个踩坑记录（内容正确，不要丢）
- **必须保留**「AI 做硬件设计的边界」这个独有章节（第一篇没有，是本文价值点）
- **验证步骤必须写实际产出**（命令 + 期望输出），不能只写"检查是否成功"
- **诚实标注**：原理图排版不美观这个遗留问题要保留
- 所有版本号、路径、命令都要与实测一致（见下方"已核实的实测数据"）

## 已核实的实测数据（写文章时直接引用，不要编造）

| 项 | 值 |
|---|---|
| KiCad | 10.0.6 |
| Node.js | v24.14.0 |
| Python | 3.14.7 |
| Java | OpenJDK 25.0.2 (Temurin) |
| uvx | 0.10.10 |
| arm-none-eabi-gcc | 15.2.0 (Fedora) |
| KiCAD-MCP-Server | 2.7.0，**233 个工具** |
| Freerouting | 2.4.1 |
| 符号库 | 224 个 |
| 封装库 | 155 个 |
| 3D 模型 | 3.2 GB |
| 全局 skills | 72 个（其中 EDA 相关 21 个） |
| 已装插件 | 19 个 |
| 工程产物 | 17 元件 / 13 网络 / 141 走线 / 14 过孔 / 13 Gerber |
| ERC 结果 | **0 violations** |
| DRC 结果 | **0 violations, 0 unconnected** |
| 生成代码 | `main.c` 290 行 → `main.o` 480 字节 text 段 |

---

## 文件结构

| 路径 | 变化 |
|---|---|
| `src/content/blog/ai-pcb-workflow/zh-cn.md` | **整体重写**（结构重组，内容保留） |

单文件任务，不需要拆分。

---

## Task 1: 重写文章主体

**Files:**
- Modify: `~/Documents/Blog/userzbb.github.io/src/content/blog/ai-pcb-workflow/zh-cn.md`（整体重写）

**Interfaces:**
- Consumes: 现有文章的内容（10 个踩坑、实战流程、边界分析）、第一篇的结构模板
- Produces: 结构对齐第一篇的新版本（Task 2 构建验证的输入）

### 目标结构（13 节）

```
写在前面
一、KiCad —— 说明/安装/验证
二、Node.js 运行时 —— 说明/安装/验证          ← 新增
三、Python 与 pcbnew 绑定 —— 说明/安装/验证    ← 新增
四、Java 运行时 —— 说明/安装/验证              ← 新增
五、KiCAD-MCP-Server —— 说明/安装/验证
六、Freerouting —— 说明/安装/验证
七、Skills 领域知识包 —— 说明/安装/验证
八、AI 助手配置 —— 说明/安装/验证
九、ARM 交叉编译工具链 —— 说明/安装/验证       ← 新增
十、实战：设计 STM32 最小系统板
十一、最终环境总览
十二、踩坑清单
十三、AI 做硬件设计的边界
结语
```

- [ ] **Step 1: 写「写在前面」**

内容要点：
- 承接上一篇（链接 `/blog/stm32-dev-env/`）
- 本篇解决的问题：硬件设计能不能让 AI 做
- 完整链路图：`需求 → 原理图 → PCB → 自动布线 → BOM → Gerber → MCU 代码`
- 工具链总表（6 行：EDA 引擎 / 协议层 / 布线引擎 / 领域知识 / AI 助手），带 GitHub 星数
- 声明每节结构：说明 → 安装 → 验证

格式参考第一篇的「写在前面」（表格 + 结构声明）。

- [ ] **Step 2: 写第一节「KiCad」**

```markdown
## 一、KiCad

### 说明

**KiCad 是开源 EDA 工具**，画原理图和 PCB 用的。

选它而不是 Altium / 立创EDA 的原因（表格）：
| 特性 | 为什么重要 |
| 开源 + 跨平台 | Linux 原生支持，dnf 直接装 |
| 文件格式开放（S-expression） | 纯文本，AI 可直接读写 |
| 命令行工具 kicad-cli | ERC/DRC/Gerber/BOM 全可脚本化 |
| Python API（pcbnew） | 程序化操作板子 |
| 生态最活跃 | AI 工具都围绕它做 |

**关键点**：纯文本 S-expression 是整件事成立的前提——二进制格式 AI 没法操作。
给出文件片段示例。

### 安装

sudo dnf install -y kicad kicad-packages3d

> 坑 1：Fedora 没有 kicad-libraries 包（Debian 包名），库随主包

### 验证

kicad-cli version → 10.0.6
ls /usr/share/kicad/symbols/ | wc -l → 224
ls /usr/share/kicad/footprints/ | wc -l → 155
kicad-cli sch export --help | grep -E "bom|netlist|pdf"
kicad-cli pcb export --help | grep -E "gerbers|drill|step"
```

- [ ] **Step 3: 写第二节「Node.js 运行时」（新增）**

```markdown
## 二、Node.js 运行时

### 说明

**为什么需要**：KiCAD-MCP-Server 是用 TypeScript 写的，跑在 Node 上。
MCP 协议本身与语言无关，但**这个实现**需要 Node ≥ 18。

### 安装

本机已有 v24.14.0（nvm 管理）。检查：
```bash
node --version    # v24.14.0
npm --version     # 11.9.0
```

如果需要安装：
```bash
# 方式一：Fedora 仓库
sudo dnf install nodejs npm

# 方式二：nvm（推荐，便于切换版本）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
nvm install 24
```

### 验证

node 版本 ≥ 18 即可。实测 v24.14.0。
```

- [ ] **Step 4: 写第三节「Python 与 pcbnew 绑定」（新增）**

```markdown
## 三、Python 与 pcbnew 绑定

### 说明

**pcbnew 是什么**：KiCad 的 Python API，让程序能操作板子。
MCP 服务器通过它读写 PCB 文件、调 KiCad 的功能。

**关键**：pcbnew 由 KiCad 主包提供，不需要单独 pip install。

### 安装

装 KiCad 时自动带上。验证导入：

### 验证

```bash
python3 -c "import pcbnew; print(pcbnew.GetBuildVersion())"
# 10.0.6-1.fc44

python3 -c "import pcbnew; print(pcbnew.__file__)"
# /usr/lib64/python3.14/site-packages/pcbnew.py
```

> 坑 3：Fedora 的路径是 /usr/lib64/python3.14/site-packages/，
> 不是 Debian 的 /usr/lib/kicad/lib/python3/dist-packages/

> 坑 9：import pcbnew 会刷 assert 噪音，无害
```

- [ ] **Step 5: 写第四节「Java 运行时」（新增）**

```markdown
## 四、Java 运行时

### 说明

**为什么需要**：Freerouting（自动布线引擎）是 Java 写的，需要 Java 21+。

### 安装

```bash
# Fedora 仓库
sudo dnf install java-21-openjdk

# 或用 sdkman（本机方式）
sdk install java 25.0.2-tem
```

### 验证

```bash
java --version
# openjdk 25.0.2 2026-01-20 LTS
```

Java ≥ 21 即可。
```

- [ ] **Step 6: 写第五节「KiCAD-MCP-Server」**

保留现有内容，但重组为三要素。包含：
- **说明**：MCP 是什么、5 个候选服务器对比表（含星数）
- **安装**：git clone + venv + npm install + npm build
- **验证**：三层验证
  1. 构建产物存在（`ls dist/index.js`）
  2. 独立 MCP 握手测试（Python 脚本，验证 233 个工具）
  3. 工具分布表（schematic 37 / export 31 / ...）
- 坑 2（venv 隔离）⭐⭐⭐ — 放在安装里
- 坑 6（sym-lib-table）⭐⭐ — 放在验证里
- 注册到 Claude Code 作为 `#### 注册` 子节

- [ ] **Step 7: 写第六节「Freerouting」**

```markdown
## 六、Freerouting

### 说明
开源 PCB 自动布线器（2002⭐）。KiCAD-MCP-Server 已集成它。

### 安装
mkdir -p ~/.kicad-mcp
curl -L -o ~/.kicad-mcp/freerouting.jar \
  https://github.com/freerouting/freerouting/releases/download/v2.4.1/freerouting-2.4.1.jar

**注意路径**：MCP 期望 ~/.kicad-mcp/freerouting.jar

> 坑 7：版本号要现查，v2.0.1 已过时

### 验证

mcp__kicad__check_freerouting()
→ 必须看到 "ready": true
（给出完整 JSON 输出）
```

- [ ] **Step 8: 写第七节「Skills 领域知识包」**

保留现有内容，重组：
- **说明**：插件 vs Skills 的区别（表格）
- **安装**：4 个包的安装命令
- **验证**：`ls ~/.claude/skills/ | grep -cE ...` → 21
- 装了哪些（表格：4 个包 → 27 个 skills）
- 坑 8（PromptScript 误报）

- [ ] **Step 9: 写第八节「AI 助手配置」（新增/合并）**

把现有文章里散落的 Claude Code 配置内容整合：

```markdown
## 八、AI 助手配置

### 说明
Claude Code 是编排层——它调用 MCP 工具、加载 Skills、执行设计流程。

### 安装
（插件安装、MCP 注册的完整配置）

### 验证
claude mcp list
# kicad: ... ✔ Connected

claude plugin list | grep -cE "^  ❯"
# 19
```

- [ ] **Step 10: 写第九节「ARM 交叉编译工具链」（新增）**

```markdown
## 九、ARM 交叉编译工具链

### 说明

**为什么需要**：验证 AI 生成的 MCU 代码能否编译。
生成的 main.c 是 STM32 代码，要用交叉编译器验证。

**注意**：这是"验证工具"，不是设计工具——它在整条链路里只负责最后一步的检查。

### 安装

sudo dnf install arm-none-eabi-gcc-cs arm-none-eabi-gcc-cs-c++ \
                 arm-none-eabi-binutils arm-none-eabi-newlib

> 包名是 arm-none-eabi-gcc-cs（带 -cs 后缀）

参考上一篇《Fedora 嵌入式开发环境全栈配置指南》第二节。

### 验证

arm-none-eabi-gcc --version
# arm-none-eabi-gcc (Fedora 15.2.0-4.fc44) 15.2.0

实际编译一个空程序确认可用。
```

- [ ] **Step 11: 写第十节「实战：设计 STM32 最小系统板」**

**这是最长的一节**，保留现有内容但按第一篇「实战」节的写法组织：

- 目标电路表（17 元件）
- 第一步：AI 画原理图（MCP 调用 + ERC 验证）
- 第二步：PCB + 自动布线（+ DRC 验证 + 坑 10）
- 第三步：导出制造文件（13 Gerber 等）
- 第四步 ⭐：从原理图生成代码（解析脚本 + 编译验证）
- 「诚实标注」子节（来自 netlist vs AI 推断）

- [ ] **Step 12: 写第十一至十三节 + 结语**

**十一、最终环境总览**（对齐第一篇的「十二、最终环境总览」）

完整工具链表（组件 / 版本 / 来源 / 作用）+ 辅助工具链说明。

**十二、踩坑清单**（对齐第一篇）

10 条，按价值排序，格式与第一篇一致：
```markdown
1. **标题** ⭐⭐⭐ — 说明
```

**十三、AI 做硬件设计的边界**（本文独有）

- ✅ AI 能做好的（表格：能力 / 证据）
- ⚠️ AI 做不好的（表格）
- 🚨 打样前必做的人工检查清单

**结语**
- 完整链路图（带每步的验证结果）
- 两点总结：开放文件格式是前提、AI 能读数据但理解电路需要人

- [ ] **Step 13: 自查结构一致性**

```bash
cd ~/Documents/Blog/userzbb.github.io/src/content/blog

echo "=== 结构对比 ==="
echo "第一篇:"
grep -cE "^### (说明|安装|验证)$" stm32-dev-env/zh-cn.md
echo "第二篇:"
grep -cE "^### (说明|安装|验证)$" ai-pcb-workflow/zh-cn.md

echo ""
echo "=== 节数对比 ==="
grep -cE "^## " stm32-dev-env/zh-cn.md
grep -cE "^## " ai-pcb-workflow/zh-cn.md

echo ""
echo "=== 三要素覆盖率（每节都应有说明/安装/验证）==="
grep -E "^## " ai-pcb-workflow/zh-cn.md
```

期望：
- 第一到第九节都含 `### 说明` `### 安装` `### 验证`
- 第十节（实战）用不同的小节结构（合理）
- 十一/十二/十三节是清单/总览性质（无三要素，合理）
- 节数：第一篇 13 节 → 第二篇 13 节左右

- [ ] **Step 14: 提交**

```bash
cd ~/Documents/Blog/userzbb.github.io
git add src/content/blog/ai-pcb-workflow/zh-cn.md
git commit -m "重写文章：按工具链结构重组，补全 Node/Python/Java/ARM-GCC 四节"
```

---

## Task 2: 构建验证与部署

**Files:**
- Verify: `dist/`（构建产物）
- Deploy: GitHub Pages

**Interfaces:**
- Consumes: Task 1 重写的文章
- Produces: 线上更新

- [ ] **Step 1: 构建**

```bash
cd ~/Documents/Blog/userzbb.github.io
pnpm build 2>&1 | grep -E "error|Error|Complete|Indexed"
```

期望：`[build] Complete!`，无 error

- [ ] **Step 2: 本地检查渲染**

```bash
cd ~/Documents/Blog/userzbb.github.io
ls dist/blog/ai-pcb-workflow/index.html && \
  grep -oE '<h2[^>]*>[^<]+</h2>' dist/blog/ai-pcb-workflow/index.html | head -15
```

期望：看到全部 13 节的标题

- [ ] **Step 3: 提交推送**

```bash
cd ~/Documents/Blog/userzbb.github.io
git add -A
git commit -m "文章重写：结构对齐工具链指南，补充前置依赖章节"
GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=no -o BatchMode=yes" git push
```

- [ ] **Step 4: 等待部署并验证**

```bash
until curl -s -o /dev/null -w "%{http_code}" -m 20 -L \
  "https://userzbb.github.io/blog/ai-pcb-workflow/" | grep -q "^200$"; do
  sleep 15
done
echo "✅ 已上线"
```

（用 `run_in_background: true` 执行）

- [ ] **Step 5: 验证线上内容**

```bash
curl -s -m 30 -L "https://userzbb.github.io/blog/ai-pcb-workflow/" > /tmp/live.html
grep -oE "<title>[^<]*</title>" /tmp/live.html | head -1
grep -cE "<h2" /tmp/live.html
grep -oE "Node.js 运行时|Java 运行时|ARM 交叉编译|AI 做硬件设计的边界" /tmp/live.html | sort -u
```

期望：
- 标题正确
- h2 数量 ≈ 14（13 节 + 写在前面）
- 4 个新增关键词都出现

---

## 风险与限制

| 风险 | 缓解 |
|---|---|
| 重写时丢失原有的好内容（10 个坑、边界分析） | Global Constraints 里明确要求保留 |
| slugId 改了导致 URL 变化 | 明确要求保持不变 |
| 新增章节的内容与实测不符 | 「已核实的实测数据」表格提供准确值 |
| 文章过长影响可读性 | 第一篇 3341 词，本篇预计 6000+ 词，可接受（内容密度高） |

## 范围外

- 不改英文版（`en.md` 不存在，只有中文版）
- 不改第一篇
- 不补原理图截图（排版问题未解决，截图会暴露问题）
