# KiCad + MCP 自动化 PCB 设计工具链 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Fedora 44 上配置一套能由 AI 通过 MCP 驱动的 KiCad 自动化 PCB 设计工具链，实现原理图→PCB→BOM→Gerber 的全流程。

**Architecture:** 三层结构。底层是 KiCad 10.x（提供 `kicad-cli` 和文件格式支持）；中层是 `mcp-server-kicad`（109 个工具，通过 MCP 协议暴露 KiCad 的读写/检查/导出能力）；上层是 Claude Code（消费 MCP 工具，配合设计 skills 编排流程）。

**Tech Stack:** KiCad 10.0.6（dnf）、Python 3.10+、uvx 0.10.10、mcp-server-kicad 0.11.0、Claude Code

**Spec:** 无独立 spec——本计划基于 2026-09-19 的调研对话，需求由用户直接提出：「自动绘制 PCB/原理图、生成 BOM 表、根据原理图数据编写对应代码」

## Global Constraints

- 平台：Fedora 44，内核 7.x
- KiCad 版本必须 ≥ 9.x（MCP 的导出/ERC/DRC 工具依赖 `kicad-cli`）；dnf 提供 10.0.6
- Python ≥ 3.10（当前 3.14.7 ✓）
- MCP 服务器通过 `uvx` 运行，不污染系统 Python
- 所有验证必须产生**可观测的产物**（文件、退出码、解析结果），不能只看版本号
- **风险声明**：AI 生成的电路板必须人工复核后才能打样。ERC/DRC 通过 ≠ 设计正确（元件选型、去耦布局、EMI、散热 AI 无法可靠判断）

---

## 文件结构

| 路径 | 职责 |
|---|---|
| `/etc/mcp/` 或 uvx 缓存 | mcp-server-kicad 包（由 uvx 管理，不手动放） |
| `~/.claude.json` | 全局 MCP 服务器注册（`mcpServers` 字段） |
| `~/kicad-projects/` | 测试用 KiCad 工程目录（新建） |
| `~/kicad-projects/blinky-test/` | 端到端验证工程：一个 LED 闪烁电路 |
| `/usr/share/kicad/` | KiCad 官方符号库和封装库（dnf 安装时自带） |

**为什么这样划分**：KiCad 和 MCP 服务器都是系统级/用户级安装，不属于任何代码仓库；测试工程单独放 `~/kicad-projects/`，避免污染已有的博客仓库和 STM32 工程。

---

## Task 1: 安装 KiCad 10.x

**Files:**
- Create: 无（系统包安装）
- Verify: `/usr/bin/kicad-cli`、`/usr/share/kicad/library/`

**Interfaces:**
- Consumes: 无
- Produces: `kicad-cli` 可执行文件（后续 Task 3 的 ERC/DRC/导出依赖它）；KiCad 文件格式支持（Task 4-7 依赖）

- [ ] **Step 1: 检查 KiCad 是否已安装**

```bash
command -v kicad-cli && kicad-cli version
```

期望：如果已装会输出版本号；正常情况下应该报 `command not found`（当前状态：未装）

- [ ] **Step 2: 安装 KiCad**

```bash
sudo dnf install -y kicad kicad-packages3d
```

说明：`kicad-packages3d` 是 3D 模型包（约 1GB），用于导出 STEP/STL。如果不需要 3D 导出可以省略。

预计耗时 5-10 分钟（下载约 2-4GB）。

- [ ] **Step 3: 验证 kicad-cli 可用**

```bash
kicad-cli version
```

期望输出：`10.0.6` 或类似版本号

- [ ] **Step 4: 验证 KiCad 库文件存在**

```bash
ls /usr/share/kicad/symbols/ | head -5
ls /usr/share/kicad/footprints/ | head -5
```

期望：能看到大量 `.kicad_sym` 和 `.pretty` 目录，例如 `Device.kicad_sym`、`Resistor_SMD.pretty`

如果目录不存在，说明 `kicad-libraries` 未随主包装上，补装：

```bash
sudo dnf install -y kicad-libraries
```

- [ ] **Step 5: 验证 kicad-cli 的实际功能（不只是版本号）**

```bash
kicad-cli --help
```

期望：能看到子命令列表，关键是包含 `sch`（原理图）和 `pcb`（PCB）分组，以及 `export` 子命令。

检查关键子命令：

```bash
kicad-cli sch export --help
kicad-cli pcb export --help
```

期望：`sch export` 里有 `pdf`、`netlist`、`bom`；`pcb export` 里有 `gerbers`、`drill`、`step`

**这一步是真正的验证**——MCP 的导出工具全部依赖这些子命令，如果这里缺了，后面全部会失败。

