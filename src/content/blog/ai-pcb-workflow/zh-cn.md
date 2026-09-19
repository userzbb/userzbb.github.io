---
title: 用 AI 设计一块 STM32 板子：从原理图到代码的全链路实践
pubDate: 2026-09-20
description: 通过 MCP 让 AI 操作 KiCad 完成原理图、PCB、自动布线、BOM、Gerber，并从网表生成可编译的 MCU 代码——含完整工具链搭建、每个环节的实测验证与 10 条踩坑记录
image: "https://www.loliapi.com/acg/"
draft: false
slugId: ai-pcb-workflow
category: Hardware
---

## 写在前面

上一篇《[Fedora 嵌入式开发环境全栈配置指南](/blog/stm32-dev-env/)》配好了 MCU 侧的开发链路——编译、烧录、调试。

这篇解决另一半问题：**硬件设计本身能不能让 AI 来做？**

目标是让 AI 走通这条链路：

```
需求描述 → 原理图 → PCB → 自动布线 → BOM → Gerber → 从原理图生成 MCU 代码
```

涉及的工具链：

| 层次 | 工具 | 作用 |
| --- | --- | --- |
| **EDA 引擎** | KiCad 10.0.6 | 提供开放文件格式与 `kicad-cli` |
| **协议层** | [KiCAD-MCP-Server](https://github.com/mixelpixx/KiCAD-MCP-Server) 2.7.0（2350⭐） | 把 KiCad 能力暴露为 **233 个 MCP 工具** |
| **布线引擎** | [Freerouting](https://github.com/freerouting/freerouting) 2.4.1（2002⭐） | 自动布线 |
| **领域知识** | [kicad-happy](https://github.com/aklofas/kicad-happy)（1257⭐）、[kistack](https://github.com/american-embedded/kistack)（386⭐）、[diodeinc/pcb](https://github.com/diodeinc/pcb)（450⭐）、[embedded-systems](https://github.com/jeffallan/claude-skills)（11537⭐） | 共 27 个 skills |
| **运行时** | Node v24.14.0 / Python 3.14.7 / Java 25.0.2 | 分别支撑 MCP、pcbnew 绑定、Freerouting |
| **AI 助手** | Claude Code + 19 个插件 | 编排全部 |

**关于前置依赖**：第一篇只讲了「MCU 代码怎么写」，没讲「AI 怎么操作 EDA 工具」。后者需要四个额外的运行时——Node.js（跑 MCP 服务器）、Python + pcbnew（读写 PCB）、Java（跑布线引擎）、ARM 交叉编译器（验证生成的代码能编译）。这四个在第一篇里要么没提、要么一笔带过，**这篇里每节都独立讲清楚**。

每一节的结构统一为：**说明 → 安装 → 验证**。验证尽量做到"实际产出东西"（ERC 报告、DRC 报告、编译出的 `.o`），而不是只看工具返回的 `success: true`。

> **诚实前置**：整条链路是通的，且每一步都有可验证的产物。但**原理图排版不美观这个问题没有解决**——文字重叠、布局不合理，MCP 只提供坐标级 API，没有审美判断。这一点在文末的「边界」一章里如实写了。

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

## 版本管理工具

### 说明

**为什么单独讲这个**：这套工具链对运行时版本有硬要求——KiCad 的 MCP 服务器要 Node ≥ 18，Freerouting 要 Java ≥ 21。而 Fedora 仓库里的版本往往偏旧或不够灵活，所以实际部署时通常靠**版本管理器**来装和切换。

本机装了四个：

| 语言 | 管理器 | 官网 | 本机版本 | 本文用到吗 |
| --- | --- | --- | --- | --- |
| **Node.js** | nvm | [github.com/nvm-sh/nvm](https://github.com/nvm-sh/nvm) | v24.14.0 | ✅ 是（跑 MCP） |
| **Java** | sdkman | [sdkman.io](https://sdkman.io/) | Temurin 25.0.2 | ✅ 是（跑 Freerouting） |
| **Rust** | rustup | [rustup.rs](https://rustup.rs/) | 1.29.1 | ⚪ 否（上一篇用的） |
| **Python** | uv | [astral.sh/uv](https://astral.sh/uv/) | 0.10.10 | ❌ **否**（见下） |

**另外一个 Fedora 原生的**：`alternatives`（系统自带），用于在多个已安装版本间切换默认项。

> **关于 Python 与 uv**：本机装了 `uv`，但**这篇文章的 Python 部分没用到它**——两处 Python 操作（MCP 服务器的依赖、以及上一篇 Zephyr 的依赖）用的都是标准的 `python3 -m venv` + `pip`，这是官方文档给的方式，也是实测跑通的方式。
>
> `uv` 是个更快的替代品（Rust 写的，装依赖比 pip 快一个数量级），如果你想用它替换：
>
> ```bash
> # 用 uv 建虚拟环境并装依赖（等价于 python3 -m venv + pip install）
> uv venv .venv
> uv pip install -r requirements.txt
> ```
>
> 但**本文的验证步骤没有跑过这条路径**，所以不把它写进安装流程。列在这里只是说明本机有这个工具。

### 安装

```bash title="版本管理器安装" frame="terminal"
# nvm —— Node 版本管理
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
nvm install 24

# sdkman —— Java / Maven / Gradle 版本管理
curl -s "https://get.sdkman.io" | bash
sdk install java 25.0.2-tem

# uv —— Python 版本与项目管理（Rust 写的，很快）
curl -LsSf https://astral.sh/uv/install.sh | sh
uv python install 3.14

# rustup —— Rust 工具链
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

**Fedora 原生方案**（不用版本管理器时）：

```bash
sudo dnf install nodejs npm java-25-openjdk python3
# 多个 Java 版本共存时，用 alternatives 切换默认项
sudo alternatives --config java
```

### 验证

**光装还不够——要知道哪个在生效。** 装了多个版本管理器时，**PATH 顺序决定谁赢**。

```bash title="确认实际生效的版本" frame="terminal"
which node && node --version
# /home/zizimiku/.nvm/versions/node/v24.14.0/bin/node
# v24.14.0

which java && java --version | head -1
# /home/zizimiku/.sdkman/candidates/java/current/bin/java
# openjdk 25.0.2 2026-01-20 LTS

which python3 && python3 --version
# /usr/bin/python3
# Python 3.14.7
```

**`which` 输出的路径就是答案**——它告诉你实际执行的是哪一份。

### ⚠️ 多套共存时的坑

本机的 Java 就是典型案例——**同时存在三套**：

```bash
# 1. dnf 装的（两套）
rpm -qa | grep openjdk
# java-25-openjdk-headless-25.0.4.1.1-1.1.fc44.x86_64
# java-latest-openjdk-27.0.0.0.35-0.0.1.0.ea.fc44.x86_64    ← Java 27 (EA)

# 2. sdkman 装的
ls ~/.sdkman/candidates/java/
# 25.0.2-tem

# 3. alternatives 的配置
alternatives --list | grep java
# jre_25  auto  /usr/lib/jvm/java-25-openjdk
# jre_26  auto  /usr/lib/jvm/java-latest-openjdk
```

**实际生效的是 sdkman 那份**——因为 `.zshrc` 里 sdkman 的初始化把它的 bin 目录加到了 PATH 前面：

```bash
# ~/.zshrc
export SDKMAN_DIR="$HOME/.sdkman"
[[ -s "$HOME/.sdkman/init.sh" ]] && source "$HOME/.sdkman/bin/sdkman-init.sh"
```

验证 PATH 顺序：

```bash title="PATH 里谁在前" frame="terminal"
echo $PATH | tr ':' '\n' | grep -n sdkman
# 11:/home/zizimiku/.sdkman/candidates/java/current/bin
```

排在 `/usr/bin`（dnf 装的）之前，所以 sdkman 赢。**另外那两套 dnf 装的 Java 实际形同虚设**——占了 1GB 多磁盘，但从不被执行。

> **实用建议**：选定一套版本管理器后就坚持用它，别混着来。混用时排查"为什么版本不对"很浪费时间——先 `which` 看路径，再看 PATH 顺序。

### 各管理器常用命令

| 操作 | nvm | sdkman | uv | rustup |
| --- | --- | --- | --- | --- |
| 装某版本 | `nvm install 24` | `sdk install java 25.0.2-tem` | `uv python install 3.14` | `rustup toolchain install stable` |
| 切换 | `nvm use 24` | `sdk use java 25.0.2-tem` | `uv python pin 3.14` | `rustup default stable` |
| 列已装 | `nvm ls` | `sdk list java \| grep installed` | `uv python list` | `rustup toolchain list` |
| 列可装 | `nvm ls-remote` | `sdk list java` | `uv python list --all-versions` | `rustup toolchain list -v` |


## 一、KiCad

### 说明

**KiCad 是开源 EDA 工具**，画原理图和 PCB 用的。选它而不是 Altium / 立创EDA 的原因：

| 特性 | 为什么重要 |
| --- | --- |
| **开源 + 跨平台** | Linux 原生支持，dnf 直接装 |
| **文件格式开放**（S-expression） | 纯文本，AI 可以直接读写，不需要 GUI 自动化 |
| **命令行工具 `kicad-cli`** | ERC/DRC/Gerber/BOM 全都能脚本化 |
| **Python API（pcbnew）** | 程序化操作板子 |
| **生态最活跃** | 我搜到的 AI 工具几乎都围绕它做 |

**关键点**：KiCad 的文件是**纯文本 S-expression**，这是整件事能成立的前提——如果文件是二进制格式，AI 就没法直接操作了。

```
(kicad_sch (version 20260101) (generator "eeschema")
  (symbol (lib_id "Device:R") (at 100.33 74.93 0) ...
```

### 安装

```bash
sudo dnf install -y kicad kicad-packages3d
```

> **坑 5**：Fedora **没有** `kicad-libraries` 包（那是 Debian/Ubuntu 的包名）。Fedora 只有 `kicad` / `kicad-doc` / `kicad-packages3d` 三个，符号库和封装库随主包一起装。库缺失的话重装主包：`sudo dnf reinstall kicad`。

### 验证

版本和库数量：

```bash title="KiCad 版本与库" frame="terminal"
kicad-cli version
# 10.0.6

ls /usr/share/kicad/symbols/ | wc -l
# 224          ← 符号库

ls /usr/share/kicad/footprints/ | wc -l
# 155          ← 封装库

du -sh /usr/share/kicad/3dmodels/ 2>/dev/null
# 3.2G         ← 3D 模型
```

检查关键子命令存在（后面全靠它们）：

```bash title="kicad-cli 子命令" frame="terminal"
kicad-cli sch export --help | grep -E "bom|netlist|pdf"
#     bom        Generate a bill of materials
#     netlist    Generate a netlist
#     pdf        Generate a PDF

kicad-cli pcb export --help | grep -E "gerbers|drill|step"
#     gerbers    Generate Gerber files
#     drill      Generate drill files
#     step       Generate a STEP file
```

两条命令都能列出对应子命令，说明 `kicad-cli` 完整可用——**这是后面所有脚本化操作的基础**。

---

## 二、Node.js 运行时

### 说明

**为什么需要**：KiCAD-MCP-Server 是用 TypeScript 写的，跑在 Node 上。MCP 协议本身与语言无关（Python、Go、Rust 都能实现），但**这个具体的实现**需要 Node ≥ 18。

在第一篇里 Node 没被提及，因为嵌入式工具链用不到它。但到了"让 AI 操作 EDA 工具"这一步，它是第一个前置依赖。

| 组件 | 用途 |
| --- | --- |
| `node` | 运行 `dist/index.js`（MCP 服务器入口） |
| `npm` | 安装依赖、执行构建 |

### 安装

本机已有 **v24.14.0**（nvm 管理）。如果是新机器，两种装法：

```bash title="Node.js 安装" frame="terminal"
# 方式一：Fedora 仓库（简单，但版本跟随发行版）
sudo dnf install nodejs npm

# 方式二：nvm（推荐，便于切换版本）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
nvm install 24
nvm use 24
```

用 nvm 的理由：KiCAD-MCP-Server 的构建偶尔会撞上 Node 版本问题，能随时切版本会省很多事。

### 验证

```bash title="node / npm 版本" frame="terminal"
node --version
# v24.14.0

npm --version
# 11.9.0
```

再看 Node 能不能真正执行一个脚本——这一步比版本号更有意义，因为后面 MCP 服务器就是靠它跑的：

```bash title="Node 实际执行" frame="terminal"
node -e "console.log(process.version, process.arch)"
# v24.14.0 x64
```

> **门槛**：Node ≥ 18 即可（MCP SDK 的最低要求）。实测 v24.14.0。

---

## 三、Python 与 pcbnew 绑定

### 说明

**pcbnew 是什么**：KiCad 的 Python API，让程序能操作板子——读写 PCB 文件、调用 KiCad 内部功能。MCP 服务器通过它实现"读写板子"这半边能力。

**关键点**：`pcbnew` 由 **KiCad 主包提供**，不需要单独 `pip install`。这一点和很多教程写的不一样（那些教程默认你在 Debian 上、且装的是打包版本）。

| 组件 | 说明 |
| --- | --- |
| `pcbnew` | KiCad 的 Python 模块，随主包安装 |
| 系统 `python3` | 3.14.7，直接可 import，**不需要配 PYTHONPATH** |

### 安装

**装 KiCad 时自动带上**，无需单独操作：

```bash
sudo dnf install -y kicad kicad-packages3d   # 同第一节
```

装完之后系统 Python 就能直接 `import pcbnew`，因为 Fedora 的 KiCad 把模块装进了系统 site-packages。

> **坑 4**：Fedora 的 `pcbnew` 在 `/usr/lib64/python3.14/site-packages/pcbnew.py`，**不是** Debian 风格的 `/usr/lib/kicad/lib/python3/dist-packages/`。网上教程里那句 `export PYTHONPATH=/usr/lib/kicad/lib/python3/dist-packages` 在 Fedora 上是错的，加了反而会引入不存在的路径。

前提是系统 Python 版本与 KiCad 编译时用的版本一致——Fedora 44 上都是 3.14，所以开箱可用。

### 验证

```bash title="pcbnew 导入验证" frame="terminal"
python3 -c "import pcbnew; print(pcbnew.GetBuildVersion())"
# 10.0.6-1.fc44

python3 -c "import pcbnew; print(pcbnew.__file__)"
# /usr/lib64/python3.14/site-packages/pcbnew.py
```

能打印出版本号和文件路径，说明绑定可用。再看它能不能真正调用一个 API（不只是 import 成功）：

```bash title="pcbnew 实际调用" frame="terminal"
python3 -c "
import pcbnew
b = pcbnew.BOARD()
print('board created:', b.GetBoardEdgesBoundingBox().GetWidth())
print('version:', pcbnew.Version())
"
# board created: 0
# version: 10.0.6
```

能构造出 `BOARD` 对象，说明 Python 层和 KiCad 的 C++ 层是通的。

> **坑 9**：`import pcbnew` 会向 stderr 刷几行 `assert "m_choices.GetCount() > 0" failed`。这是 KiCad 10.0.6 在 Fedora 构建下的已知问题，**不影响功能**——命令的退出码是 0，输出也正常。看到这些噪音不用管。

> **注意**：如果用 venv，venv **默认隔离系统包**，会看不到 pcbnew。这是第五节里最关键的一个坑，那里详细讲。

---

## 四、Java 运行时

### 说明

**为什么需要**：Freerouting（第六节的自动布线引擎）是 Java 写的，需要 **Java 21+**。

这是整条链路里最容易被忽略的依赖——因为它和 EDA、和 AI 都没直接关系，只是布线引擎的运行环境。缺了它的症状是：MCP 的 `autoroute` 工具报 `java not found`。

### 安装

```bash title="Java 安装" frame="terminal"
# 方式一：Fedora 仓库
sudo dnf install java-21-openjdk

# 方式二：sdkman（本机用的方式，便于切换版本）
curl -s "https://get.sdkman.io" | bash
sdk install java 25.0.2-tem
```

本机用的是 sdkman + Temurin 25.0.2。

### 验证

```bash title="java 版本" frame="terminal"
java --version
# openjdk 25.0.2 2026-01-20 LTS
# OpenJDK Runtime Environment Temurin-25.0.2+10 (build 25.0.2+10-LTS)
# OpenJDK 64-Bit Server VM Temurin-25.0.2+10 (build 25.0.2+10-LTS, mixed mode)

which java
# /home/zizimiku/.sdkman/candidates/java/current/bin/java
```

**光看版本号不够**——真正要验证的是"能不能跑一个 JAR"。写个最小测试：

```bash title="JAR 执行能力" frame="terminal"
cat > /tmp/H.java <<'EOF'
public class H { public static void main(String[] a) { System.out.println("java ok"); } }
EOF
java /tmp/H.java
# java ok
```

能输出 `java ok`，说明 JRE 完整可执行——**Freerouting 要的就是这个能力**。

> **门槛**：Java ≥ 21 即可。实测 OpenJDK 25.0.2。

---

## 五、KiCAD-MCP-Server

### 说明

**MCP（Model Context Protocol）** 是让 AI 调用外部工具的协议。装了 MCP 服务器之后，AI 就能直接调用它暴露的工具——在这里就是"画原理图""布线""导出 Gerber"。

我搜了 MCP 注册表和 GitHub，找到 **5 个** KiCad MCP 服务器：

| 项目 | Stars | 能力 |
| --- | --- | --- |
| **mixelpixx/KiCAD-MCP-Server** | **2350** | ✅ **233 工具**，含自动布线 |
| lamaalrajih/kicad-mcp | 524 | ❌ 只能读/分析，不能绘制 |
| Seeed-Studio/kicad-mcp-server | 130 | 分析为主 |
| oaslananka/kicad-mcp-pro | 95 | 项目设置 + 编辑 |
| ProductOfAmerica/mcp-server-kicad | 10 | 功能描述全，但星数太低 |

**选星数最高的那个**（2350⭐，且当天还在更新）——理由是能力和维护活跃度都最好。

> 补充：Python 系的候选服务器可以用 `uvx`（本机 0.10.10）直接跑，不用建 venv。但它们的工具数远少于 233，所以最终没选。

### 安装

```bash title="克隆与构建" frame="terminal"
mkdir -p ~/MCP && cd ~/MCP
git clone --depth 1 https://github.com/mixelpixx/KiCAD-MCP-Server.git
cd KiCAD-MCP-Server

# Python 依赖
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

# Node 依赖 + 构建
npm install && npm run build
```

> **坑 1（最关键）**：MCP 启动时报 `pcbnew validation failed`。
>
> **原因**：MCP 自动发现 `.venv` 并优先用它，但 **venv 默认隔离系统包**，看不到系统装的 `pcbnew`。
>
> **修复**——改一行配置让 venv 继承系统包：
>
> ```bash
> sed -i 's/include-system-site-packages = false/include-system-site-packages = true/' \
>   ~/MCP/KiCAD-MCP-Server/.venv/pyvenv.cfg
> ```
>
> **验证修复生效**：
>
> ```bash
> .venv/bin/python -c "import pcbnew; print(pcbnew.GetBuildVersion())"
> # 10.0.6-1.fc44      ← 有输出就说明 venv 能看到系统包了
> ```
>
> 这个坑排在最前面，因为它的症状（`pcbnew validation failed`）完全不提示"是 venv 的问题"，很容易往 Python 版本或路径方向排查。

> **坑 6**：官方 `scripts/install-linux.sh` 是 **Ubuntu 专用**（用 `apt-get` + `add-apt-repository ppa:`）。Fedora 上跑不了——`apt-get: command not found`。手动执行上面那几步即可。

### 验证

验证分三层，逐层排除。

**第 1 层：构建产物存在**

```bash title="构建产物" frame="terminal"
ls -la dist/index.js
# -rw-r--r-- 1 zizimiku zizimiku 183K ... dist/index.js
```

**第 2 层：MCP 握手测试**（不依赖 Claude Code，独立验证）

```python title="/tmp/mcp-test.py" frame="code"
import json, subprocess, time, os
home = os.path.expanduser('~')
env = {**os.environ, "NODE_ENV": "production",
       "PYTHONPATH": "/usr/share/kicad/scripting/plugins"}
p = subprocess.Popen(["node", f"{home}/MCP/KiCAD-MCP-Server/dist/index.js"],
    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
    text=True, env=env)
def send(o):
    p.stdin.write(json.dumps(o) + "\n"); p.stdin.flush()

send({"jsonrpc":"2.0","id":1,"method":"initialize",
      "params":{"protocolVersion":"2024-11-05","capabilities":{},
                "clientInfo":{"name":"t","version":"1"}}})
time.sleep(10)
send({"jsonrpc":"2.0","method":"notifications/initialized"})
time.sleep(3)
send({"jsonrpc":"2.0","id":2,"method":"tools/list"})
time.sleep(15)
p.terminate()
out, _ = p.communicate(timeout=20)
for line in out.strip().split('\n'):
    if line.startswith('{'):
        d = json.loads(line)
        if d.get('id') == 1:
            print("握手:", d['result'].get('serverInfo'))
        elif d.get('id') == 2:
            print("工具数:", len(d['result'].get('tools', [])))
```

运行：

```bash
python3 /tmp/mcp-test.py
# 握手: {'name': 'kicad-mcp-server', 'version': '2.7.0', ...}
# 工具数: 233
```

能打印出 `工具数: 233`，说明服务器进程、Node 运行时、pcbnew 绑定**三者都正常**——这是最有价值的一层验证。

**第 3 层：工具分布**（实测统计，确认 233 个工具都注册成功）

| 类别 | 数量 | 用途 |
| --- | --- | --- |
| schematic | 37 | 读写原理图、连线、网络 |
| export | 31 | Gerber / BOM / PDF / STEP |
| symbol_library | 21 | 符号库操作 |
| board | 15 | 板层、板框、铺铜 |
| footprint | 11 | 封装库 |
| pcb | 9 | PCB 操作 |
| drc | 7 | 设计规则检查 |
| autoroute | 4 | 自动布线 |
| bom | 3 | BOM 生成 |
| datasheet | 2 | 数据手册 |
| erc | 1 | 电气规则检查 |

> **坑 3**：首次使用前，`~/.config/kicad/10.0/` 里**没有 `sym-lib-table`**（要 KiCad GUI 首次启动才会生成）。不修的话 MCP 会报 `Library 'Device' not found in sym-lib-table`——所有涉及符号库的调用全部失败。
>
> **修复**：从模板复制两份表：
>
> ```bash title="符号库/封装库表" frame="terminal"
> mkdir -p ~/.config/kicad/10.0
> cp /usr/share/kicad/template/sym-lib-table ~/.config/kicad/10.0/
> cp /usr/share/kicad/template/fp-lib-table  ~/.config/kicad/10.0/
> ls ~/.config/kicad/10.0/
> # fp-lib-table  sym-lib-table
> ```
>
> 这个坑的隐蔽之处：**只有真正开始画图时才会暴露**。握手测试是通的、233 个工具都注册了，但一调用 `add_schematic_component` 就找不到符号。

#### 注册

把服务器注册到 Claude Code（写入 `~/.claude.json`）：

```bash title="注册 MCP 服务器" frame="terminal"
python3 <<'PYEOF'
import json, os
conf = os.path.expanduser('~/.claude.json')
home = os.path.expanduser('~')
d = json.load(open(conf))
d.setdefault('mcpServers', {})
d['mcpServers']['kicad'] = {
    "command": "node",
    "args": [f"{home}/MCP/KiCAD-MCP-Server/dist/index.js"],
    "env": {
        "NODE_ENV": "production",
        "PYTHONPATH": "/usr/share/kicad/scripting/plugins",
        "KICAD_AUTO_LAUNCH": "false"
    }
}
json.dump(d, open(conf, 'w'), indent=2, ensure_ascii=False)
print("✅ 已写入")
PYEOF
# ✅ 已写入
```

**注册后需要重启 Claude Code**，工具才会加载。

---

## 六、Freerouting

### 说明

**Freerouting 是开源的 PCB 自动布线器**（2002⭐）。给它一个网表，它算出走线。

KiCAD-MCP-Server 已经**集成**了它——只要 JAR 在正确的位置，MCP 的 `autoroute` 工具就能直接调用，不需要单独学它的命令行。

依赖关系：Freerouting → Java 21+（第四节已配）。

### 安装

```bash title="下载 freerouting.jar" frame="terminal"
mkdir -p ~/.kicad-mcp
curl -L -o ~/.kicad-mcp/freerouting.jar \
  https://github.com/freerouting/freerouting/releases/download/v2.4.1/freerouting-2.4.1.jar
```

**注意路径**：MCP 期望的是 **`~/.kicad-mcp/freerouting.jar`**，不是随便放哪都行。放到别处需要在 MCP 配置里显式指定。

> **坑 7**：Freerouting 的版本号要去 GitHub release 页确认。网上教程写的 v2.0.1 已经过时——那个 URL 现在返回的是 9 字节的 404 页面 `Not Found`，但 `curl -L` 不会报错，**只会静默存下一个不能用的文件**。判断方法：
>
> ```bash
> ls -l ~/.kicad-mcp/freerouting.jar
> # 正确：约 20MB 的 JAR
> # 错误：9 字节（是 "Not Found" 文本）
> file ~/.kicad-mcp/freerouting.jar
> # Java archive data (JAR)  ← 必须是这个
> ```

### 验证

用 MCP 自带的检查工具——**它一次性验证 Java 和 JAR 两件事**：

```
mcp__kicad__check_freerouting()
```

返回：

```json
{
  "java": {"found": true, "version": "openjdk 25.0.2", "java_21_ok": true},
  "freerouting": {"jar_found": true, "jar_path": "/home/.../.kicad-mcp/freerouting.jar"},
  "ready": true
}
```

**`"ready": true` 才算配好**。三个字段分别对应：Java 存在、Java 版本满足 21+、JAR 在预期路径。

如果 `java_21_ok` 是 `false`，回到第四节；如果 `jar_found` 是 `false`，检查路径是不是 `~/.kicad-mcp/freerouting.jar`。

真正的验证在第十节——实际跑一次布线，看它是否输出走线。

---

## 七、Skills 领域知识包

### 说明

**插件（MCP）给 AI 工具，Skills 给 AI 知识。**

原理图怎么画才规范、BOM 怎么补全料号、MCU 代码怎么写才可靠——这些是**知识**，用 skill 传递。MCP 让 AI 能"动手"，Skills 让 AI 知道"该怎么动"。

| | 插件 / MCP | Skills |
| --- | --- | --- |
| **是什么** | 可执行的能力（服务器进程） | 纯知识文档（Markdown） |
| **做什么** | 加装**能力**（读写文件、跑工具） | 传递**知识**（规范、流程、经验） |
| **怎么装** | `claude plugin install` / 手写 json | `npx skills add` |
| **要写代码吗** | 要（MCP server） | 不用，写 Markdown |

装了 4 个包，共 **27 个 skills**：

| 包 | Stars | Skills 数 |
| --- | --- | --- |
| aklofas/kicad-happy | 1257 | 11 |
| american-embedded/kistack | 386 | 10 |
| diodeinc/pcb | 450 | 5 |
| jeffallan/claude-skills@embedded-systems | 11537 | 1 |

### 安装

```bash title="skills 安装" frame="terminal"
npx -y skills add aklofas/kicad-happy -g -y                          # 1257⭐ 11个
npx -y skills add american-embedded/kistack -g -y                    # 386⭐  10个
npx -y skills add diodeinc/pcb -g -y                                 # 450⭐  5个
npx -y skills add jeffallan/claude-skills@embedded-systems -g -y     # 11537⭐ 1个
```

`-g` 是全局安装（装到 `~/.claude/skills/`），`-y` 跳过确认。

> **坑 8**：安装时会看到 `✗ PromptScript does not support global skill installation`。
>
> **这是误报**。`npx skills` 会同时尝试两种格式：`.agents/skills/`（PromptScript，供 Copilot、Zed 等工具用）和 Claude Code 格式。前者不支持全局安装所以报 ✗，**但后者成功了**。
>
> **判断方法**——不要看报错，看目录：
>
> ```bash
> ls ~/.claude/skills/ | grep -c kicad
> # 非 0 就说明装上了
> ```

### 验证

数一数 EDA 相关的 skills 和总数：

```bash title="skills 验证" frame="terminal"
ls ~/.claude/skills/ | grep -cE 'kicad|pcb|bom|spice|emc|datasheet|schematic|layout|gerber|zener|embedded'
# 21          ← EDA 相关

ls ~/.claude/skills/ | wc -l
# 72          ← 全局总数（安装前 45）
```

**光数目录还不够**——要确认 skill 真的能被加载（有 `SKILL.md`）：

```bash title="skill 结构验证" frame="terminal"
ls ~/.claude/skills/kicad/SKILL.md
# /home/zizimiku/.claude/skills/kicad/SKILL.md

head -4 ~/.claude/skills/kicad/SKILL.md
# ---
# name: kicad
# description: Analyze KiCad projects and PDF schematics: ...
# ---
```

看到 `description` 字段就对了——**这个字段决定 AI 什么时候加载它**。

装了哪些：

| 包 | Skills |
| --- | --- |
| kicad-happy | `kicad` `bom` `datasheets` `digikey` `mouser` `lcsc` `element14` `jlcpcb` `pcbway` `spice` `emc` |
| kistack | `kicad-schematic` `kicad-pcb` `kicad-layout` `kicad-bom` `kicad-export` `kicad-gerbers` `kicad-panelize` `kicad-footprint` `kicad-symbol` `pcb-product-render` |
| diodeinc/pcb | `zener-language` `datasheet-reader` `spice-sim` `librarian` `registry-search` |
| jeffallan | `embedded-systems` |

其中 `embedded-systems` 是第十节生成 MCU 代码时的知识来源——它教 AI 怎么写正确的寄存器配置和时钟树。

---

## 八、AI 助手配置

### 说明

Claude Code 是**编排层**——它本身不做 EDA 操作，负责三件事：

| 职责 | 依赖 |
| --- | --- |
| 调用 MCP 工具 | 第五节注册的 `kicad` 服务器 |
| 加载领域知识 | 第七节装的 27 个 skills |
| 执行设计流程 | 第四节的实战链路 |

所以这一节是把前面几节串起来的地方：确认 MCP 连上了、确认插件和 skills 被看见了。

### 安装

**MCP 注册**已在第五节的「注册」小节完成（写入 `~/.claude.json`）。

**插件安装**（我装了 19 个，其中与本文相关的）：

```bash title="插件安装" frame="terminal"
claude plugin marketplace list      # 查看已配置的市场
claude plugin marketplace update    # 更新索引
claude plugin install <插件名>
```

| 插件 | 作用 |
| --- | --- |
| `kicad`（MCP，非插件） | 233 个 EDA 工具 |
| `context7` | 查库文档 |
| `firecrawl` | 网页抓取 |
| `github` | GitHub 集成 |
| `superpowers` | 开发工作流增强 |
| `clangd-lsp` / `pyright-lsp` | C / Python 语言服务器 |

> **注意**：`github` 插件连的是 `api.githubcopilot.com`，需要 **GitHub Copilot 订阅**。普通 PAT 会报 `Authorization header is badly formatted`。这个坑在上一篇里写过，这里只做提醒。

### 验证

**第 1 层：MCP 连上了**

```bash title="claude mcp list" frame="terminal"
claude mcp list
# kicad: node /home/zizimiku/MCP/KiCAD-MCP-Server/dist/index.js - ✔ Connected
```

必须看到 `✔ Connected`。如果是 `✗ Failed`，回到第五节逐层排查。

**第 2 层：插件数量**

```bash title="插件列表" frame="terminal"
claude plugin list | grep -cE "^  ❯"
# 19
```

**第 3 层：在会话里实测工具可用**——这是最有意义的一层。开一个 Claude Code 会话，直接问：

```
列出你当前可用的 kicad 工具里，和 ERC 相关的有几个
```

期望它能回答出 `erc` 类别的工具（第 3 层验证里统计过是 1 个）。

---

## 九、ARM 交叉编译工具链

### 说明

**为什么需要**：用来验证 AI 生成的 MCU 代码**能不能编译**。

第十节生成的 `main.c` 是 STM32 代码（Cortex-M3），必须用交叉编译器验证——主机 gcc 编译出来的 x86 目标文件说明不了任何问题。

**注意定位**：这是**「验证工具」，不是「设计工具」**。它在整条链路里只负责最后一步的检查，不参与原理图和 PCB。

| 工具 | 作用 |
| --- | --- |
| `arm-none-eabi-gcc` | 交叉编译器 |
| `arm-none-eabi-size` | 查看代码段/数据段占用 |
| `arm-none-eabi-objdump` | 反汇编 |
| `arm-none-eabi-objcopy` | 格式转换 |

这一节在第一篇《Fedora 嵌入式开发环境全栈配置指南》第二节里已详细写过，这里只给必要部分。

### 安装

```bash title="ARM GNU toolchain" frame="terminal"
sudo dnf install arm-none-eabi-gcc-cs arm-none-eabi-gcc-cs-c++ \
                 arm-none-eabi-binutils arm-none-eabi-newlib
```

> **包名注意**：Fedora 里这个包叫 `arm-none-eabi-gcc-cs`（带 `-cs` 后缀，表示 CodeSourcery 版本），**不是**简单的 `arm-none-eabi-gcc`。写错了会 `No match for argument`。

### 验证

```bash title="交叉编译器版本" frame="terminal"
arm-none-eabi-gcc --version
# arm-none-eabi-gcc (Fedora 15.2.0-4.fc44) 15.2.0
```

**实际编译一个 Cortex-M3 目标文件**——这才是真的验证：

```bash title="Cortex-M3 编译检查" frame="terminal"
cd /tmp && cat > arm.c <<'EOF'
int main(void){ volatile int i=0; while(1){ i++; } return 0; }
EOF

arm-none-eabi-gcc -mcpu=cortex-m3 -mthumb -c arm.c -o arm.o
arm-none-eabi-size arm.o
#    text    data     bss     dec     hex filename
#      18       0       0      18      12 arm.o
```

能生成 `.o` 并用 `size` 读出占用，说明工具链完整可用。**第十节的 480 字节 `main.o` 就是用这套工具链验证出来的。**

---

## 十、实战：设计 STM32 最小系统板

前面九节都是环境配置，这一节是真正的技术活。

### 目标电路

一块基于 **STM32F103C8T6** 的最小系统板，包含常见的周边电路：

| 元件 | 型号/值 | 连接 |
| --- | --- | --- |
| U1 | STM32F103C8Tx (LQFP-48) | MCU |
| Y1 | 8MHz 晶振 + C1/C2 22pF | PD0/PD1 |
| R1 + C3 | 10k + 100nF | 复位电路 |
| R2/R3/R4 + D1/D2/D3 | 1k + LED | PB14 / PB15 / PC13 |
| SW1/SW2 | 按键 | PB12 / PB13 |
| C4/C5/C6 | 100nF | 电源去耦 |

合计 **17 个元件**。选这个电路的原因：**它包含了生成 MCU 代码所需的全部信息**——芯片型号、晶振频率、每个引脚接了什么。

### 第一步：AI 画原理图

用 MCP 的 `batch_add_and_connect` —— **一次调用完成「放置 + 连接」**，这是 233 个工具里效率最高的一个：

```
mcp__kicad__create_project(name="stm32-min", path=".../stm32-min")

mcp__kicad__batch_add_and_connect(
  components=[
    {"symbol":"MCU_ST_STM32F1:STM32F103C8Tx","reference":"U1", ...,},
    {"symbol":"Device:Crystal","reference":"Y1","value":"8MHz",
     "nets":{"1":"OSC_IN","2":"OSC_OUT"}, ...},
    {"symbol":"Device:R_Small_US","reference":"R2","value":"1kR",
     "nets":{"1":"LED1_A","2":"PB14"}, ...},
    ...
  ],
  labelType="label"
)
```

结果：**17 个元件 + 32 个引脚**一次完成。

然后连 MCU 的电源和晶振引脚：

```
mcp__kicad__batch_connect(connections={
  "U1": {"2":"PC13", "5":"OSC_IN", "6":"OSC_OUT", "7":"NRST",
         "25":"PB12", "26":"PB13", "27":"PB14", "28":"PB15",
         "1":"+3V3", "9":"+3V3", "24":"+3V3", "36":"+3V3", "48":"+3V3",
         "8":"GND", "23":"GND", "35":"GND", "44":"GND", "47":"GND"}
})
```

**未使用的 30 个引脚标记为 no-connect**（KiCad 标准做法，避免 ERC 报"引脚未连接"）：

```
mcp__kicad__batch_add_no_connects(pins=[{"componentRef":"U1","pinName":"10"}, ...])
```

**验证：ERC 检查**

```
mcp__kicad__run_erc(schematicPath=".../stm32-min.kicad_sch")
```

```
ERC result: 0 violation(s)
  Errors: 0  Warnings: 0  Info: 0
```

**电气规则完全干净**——这是第一个可验证的真实产物。

### 第二步：生成 PCB 并自动布线

```
# 原理图 → PCB
mcp__kicad__sync_schematic_to_board(...)
# → 17 footprints added, 13 nets added, 54 pads assigned

# 板框
mcp__kicad__set_board_size(width=60, height=50, unit="mm")

# 布局（17 个元件）
mcp__kicad__batch_move_components(moves={
  "U1": {"position":{"x":30,"y":25,"unit":"mm"}},
  "Y1": {"position":{"x":15,"y":15,"unit":"mm"}},
  ...
})

# 检查 courtyard 重叠
mcp__kicad__check_courtyard_overlaps(margin=0.2)
# → overlap_count: 0

# 自动布线（第六节配的 Freerouting）
mcp__kicad__autoroute(boardPath="...", timeout=300)
```

布线结果：

```
Autoroute completed in 10.1s
board_stats: { "tracks": 141, "vias": 14 }
```

**10.1 秒，141 条走线 + 14 个过孔。**

**验证：DRC 检查**

```bash title="DRC" frame="terminal"
kicad-cli pcb drc stm32-min.kicad_pcb -o /tmp/drc.rpt
cat /tmp/drc.rpt
```

```
Found 0 violations
Found 0 unconnected items
```

**全部连通，零违规。**

> **坑 2**：第一次跑 DRC 报了 **24 个 `track_width` 违规**。
>
> **现象**：Freerouting 用 0.15mm 走线，但 KiCad 工程的 `min_track_width` 是 0.20mm。
>
> **关键点**：MCP 的 `set_design_rules` 只改**内存状态**，不落盘。`kicad-cli` 读的是磁盘文件，所以改完再跑还是报错——**这是最容易误判为"工具坏了"的一个坑**。
>
> **正确做法**——直接改工程文件：
>
> ```python title="改 .kicad_pro 的设计规则" frame="code"
> import json
> p = 'stm32-min.kicad_pro'
> d = json.load(open(p))
> d['board']['design_settings']['rules']['min_track_width'] = 0.15
> json.dump(d, open(p, 'w'), indent=2)
> ```
>
> 改完重跑 DRC，24 个违规归零。

> **坑 10**：`suggest_placement`（自动布局工具）对这个电路**不适用**。
>
> 它报告 `improvement_pct: -159.8`——HPWL（连线总长）反而从 100mm 涨到 260mm。
>
> **原因**：所有元件初始都在 (0,0) 重叠，评分基准失真，优化方向反了。
>
> **结论**：元件全在原点时不要用自动布局；改用手动指定坐标效果更好（上面 `batch_move_components` 那段）。

### 第三步：导出制造文件

```bash title="制造文件导出" frame="terminal"
cd ~/kicad-projects/stm32-min
mkdir -p gerbers

# Gerber（铜层、阻焊、丝印、板框等）
kicad-cli pcb export gerbers stm32-min.kicad_pcb -o gerbers/

# 钻孔
kicad-cli pcb export drill stm32-min.kicad_pcb -o gerbers/

# BOM
kicad-cli sch export bom stm32-min.kicad_sch -o bom/bom.csv

# 原理图 PDF（人工复核用）
kicad-cli sch export pdf stm32-min.kicad_sch -o stm32-min-schematic.pdf

# 3D 模型
kicad-cli pcb export step stm32-min.kicad_pcb -o stm32-min.step
```

**验证：数产物**

```bash title="产物清单" frame="terminal"
ls gerbers/ | wc -l
# 13          ← Gerber

ls -la stm32-min.step stm32-min-schematic.pdf
# stm32-min.step            1.9M
# stm32-min-schematic.pdf    64K
```

产物汇总：

```
【原理图】  stm32-min.kicad_sch     83 KB
           stm32-min-schematic.pdf  64 KB
【PCB】     stm32-min.kicad_pcb     97 KB
           stm32-min.step          1.9 MB
           走线 141 条, 过孔 14 个
【Gerber】  13 个文件
【钻孔】    1 个文件
【BOM】     17 行元件
```

### 第四步 ⭐ 从原理图生成 MCU 代码

**这是整件事最有意思的部分。**

原理：KiCad 导出的 netlist 是**结构化文本**，包含「哪个元件的哪个引脚连到哪个网络」：

```
(net (code "1") (name "/PB14")
  (node (ref "R2") (pin "2"))
  (node (ref "U1") (pin "27"))     ← U1(pin 27) = PB14
)
```

有了这个，再结合元件型号（`U1 = STM32F103C8Tx`）和值字段（`Y1 = 8MHz`），**AI 就能推断电路意图并生成代码**。

**第一步：写解析脚本**

```python title="gen_code.py（节选：解析 netlist）" frame="code"
#!/usr/bin/env python3
"""从 KiCad netlist 提取结构化数据。"""
import re, json, sys
from collections import defaultdict

def parse_netlist(path):
    text = open(path, encoding='utf-8').read()

    # 元件
    components = {}
    for m in re.finditer(r'\(comp\s+\(ref\s+"([^"]+)"\)(.*?)(?=\(comp\s+\(ref|\Z)',
                         text, re.DOTALL):
        ref, body = m.group(1), m.group(2)
        val = re.search(r'\(value\s+"([^"]*)"', body)
        fp  = re.search(r'\(footprint\s+"([^"]*)"', body)
        components[ref] = {'ref': ref,
                           'value': val.group(1) if val else '',
                           'footprint': fp.group(1) if fp else ''}

    # 网络
    nets = defaultdict(list)
    for m in re.finditer(r'\(net\s+\(code\s+"[^"]*"\)\s*\(name\s+"([^"]+)"\)(.*?)'
                         r'(?=\(net\s+\(code|\Z)', text, re.DOTALL):
        name, body = m.group(1), m.group(2)
        for n in re.finditer(r'\(node\s+\(ref\s+"([^"]+)"\)\s+\(pin\s+"([^"]+)"\)', body):
            nets[name].append({'ref': n.group(1), 'pin': n.group(2)})

    # 反向索引：每个元件的引脚连到哪个网络
    pin_nets = defaultdict(dict)
    for net, nodes in nets.items():
        if net.startswith('unconnected'):
            continue
        for node in nodes:
            pin_nets[node['ref']][node['pin']] = net

    return {'components': components, 'nets': dict(nets),
            'pin_nets': {k: dict(v) for k, v in pin_nets.items()}}

if __name__ == '__main__':
    data = parse_netlist(sys.argv[1])
    print(json.dumps(data, indent=2, ensure_ascii=False))
```

**第二步：运行，看提取出什么**

```bash title="运行解析脚本" frame="terminal"
python3 gen_code.py stm32-min.net --mcu U1
```

输出：

```
═══ U1 的引脚连接 ═══
  型号: STM32F103C8Tx
  pin 1   → +3V3
  pin 2   → /PC13          ← LED3
  pin 5   → /OSC_IN        ← 8MHz 晶振
  pin 6   → /OSC_OUT
  pin 7   → /NRST          ← 复位
  pin 25  → /PB12          ← 按键1
  pin 26  → /PB13          ← 按键2
  pin 27  → /PB14          ← LED1
  pin 28  → /PB15          ← LED2
```

**第三步：AI 生成代码**

把上面这些数据 + `embedded-systems` skill 的指导交给 AI，生成 `main.c`（290 行）。

生成结果的关键片段：

```c title="main.c（节选：引脚定义）" frame="code"
/* LED —— 低电平点亮（见文件头说明） */
#define LED1_PIN    GPIO_Pin_14      /* U1.27 ← netlist: /PB14 → R2.2 */
#define LED2_PIN    GPIO_Pin_15      /* U1.28 ← netlist: /PB15 → R3.2 */
#define LED3_PIN    GPIO_Pin_13      /* U1.2  ← netlist: /PC13 → R4.2 */

/* 按键 —— 内部上拉，按下为低 */
#define KEY1_PIN    GPIO_Pin_12      /* U1.25 ← netlist: /PB12 → SW1.1 */
#define KEY2_PIN    GPIO_Pin_13      /* U1.26 ← netlist: /PB13 → SW2.1 */

/* 晶振 —— netlist: /OSC_IN → Y1.1, /OSC_OUT → Y1.2 */
#define HSE_VALUE_HZ    8000000UL    /* Y1 = 8MHz ← netlist 的 value 字段 */
```

时钟配置**直接用 netlist 里的晶振频率**：

```c title="main.c（节选：时钟初始化）" frame="code"
static void System_Clock_Init(void)
{
    RCC_HSEConfig(RCC_HSE_ON);
    if (RCC_WaitForHSEStartUp() == SUCCESS)
    {
        /* netlist 显示 Y1 = 8MHz + 22pF 负载电容 → HSE × 9 = 72MHz */
        RCC_PLLConfig(RCC_PLLSource_HSE_Div1, RCC_PLLMul_9);

        FLASH_PrefetchBufferCmd(FLASH_PrefetchBuffer_Enable);
        FLASH_SetLatency(FLASH_Latency_2);

        RCC_HCLKConfig(RCC_SYSCLK_Div1);
        RCC_PCLK1Config(RCC_HCLK_Div2);
        RCC_PCLK2Config(RCC_HCLK_Div1);

        RCC_PLLCmd(ENABLE);
        while (RCC_GetFlagStatus(RCC_FLAG_PLLRDY) == RESET) { }
        RCC_SYSCLKConfig(RCC_SYSCLKSource_PLLCLK);
        while (RCC_GetSYSCLKSource() != 0x08) { }
    }
    else
    {
        /* HSE 起振失败 —— 退回 HSI，程序仍能运行 */
        FLASH_SetLatency(FLASH_Latency_0);
    }
}
```

**第四步：编译验证**（用第九节的工具链）

```bash title="编译 main.c" frame="terminal"
arm-none-eabi-gcc -mcpu=cortex-m3 -mthumb -Wall -Wextra \
  -I<STM32 库路径>/Start -I<...>/Library -I<...>/User \
  -DSTM32F10X_MD -DUSE_STDPERIPH_DRIVER \
  -c main.c -o build/main.o
```

```
退出码: 0
（无警告无错误）

   text    data     bss     dec     hex
    480       0       0     480     1e0   build/main.o
```

**编译通过，480 字节代码段**——这是整条链路的最后一个可验证产物。

### 诚实标注：哪些是"读出来的"，哪些是"猜的"

这是这类工作**最重要的一点**。netlist 只记录**物理连接**，不记录**设计意图**。

生成代码时我在文件头明确区分了两类信息：

| 类别 | 内容 | 可信度 |
| --- | --- | --- |
| ✅ **来自 netlist** | MCU 型号、晶振频率、电阻电容值、**每一根引脚连接** | 可信——直接从原理图读出 |
| ⚠️ **AI 推断** | LED 是低电平还是高电平点亮、按键是否需要内部上拉、消抖时间 20ms | **需人工确认** |

例如：

```c title="main.c 文件头（AI 推断标注）" frame="code"
 * 【AI 推断 —— 需人工确认】
 *   ⚠️ LED 极性: netlist 只显示"LED1_A 网络连接 R2 和 D1 的第 1 脚"，
 *      无法从中判断 LED 是高电平点亮还是低电平点亮。
 *      本代码按【低电平点亮】编写，依据是 D1 的阴极(第2脚)接 GND。
 *      如果实际硬件相反，把 LED_On/LED_Off 里的位操作对调即可。
```

**为什么不能全自动**：netlist 描述的是"R2.2 和 D1.1 相连"，但"这是 LED 限流电阻、GPIO 应配置为推挽输出"是**人的判断**。AI 能做出合理推断，但推断可能错。

---

## 十一、最终环境总览

所有工具链的实测验证结果：

| 组件 | 版本 | 来源 | 验证方式 |
| --- | --- | --- | --- |
| **KiCad** | 10.0.6 | dnf | 224 符号库 / 155 封装库 / 3.2GB 3D 模型 |
| **Node.js** | v24.14.0 | nvm | `node -e` 实际执行 |
| **Python** | 3.14.7 | 系统 | `import pcbnew` 并构造 BOARD |
| **Java** | OpenJDK 25.0.2 (Temurin) | sdkman | 运行 `.java` 单文件程序 |
| **uvx** | 0.10.10 | 系统 | Python 系 MCP 候选的运行方式 |
| **KiCAD-MCP-Server** | 2.7.0 | [mixelpixx](https://github.com/mixelpixx/KiCAD-MCP-Server)（2350⭐） | MCP 握手测试 → **233 个工具** |
| **Freerouting** | 2.4.1 | [freerouting](https://github.com/freerouting/freerouting)（2002⭐） | `check_freerouting` → `ready: true` |
| **arm-none-eabi-gcc** | 15.2.0 (Fedora) | dnf | 编译 Cortex-M3 目标文件 |
| **kicad-happy** | — | [aklofas](https://github.com/aklofas/kicad-happy)（1257⭐） | 11 skills |
| **kistack** | — | [american-embedded](https://github.com/american-embedded/kistack)（386⭐） | 10 skills |
| **diodeinc/pcb** | — | [diodeinc](https://github.com/diodeinc/pcb)（450⭐） | 5 skills |
| **embedded-systems** | — | [jeffallan](https://github.com/jeffallan/claude-skills)（11537⭐） | MCU 代码规范 |
| **Claude Code** | — | — | 19 个插件 / 72 个全局 skills |

**工程产物**（第十节实战，全部实测）：

| 阶段 | 产物 | 数量/结果 |
| --- | --- | --- |
| 原理图 | 元件 / 引脚连接 | 17 元件 / 32 引脚 |
| | **ERC** | **0 violations** |
| PCB | 网络 / 走线 / 过孔 | 13 网络 / 141 走线 / 14 过孔 |
| | **DRC** | **0 violations, 0 unconnected** |
| 制造文件 | Gerber | 13 个文件 |
| | 钻孔 / BOM / PDF / STEP | 各 1 份 |
| 代码 | `main.c` → `main.o` | 290 行 → 480 字节 text 段 |

**辅助工具链**（上一篇配的）：`st-flash` / `JLinkExe`（把固件烧进实物验证）。

---

## 十二、踩坑清单

按"值得记住"排序：

1. **venv 隔离导致 pcbnew 不可见** ⭐⭐⭐ — MCP 自动用 `.venv`，但 venv 看不到系统包。改 `pyvenv.cfg` 的 `include-system-site-packages`。报错信息完全不提示是这个原因，最难定位。

2. **`set_design_rules` 不落盘** ⭐⭐ — MCP 改的是内存状态，`kicad-cli` 读磁盘。设计规则要直接改 `.kicad_pro` 文件。表现为"改了没效果"。

3. **符号库表首次使用前不存在** ⭐⭐ — `~/.config/kicad/10.0/sym-lib-table` 要手动从模板复制，否则 MCP 找不到任何符号库。握手正常但一画图就失败。

4. **Fedora 的 Python 路径与 Debian 不同** — 是 `/usr/lib64/python3.14/site-packages/`，不是 `dist-packages`。照抄教程配 PYTHONPATH 反而错。

5. **Fedora 没有 `kicad-libraries` 包** — 那是 Debian 包名，Fedora 的库随主包。缺库时 `dnf reinstall kicad`。

6. **官方 `install-linux.sh` 是 Ubuntu 专用** — 用 `apt-get` 和 PPA，Fedora 上跑不了，手动执行等价步骤。

7. **Freerouting 版本要现查** — 网上写的 v2.0.1 已过时，实际最新是 v2.4.1。旧 URL 返回 9 字节的 `Not Found`，`curl` 不报错，只是静默存下坏文件。

8. **`✗ PromptScript does not support global...` 是误报** — Claude Code 格式其实装成功了。判断方法：看 `~/.claude/skills/` 里有没有对应目录，别信这行输出。

9. **`import pcbnew` 的断言噪音** — `assert "m_choices.GetCount() > 0" failed`，KiCad 10.0.6 在 Fedora 下的已知问题，退出码为 0，无害。

10. **`suggest_placement` 对重叠元件不适用** — 元件全在原点时 HPWL 评分失真（`improvement_pct: -159.8`），越优化越差。改手动指定坐标。

---

## 十三、AI 做硬件设计的边界

跑完整个链路后，我的结论：

### ✅ AI 现在能做好的

| 能力 | 证据 |
| --- | --- |
| 读写原理图 | 17 个元件、32 个引脚连接，**ERC 0 violation** |
| 生成 PCB + 自动布线 | 141 走线 / 14 过孔，10.1 秒，**DRC 0 violations** |
| 导出制造文件 | 13 个 Gerber + 钻孔 + BOM + PDF + STEP |
| **从网表生成代码** | **编译通过，480 字节代码段** |
| 查数据手册、比价选型 | `kicad-happy` 系列 skills |

共同点：**这些任务都有确定性输入和可验证的输出**。ERC/DRC 能给出 0/非 0 的结果，编译能给出退出码——AI 可以在这类反馈下工作。

### ⚠️ AI 做不好的

| 问题 | 表现 |
| --- | --- |
| **原理图排版美观度** | 文字重叠、布局不合理。需要人眼判断，而 MCP 只有坐标级 API——它能算出"这个符号放在 (100.33, 74.93)"，但算不出"这样放好不好看" |
| **电气语义推断** | 能猜 LED 极性，但可能猜错。netlist 只有连接关系，没有设计意图 |
| **元件选型** | 能给出候选，但电压余量、精度等级、温度范围要人判断 |
| **高频 / EMI / 散热** | 完全超出能力范围。这些依赖场求解和实测，不是靠读文件能解决的 |

**关于排版问题的诚实说明**：这个问题**我没有解决**，也没有绕过。目前的做法是接受它——原理图电气上正确、ERC 干净，但外观不达标。这也是本文**没有贴原理图截图**的原因：截图会直接暴露排版问题，而我不想用一张精心挑选角度的图掩盖它。要真正解决，需要在 MCP 之上再做一层"布局约束求解"，那是另一个工程。

### 🚨 打样前必做的人工检查

**ERC/DRC 通过 ≠ 设计正确。** 这两个检查只验证"规则"，不验证"设计意图"。

- [ ] 原理图 PDF 通读，确认拓扑
- [ ] 每个元件的封装与实际库存核对
- [ ] 关键元件查 datasheet 确认引脚定义
- [ ] Gerber 用在线查看器预览（如 JLCPCB 的 Gerber viewer）
- [ ] DRC 报告每条 violation 都确认
- [ ] 电源部分重点检查（电压、电流余量、去耦位置）
- [ ] 机械尺寸和安装孔位

---

## 结语

整条链路是通的，而且每一环都有**可验证的产物**：

```
需求  →  原理图  →  PCB  →  布线  →  Gerber  →  代码
        ERC 0       DRC 0    141 走线   13 个文件   编译通过 480B
```

**最值得记的两点**：

1. **KiCad 的开放文件格式是前提**。S-expression 是纯文本，AI 才能直接操作。换成封闭格式的 EDA 工具，这套做法行不通——这也是为什么整篇文章都围绕 KiCad 展开。

2. **AI 能"读出"原理图数据，但"理解"电路需要人**。netlist 给的是连接关系（确定性的），设计意图（LED 极性、去耦策略、EMC 考虑）需要判断。所以生成代码时我严格区分了「来自 netlist」和「AI 推断」两类信息——**这个区分比代码本身更重要**。

硬件设计不像纯软件——**错误要花钱**。AI 能大幅加速设计流程，但打样前的复核不能省。这一篇里 233 个 MCP 工具、27 个 skills 让 AI 学会了"怎么操作"和"该怎么做"，但没有让它学会"这样设计对不对"。