- [ ] **Step 6: 记录 KiCad 版本到计划文件**

```bash
kicad-cli version | tee -a /tmp/kicad-install-log.txt
```

---

## Task 2: 安装并验证 mcp-server-kicad

**Files:**
- Create: 无（uvx 管理包缓存）
- Verify: `uvx mcp-server-kicad --help` 可运行

**Interfaces:**
- Consumes: Task 1 的 `kicad-cli`（仅在调用导出工具时需要）
- Produces: `mcp-server-kicad` 可执行入口（Task 3 注册到 Claude Code）

- [ ] **Step 1: 确认 uvx 可用**

```bash
uvx --version
```

期望：`uvx 0.10.10`（当前已装）

- [ ] **Step 2: 试运行 MCP 服务器（不注册，先验证能启动）**

```bash
timeout 15 uvx mcp-server-kicad --help 2>&1 | head -30
```

期望：显示帮助信息或启动日志。首次运行会下载包（约几十 MB），需要等待。

可能的输出形态：
- 如果支持 `--help`：显示工具列表或用法
- 如果是纯 stdio 服务器：可能直接开始等待 stdin 输入（被 timeout 终止），这也是正常的——说明服务器能启动

- [ ] **Step 3: 验证包已缓存**

```bash
ls ~/.cache/uv/ 2>/dev/null | head -3
```

期望：能看到 uv 的缓存目录，说明包已下载

- [ ] **Step 4: 用 MCP 协议握手测试**

创建测试脚本：

```bash
cat > /tmp/mcp-test.py <<'PYEOF'
import json, subprocess, sys

proc = subprocess.Popen(
    ["uvx", "mcp-server-kicad"],
    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    text=True
)

# MCP 初始化握手
init = {
    "jsonrpc": "2.0", "id": 1, "method": "initialize",
    "params": {
        "protocolVersion": "2024-11-05",
        "capabilities": {},
        "clientInfo": {"name": "test", "version": "1.0"}
    }
}
proc.stdin.write(json.dumps(init) + "\n")
proc.stdin.flush()

import time
time.sleep(3)
proc.terminate()
out, err = proc.communicate(timeout=10)

print("=== stdout ===")
print(out[:800])
print("=== stderr ===")
print(err[:400])
PYEOF

python3 /tmp/mcp-test.py
```

期望：stdout 里有 JSON 响应，包含 `"result"` 和 `"serverInfo"` 字段。看到这个说明 MCP 服务器能正常响应协议请求。

如果 stdout 为空但 stderr 有错误，把错误记录下来——可能需要额外的依赖。

---

## Task 3: 注册 MCP 服务器到 Claude Code

**Files:**
- Modify: `~/.claude.json`（添加 `mcpServers` 条目）

**Interfaces:**
- Consumes: Task 2 验证过的 `uvx mcp-server-kicad`
- Produces: Claude Code 里可用的 KiCad 工具（Task 5-7 依赖）

- [ ] **Step 1: 备份现有配置**

```bash
cp ~/.claude.json ~/.claude.json.bak-$(date +%Y%m%d)
ls -la ~/.claude.json.bak-*
```

期望：看到备份文件

- [ ] **Step 2: 用 claude mcp 命令注册（优先方式）**

```bash
claude mcp add kicad --scope user -- uvx mcp-server-kicad
```

期望：提示添加成功

如果这个命令不存在或报错，改用 Step 3 的手动方式。

- [ ] **Step 3: 手动编辑配置（备选）**

读取当前配置：

```bash
python3 -c "
import json, os
p = os.path.expanduser('~/.claude.json')
d = json.load(open(p))
print(json.dumps(d.get('mcpServers', {}), indent=2, ensure_ascii=False))
"
```

在 `mcpServers` 字段添加：

```json
{
  "mcpServers": {
    "kicad": {
      "command": "uvx",
      "args": ["mcp-server-kicad"]
    }
  }
}
```

用 Python 脚本安全地合并（不破坏其他字段）：

```bash
python3 <<'PYEOF'
import json, os
p = os.path.expanduser('~/.claude.json')
d = json.load(open(p))
d.setdefault('mcpServers', {})
d['mcpServers']['kicad'] = {
    "command": "uvx",
    "args": ["mcp-server-kicad"]
}
json.dump(d, open(p, 'w'), indent=2, ensure_ascii=False)
print("✅ 已写入")
PYEOF
```

- [ ] **Step 4: 验证配置已写入**

```bash
claude mcp list 2>&1 | head -20
```

期望：列表中包含 `kicad`，状态显示为 connected 或类似

或者直接读配置文件确认：

```bash
python3 -c "
import json, os
d = json.load(open(os.path.expanduser('~/.claude.json')))
print(json.dumps(d.get('mcpServers', {}), indent=2))
"
```

期望：看到 `kicad` 条目

- [ ] **Step 5: 重启 Claude Code 并验证工具可用**

**这一步需要用户操作**：退出当前会话，重新启动 Claude Code。

重启后，在会话中运行 `/mcp` 查看 KiCad 服务器状态。

期望：`kicad` 显示为 connected，工具数量显示为 100+

如果显示 failed，查看错误信息——最常见的原因是 `uvx` 不在 PATH 中（Claude Code 启动时的环境变量可能不同）。解决方案是在配置里用绝对路径：

```bash
which uvx   # 记下路径，例如 /home/zizimiku/.local/bin/uvx
```

然后修改配置里的 `command` 字段为绝对路径。

---

## Task 4: 创建测试工程并验证 MCP 能读写 KiCad 文件

**Files:**
- Create: `~/kicad-projects/blinky-test/`（KiCad 工程目录）
- Create: `~/kicad-projects/blinky-test/blinky-test.kicad_pro`
- Create: `~/kicad-projects/blinky-test/blinky-test.kicad_sch`

**Interfaces:**
- Consumes: Task 3 注册的 MCP 工具（`create_project`、`place_component` 等）
- Produces: 一个可被 KiCad 打开的工程（Task 5-7 的输入）

- [ ] **Step 1: 创建工程目录**

```bash
mkdir -p ~/kicad-projects/blinky-test
cd ~/kicad-projects/blinky-test
pwd
```

期望：目录创建成功，路径为 `/home/zizimiku/kicad-projects/blinky-test`

- [ ] **Step 2: 用 MCP 的 create_project 工具创建工程**

**这一步在 Claude Code 会话中进行**（不是 Bash）。调用 MCP 工具：

```
使用 kicad MCP 的 create_project 工具，在 ~/kicad-projects/blinky-test/ 创建一个名为 blinky-test 的工程
```

期望：工具返回成功，目录下出现 `.kicad_pro` 和 `.kicad_sch` 文件

- [ ] **Step 3: 验证文件真的被创建**

```bash
ls -la ~/kicad-projects/blinky-test/
```

期望：看到 `blinky-test.kicad_pro` 和 `blinky-test.kicad_sch`

- [ ] **Step 4: 验证文件是合法的 KiCad 格式**

```bash
head -20 ~/kicad-projects/blinky-test/blinky-test.kicad_sch
```

期望：看到 S-expression 格式的内容，类似：

```
(kicad_sch (version 20231120) (generator eeschema)
  (uuid ...)
  (paper "A4")
  ...
)
```

关键是要有 `kicad_sch` 根节点和 `version` 字段。

- [ ] **Step 5: 用 kicad-cli 验证文件可被 KiCad 解析**

```bash
cd ~/kicad-projects/blinky-test
kicad-cli sch export netlist blinky-test.kicad_sch -o /tmp/test-netlist.net 2>&1
echo "退出码: $?"
ls -la /tmp/test-netlist.net 2>/dev/null
```

期望：退出码 0，生成了 netlist 文件。这一步证明文件格式合法且 KiCad 能解析。

---

## Task 5: 用 MCP 生成一个完整的原理图

**Files:**
- Modify: `~/kicad-projects/blinky-test/blinky-test.kicad_sch`

**Interfaces:**
- Consumes: Task 4 创建的空工程
- Produces: 含元件和连线的原理图（Task 6 的输入）

**电路规格**（一个最简可验证的电路）：
- `V1`: 3.3V 电源
- `R1`: 1kΩ 电阻（0805 封装）
- `D1`: LED（0805 封装）
- `GND`: 地
- 连接：V1 → R1 → D1 → GND

- [ ] **Step 1: 让 AI 放置元件**

在 Claude Code 会话中：

```
用 kicad MCP 在 blinky-test 原理图中放置以下元件：
- 一个电源符号 VCC (3.3V)
- 一个电阻 R1，阻值 1k，封装 0805
- 一个 LED D1，封装 0805
- 一个 GND 符号
```

期望：MCP 返回成功，元件被写入 `.kicad_sch`

- [ ] **Step 2: 验证元件已写入文件**

```bash
grep -c "symbol" ~/kicad-projects/blinky-test/blinky-test.kicad_sch
grep -oE '\(property "Reference" "[^"]*"' ~/kicad-projects/blinky-test/blinky-test.kicad_sch | head -10
```

期望：能看到 `R1`、`D1`、`VCC`、`GND` 等参考编号

- [ ] **Step 3: 让 AI 连线**

在 Claude Code 会话中：

```
用 MCP 把元件连起来：VCC → R1 → D1 → GND
使用 wire_pins_to_net 或 connect_pins 工具
```

期望：MCP 返回成功

- [ ] **Step 4: 验证连线已建立**

```bash
grep -c "(wire" ~/kicad-projects/blinky-test/blinky-test.kicad_sch
```

期望：计数 > 0，说明有连线

- [ ] **Step 5: 运行 ERC 检查**

在 Claude Code 会话中：

```
用 MCP 的 run_erc 工具检查 blinky-test 原理图
```

期望：返回 ERC 报告。理想情况是 0 errors。如果有 warning（如"电源引脚未驱动"），记录下来——这在只有符号没有实际电源芯片的测试电路里是正常的。

或者用命令行验证：

```bash
cd ~/kicad-projects/blinky-test
kicad-cli sch erc blinky-test.kicad_sch -o /tmp/erc-report.rpt --exit-code-violations 2>&1
echo "退出码: $?"
cat /tmp/erc-report.rpt 2>/dev/null | head -20
```

期望：能看到 ERC 报告内容

- [ ] **Step 6: 导出 netlist 验证电路完整性**

```bash
cd ~/kicad-projects/blinky-test
kicad-cli sch export netlist blinky-test.kicad_sch -o /tmp/blinky.net
cat /tmp/blinky.net | head -30
```

期望：netlist 里能看到元件列表和网络连接关系（`(nets` 部分应包含 R1、D1 的连接）

**这一步是关键验证**——netlist 正确说明原理图在电气上是通的。

---

## Task 6: 从原理图生成 PCB 并自动布线

**Files:**
- Create: `~/kicad-projects/blinky-test/blinky-test.kicad_pcb`
- Modify: 上述文件（布局和布线）

**Interfaces:**
- Consumes: Task 5 完成的原理图
- Produces: 完成布线的 PCB 文件（Task 7 的输入）

- [ ] **Step 1: 从原理图创建 PCB**

在 Claude Code 会话中：

```
用 MCP 从 blinky-test 原理图创建 PCB，板子尺寸 20mm x 20mm
```

期望：生成 `.kicad_pcb` 文件

- [ ] **Step 2: 验证 PCB 文件已创建**

```bash
ls -la ~/kicad-projects/blinky-test/*.kicad_pcb
head -10 ~/kicad-projects/blinky-test/blinky-test.kicad_pcb
```

期望：文件存在，内容是 S-expression 格式，有 `kicad_pcb` 根节点

- [ ] **Step 3: 放置封装**

在 Claude Code 会话中：

```
用 MCP 在 PCB 上放置所有元件的封装，并自动布局
```

期望：MCP 返回成功，`.kicad_pcb` 里出现 footprint 定义

- [ ] **Step 4: 验证封装已放置**

```bash
grep -c "footprint" ~/kicad-projects/blinky-test/blinky-test.kicad_pcb
```

期望：计数 ≥ 4（VCC/GND 可能不生成封装，R1 和 D1 至少各一个）

- [ ] **Step 5: 自动布线**

在 Claude Code 会话中：

```
用 MCP 的 autoroute_pcb 工具对 blinky-test 自动布线
```

期望：MCP 返回成功。注意：这个工具依赖 Freerouting，可能需要额外安装。

如果报错说缺 Freerouting，记录错误，改用 Step 6 的手动布线验证。

- [ ] **Step 6: 验证布线结果**

```bash
grep -c "(segment" ~/kicad-projects/blinky-test/blinky-test.kicad_pcb
```

期望：计数 > 0，说明有走线

- [ ] **Step 7: 运行 DRC 检查**

```bash
cd ~/kicad-projects/blinky-test
kicad-cli pcb drc blinky-test.kicad_pcb -o /tmp/drc-report.rpt 2>&1
echo "退出码: $?"
cat /tmp/drc-report.rpt | head -30
```

期望：DRC 报告能生成。理想是 0 violations。有 violation 的话记录下来，分析是设计问题还是规则过严。

---

## Task 7: 导出制造文件（Gerber + BOM）

**Files:**
- Create: `~/kicad-projects/blinky-test/gerbers/`（Gerber 文件目录）
- Create: `~/kicad-projects/blinky-test/bom.csv`

**Interfaces:**
- Consumes: Task 6 完成布线的 PCB
- Produces: 可直接送厂的文件（用户最终要的东西）

- [ ] **Step 1: 导出 Gerber**

```bash
cd ~/kicad-projects/blinky-test
mkdir -p gerbers
kicad-cli pcb export gerbers blinky-test.kicad_pcb -o gerbers/ 2>&1
ls -la gerbers/
```

期望：看到多个 `.gbr` 文件（顶层铜、底层铜、阻焊、丝印、板框等），典型有 7-9 个

- [ ] **Step 2: 导出钻孔文件**

```bash
cd ~/kicad-projects/blinky-test
kicad-cli pcb export drill blinky-test.kicad_pcb -o gerbers/ 2>&1
ls -la gerbers/*.drl
```

期望：看到 `.drl` 文件

- [ ] **Step 3: 导出 BOM**

```bash
cd ~/kicad-projects/blinky-test
kicad-cli sch export bom blinky-test.kicad_sch -o bom.csv 2>&1
cat bom.csv
```

期望：CSV 包含元件清单，字段类似：`Reference,Value,Footprint,Quantity`

- [ ] **Step 4: 验证 BOM 内容合理**

```bash
python3 -c "
import csv
with open('/home/zizimiku/kicad-projects/blinky-test/bom.csv') as f:
    rows = list(csv.DictReader(f))
print(f'元件行数: {len(rows)}')
for r in rows:
    print(' ', {k: v for k, v in list(r.items())[:4]})
"
```

期望：能看到 R1、D1 等元件，字段完整

- [ ] **Step 5: 导出 PDF 原理图（便于人工复核）**

```bash
cd ~/kicad-projects/blinky-test
kicad-cli sch export pdf blinky-test.kicad_sch -o blinky-schematic.pdf 2>&1
ls -la blinky-schematic.pdf
```

期望：生成 PDF 文件

- [ ] **Step 6: 汇总产物清单**

```bash
echo "═══ blinky-test 工程产物 ═══"
cd ~/kicad-projects/blinky-test
echo ""
echo "【原理图】"; ls -la *.kicad_sch *.pdf 2>/dev/null
echo ""
echo "【PCB】"; ls -la *.kicad_pcb 2>/dev/null
echo ""
echo "【Gerber】"; ls gerbers/*.gbr 2>/dev/null | wc -l | xargs echo "  文件数:"
echo "【钻孔】"; ls gerbers/*.drl 2>/dev/null | wc -l | xargs echo "  文件数:"
echo "【BOM】"; ls -la bom.csv 2>/dev/null
```

期望：所有产物齐全

---

## Task 8: 安装设计 skills（可选，但推荐）

**Files:**
- Create: `~/.claude/skills/`（skills 安装目录）

**Interfaces:**
- Consumes: Task 3 注册的 MCP 服务器
- Produces: 6 个设计流程 skills，指导 AI 按正确顺序使用 MCP 工具

**说明**：mcp-server-kicad 官方提供 Claude Code 插件，附带 6 个 skills（`using-kicad`、`circuit-design`、`schematic-plan`、`schematic-design`、`pcb-layout`、`verification`）。这些 skills 的价值是**编排顺序**——防止 AI 乱用工具（比如还没放元件就想连线）。

- [ ] **Step 1: 查看是否有官方插件可装**

```bash
claude plugin marketplace list
```

期望：看到已配置的市场

- [ ] **Step 2: 尝试从仓库安装 skills**

```bash
npx skills add ProductOfAmerica/mcp-server-kicad -l 2>&1 | head -20
```

期望：列出该仓库包含的 skills。`-l` 是只列出不安装。

- [ ] **Step 3: 安装 skills**

如果 Step 2 列出了 skills：

```bash
npx skills add ProductOfAmerica/mcp-server-kicad -g -y 2>&1 | tail -10
```

期望：安装成功

- [ ] **Step 4: 验证 skills 已装**

```bash
ls ~/.claude/skills/ | grep -iE "kicad|circuit|schematic|pcb"
```

期望：看到 `using-kicad` 或类似名称

- [ ] **Step 5: 记录结果**

如果这个仓库没有 skills（只有 MCP 工具），记录"无需安装"，因为 MCP 工具本身已经能用了。

---

## Task 9: 从原理图生成 MCU 初始化代码

**Files:**
- Create: `~/kicad-projects/blinky-test/gen_code.py`（netlist 解析 + 代码生成脚本）
- Create: `~/kicad-projects/blinky-test/main.c`（生成的代码）

**Interfaces:**
- Consumes: Task 5 导出的 netlist（`/tmp/blinky.net`）
- Produces: `main.c`（GPIO 初始化代码）

**原理说明**：

KiCad 导出的 netlist 是结构化文本，包含"哪个元件引脚连到哪个网络"。解析它能得到"PB12 接了 LED1"这类事实，进而生成 GPIO 初始化代码。

**关键限制**：netlist 里有**连接关系**，但没有**语义**——它不知道"LED 是低电平点亮"、"按键需要消抖"。所以只能生成**引脚定义和初始化框架**，业务逻辑仍需人工填写。

**为什么值得做**：省去手工抄引脚的工作，且避免抄错。

- [ ] **Step 1: 查看 netlist 的实际结构**

```bash
cat /tmp/blinky.net 2>/dev/null | head -50
```

期望：看到 S-expression 格式，关键部分是 `(nets ...)` 和 `(components ...)`

典型结构：

```
(components
  (comp (ref "R1") (value "1k") (footprint "Resistor_SMD:R_0805_2012Metric") ...)
  (comp (ref "D1") (value "LED") (footprint "LED_SMD:LED_0805_2012Metric") ...)
)
(nets
  (net (code "1") (name "VCC") (node (ref "R1") (pin "1")))
  (net (code "2") (name "Net-(D1-Pad1)") (node (ref "R1") (pin "2")) (node (ref "D1") (pin "1")))
  (net (code "3") (name "GND") (node (ref "D1") (pin "2")))
)
```

- [ ] **Step 2: 写 netlist 解析脚本**

```bash
cat > ~/kicad-projects/blinky-test/gen_code.py <<'PYEOF'
#!/usr/bin/env python3
"""从 KiCad netlist 生成 STM32 GPIO 初始化代码骨架。

用法: python3 gen_code.py blinky.net > main.c
"""
import re
import sys
from collections import defaultdict


def parse_netlist(path):
    """解析 KiCad netlist，返回 (元件列表, 网络字典)。

    网络字典格式: {网络名: [(元件引用, 引脚号), ...]}
    """
    text = open(path, encoding='utf-8').read()

    components = []
    # 匹配 comp 块
    for m in re.finditer(
        r'\(comp\s+\(ref\s+"([^"]+)"\)\s*\(value\s+"([^"]*)"\)\s*'
        r'(?:\(footprint\s+"([^"]*)"\))?',
        text
    ):
        components.append({
            'ref': m.group(1),
            'value': m.group(2),
            'footprint': m.group(3) or '',
        })

    nets = defaultdict(list)
    # 匹配 net 块（含内部 node）
    for m in re.finditer(
        r'\(net\s+\(code\s+"[^"]*"\)\s*\(name\s+"([^"]+)"\)(.*?)(?=\(net\s|\Z)',
        text, re.DOTALL
    ):
        net_name = m.group(1)
        body = m.group(2)
        for n in re.finditer(r'\(node\s+\(ref\s+"([^"]+)"\)\s*\(pin\s+"([^"]+)"\)\)', body):
            nets[net_name].append((n.group(1), n.group(2)))

    return components, dict(nets)


def generate_c(components, nets):
    """生成 C 代码骨架。"""
    lines = []
    lines.append('/* 由 gen_code.py 从 KiCad netlist 自动生成 */')
    lines.append('/* ⚠️ 这是骨架代码：引脚定义是准确的，但业务逻辑需人工填写 */')
    lines.append('')
    lines.append('#include "stm32f10x.h"')
    lines.append('')

    # 生成元件清单注释
    lines.append('/* === 元件清单（来自原理图）=== */')
    for c in components:
        lines.append(f'/*   {c["ref"]}: {c["value"]}  [{c["footprint"]}] */')
    lines.append('')

    # 生成网络连接注释——这是核心信息
    lines.append('/* === 网络连接（来自原理图）=== */')
    for net_name, nodes in sorted(nets.items()):
        node_str = ', '.join(f'{r}.{p}' for r, p in nodes)
        lines.append(f'/*   {net_name}: {node_str} */')
    lines.append('')

    # 生成 GPIO 初始化骨架
    lines.append('void Hardware_Init(void)')
    lines.append('{')
    lines.append('    GPIO_InitTypeDef GPIO_InitStructure;')
    lines.append('')
    lines.append('    /* TODO: 根据上面的网络连接填写引脚配置 */')
    lines.append('    /* 例如：R1.1 接 VCC、R1.2 接 D1.1，说明某个 GPIO 驱动 LED */')
    lines.append('    /*')
    lines.append('    RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOB, ENABLE);')
    lines.append('    GPIO_InitStructure.GPIO_Mode  = GPIO_Mode_Out_PP;')
    lines.append('    GPIO_InitStructure.GPIO_Speed = GPIO_Speed_50MHz;')
    lines.append('    GPIO_InitStructure.GPIO_Pin   = GPIO_Pin_X;  // 从网络连接确定')
    lines.append('    GPIO_Init(GPIOB, &GPIO_InitStructure);')
    lines.append('    */')
    lines.append('}')
    lines.append('')
    lines.append('int main(void)')
    lines.append('{')
    lines.append('    Hardware_Init();')
    lines.append('')
    lines.append('    while (1)')
    lines.append('    {')
    lines.append('        /* TODO: 业务逻辑 */')
    lines.append('    }')
    lines.append('}')
    lines.append('')

    return '\n'.join(lines)


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(f'用法: {sys.argv[0]} <netlist文件>', file=sys.stderr)
        sys.exit(1)

    comps, net_dict = parse_netlist(sys.argv[1])

    # 统计信息打到 stderr，代码打到 stdout
    print(f'解析到 {len(comps)} 个元件, {len(net_dict)} 个网络', file=sys.stderr)

    print(generate_c(comps, net_dict))
PYEOF

chmod +x ~/kicad-projects/blinky-test/gen_code.py
echo "✅ 脚本已创建"
```

期望：脚本写入成功

- [ ] **Step 3: 运行脚本生成代码**

```bash
cd ~/kicad-projects/blinky-test
python3 gen_code.py /tmp/blinky.net > main.c
echo "退出码: $?"
cat main.c
```

期望：stderr 输出统计信息（如"解析到 4 个元件, 3 个网络"），stdout 输出 C 代码

- [ ] **Step 4: 验证生成的代码包含正确的引脚信息**

```bash
grep -E "R1|D1|VCC|GND" ~/kicad-projects/blinky-test/main.c
```

期望：能看到从 netlist 提取的元件清单和网络连接

**这一步验证的是核心价值**：代码里的引脚定义确实来自原理图，而不是编造的。

- [ ] **Step 5: 验证生成的代码能通过语法检查**

```bash
cd ~/kicad-projects/blinky-test
arm-none-eabi-gcc -mcpu=cortex-m3 -mthumb -fsyntax-only \
  -I~/Downloads/STM32_test/Start -I~/Downloads/STM32_test/Library \
  -DSTM32F10X_MD -DUSE_STDPERIPH_DRIVER \
  main.c 2>&1 | head -10
echo "退出码: $?"
```

期望：退出码 0（无语法错误）。如果有 `stm32f10x.h` 找不到的错误，检查 `-I` 路径是否正确。

这一步证明生成的是**合法可编译的 C 代码**，不是一段看起来像代码的文本。

- [ ] **Step 6: 记录局限性与后续方向**

在代码生成脚本顶部已经写明了局限。补充说明到 README：

```bash
cat >> ~/kicad-projects/README.md <<'MDEOF'

## 原理图 → 代码生成

`gen_code.py` 从 netlist 提取元件和网络连接，生成 C 代码骨架。

**能自动做的：**
- 提取元件清单（ref / value / footprint）
- 提取网络连接关系（哪个引脚连到哪个网络）
- 生成引脚定义和初始化函数框架

**不能自动做的（需人工填写）：**
- 引脚到 GPIO 端口号的映射（netlist 里是元件引脚号，不是 MCU 引脚）
- 电气语义（LED 高电平还是低电平点亮）
- 业务逻辑（消抖时间、状态机）

**为什么不能全自动**：netlist 描述的是**物理连接**，不包含**设计意图**。例如 "R1.2 连接 D1.1" 只说明这两个引脚相连，但"这是 LED 限流电阻、GPIO 应该配置为推挽输出"是人的判断。
MDEOF
echo "✅ README 已补充"
```

期望：文档更新成功

---

## Task 10: 端到端验证与文档

**Files:**
- Create: `~/kicad-projects/README.md`（使用说明）

**Interfaces:**
- Consumes: Task 1-9 的全部产物
- Produces: 可复现的操作文档

- [ ] **Step 1: 编写使用说明**

```bash
cat > ~/kicad-projects/README.md <<'MDEOF'
# KiCad + MCP 自动化 PCB 工作流

## 环境

- KiCad 10.0.6 (`kicad-cli`)
- mcp-server-kicad 0.11.0 (via uvx)
- Claude Code

## 工作流

1. **创建工程** — MCP `create_project`
2. **绘制原理图** — MCP `place_component` + `add_wires`
3. **电气检查** — MCP `run_erc` 或 `kicad-cli sch erc`
4. **创建 PCB** — MCP 从原理图生成
5. **布局布线** — MCP `place_footprint` + `autoroute_pcb`
6. **设计检查** — MCP `run_drc` 或 `kicad-cli pcb drc`
7. **导出** — Gerber / 钻孔 / BOM / PDF

## 命令行验证

```bash
cd ~/kicad-projects/blinky-test

# 原理图检查
kicad-cli sch erc blinky-test.kicad_sch -o /tmp/erc.rpt

# 导出网表
kicad-cli sch export netlist blinky-test.kicad_sch -o /tmp/blinky.net

# PCB 检查
kicad-cli pcb drc blinky-test.kicad_pcb -o /tmp/drc.rpt

# 导出 Gerber
kicad-cli pcb export gerbers blinky-test.kicad_pcb -o gerbers/

# 导出 BOM
kicad-cli sch export bom blinky-test.kicad_sch -o bom.csv
```

## ⚠️ 重要警告

**AI 生成的电路板必须人工复核后才能打样。**

ERC/DRC 通过 ≠ 设计正确。以下内容 AI 无法可靠判断，必须人工检查：

- 元件选型（供电电压、电流余量、精度等级）
- 去耦电容的位置和数量
- 高频信号走线、阻抗匹配
- EMI/EMC 问题
- 散热设计
- 机械尺寸和安装孔位

**打样前的检查清单：**
- [ ] 原理图 PDF 人工通读一遍
- [ ] BOM 里每个元件的封装与实际库存核对
- [ ] 关键元件的 datasheet 确认引脚定义
- [ ] Gerber 用在线查看器（如 JLCPCB 的 Gerber viewer）预览
- [ ] DRC 报告的每条 violation 都确认过
MDEOF

cat ~/kicad-projects/README.md
```

期望：文件写入成功

- [ ] **Step 2: 端到端重跑验证**

从零重复整个流程，确认可复现：

```bash
rm -rf ~/kicad-projects/e2e-test
mkdir -p ~/kicad-projects/e2e-test
echo "✅ 已清空，准备重跑"
```

然后在 Claude Code 会话中重复 Task 4-7 的 MCP 调用，观察是否能得到相同结果。

- [ ] **Step 3: 记录最终状态**

```bash
echo "═══ KiCad 工具链最终状态 ═══" | tee ~/kicad-projects/STATUS.md
echo "" >> ~/kicad-projects/STATUS.md
echo "KiCad: $(kicad-cli version)" >> ~/kicad-projects/STATUS.md
echo "uvx: $(uvx --version)" >> ~/kicad-projects/STATUS.md
echo "Python: $(python3 --version)" >> ~/kicad-projects/STATUS.md
echo "" >> ~/kicad-projects/STATUS.md
echo "MCP 配置:" >> ~/kicad-projects/STATUS.md
python3 -c "
import json, os
d = json.load(open(os.path.expanduser('~/.claude.json')))
print(json.dumps(d.get('mcpServers', {}), indent=2))
" >> ~/kicad-projects/STATUS.md

cat ~/kicad-projects/STATUS.md
```

期望：状态文件包含所有版本信息和配置

---

## 风险与限制

| 风险 | 影响 | 缓解 |
|---|---|---|
| mcp-server-kicad 只有 10 stars | 可能有未发现的 bug | 每步都用 `kicad-cli` 独立验证，不完全依赖 MCP |
| AI 生成电路不可靠 | 打样后才发现问题 → 浪费钱 | **必须人工复核**（Task 10 的检查清单） |
| `autoroute_pcb` 需要 Freerouting | 可能未安装导致失败 | Task 6 Step 5 有降级方案 |
| Claude Code 启动时 PATH 可能不含 uvx | MCP 连接失败 | Task 3 Step 5 有绝对路径方案 |
| KiCad 版本不匹配 | `kicad-cli` 拒绝处理 | 已确认 dnf 提供 10.0.6，MCP 要求 ≥9.x |
| 首次运行下载量大 | 耗时长 | KiCad 约 2-4GB，uvx 包约几十 MB |

## 范围外（本计划不做）

- 复杂的多层板设计
- 高速信号完整性分析
- 打样下单流程（JLCPCB/PCBWay API 集成）
- SPICE 仿真（可用 `kicad-happy@spice`，是另一套工具）
- **完整的代码生成器**：Task 9 只做骨架生成（引脚定义 + 初始化框架），不做完整的驱动代码生成

## 后续可能的扩展

1. **增强代码生成**：Task 9 的 `gen_code.py` 可扩展为——识别常见电路模式（LED/按键/UART/I2C），自动生成对应的驱动初始化代码
2. **集成 kicad-happy**：设计审查、EMC 预合规、分销商比价
3. **Zener 代码化设计**：用 Starlark 描述电路，更适合 AI 生成（`diodeinc/pcb`，450 stars）
4. **MCU 引脚映射**：Task 9 的局限是 netlist 里只有元件引脚号，需要额外维护"元件引脚 → MCU 引脚"的映射表才能完全自动化
