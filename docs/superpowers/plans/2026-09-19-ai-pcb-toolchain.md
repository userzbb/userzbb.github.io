# AI 驱动的 PCB 全链路工具链 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 配置一套由 AI 驱动的 PCB 设计工具链——AI 调用 MCP 工具读取/绘制原理图、生成 PCB、自动布线、产出 BOM，并根据原理图数据编写 MCU 代码。

**Architecture:** 三层。**工具层**：KiCad 10.x 提供文件格式与 `kicad-cli`；**协议层**：`mixelpixx/KiCAD-MCP-Server`（233 个工具）把 KiCad 能力暴露为 MCP；**知识层**：多个高星 skills 包提供领域知识（设计审查、BOM、datasheet、嵌入式编码）；**推理层**：Claude Code 编排全部。

**Tech Stack:**
- KiCad 10.0.6（dnf）
- mixelpixx/KiCAD-MCP-Server 2.7.0（2350⭐，Node.js + Python）
- Freerouting 2.0.1（2002⭐，Java 21+）
- aklofas/kicad-happy（1257⭐，11 skills）
- american-embedded/kistack（386⭐，10 skills）
- diodeinc/pcb（450⭐，5 skills）
- jeffallan/claude-skills@embedded-systems（11537⭐）

**Spec:** 无独立 spec。需求来自用户直接描述：「AI 调用工具读取原理图 / 根据需求绘制原理图 PCB / 生成 BOM 表 / 根据原理图编写代码」

## Global Constraints

- 平台：Fedora 44（Linux）
- Node.js ≥ 18（本机 v24.14.0 ✓）
- Python ≥ 3.9（本机 3.14.7 ✓）
- Java ≥ 21（本机 OpenJDK 25.0.2 ✓，Freerouting 用）
- `uvx` 用于 MCP（本机 0.10.10 ✓）
- 磁盘 ≥ 5GB（本机 362G ✓）
- **已知风险**：mixelpixx MCP 的 `docs/LINUX_COMPATIBILITY_AUDIT.md` 自评为「🟡 PARTIAL COMPATIBILITY」——原为 Windows 开发，Linux 需手工调整配置。本计划使用其官方 `config/linux-config.example.json` 模板规避。
- **安全声明**：AI 生成的电路板**必须人工复核后才能打样**。ERC/DRC 通过 ≠ 设计正确。

---

## 文件结构

| 路径 | 职责 |
|---|---|
| `/usr/bin/kicad-cli` | KiCad 命令行（dnf 安装） |
| `/usr/share/kicad/symbols/`, `/usr/share/kicad/footprints/` | 官方符号库与封装库 |
| `~/MCP/KiCAD-MCP-Server/` | MCP 服务器源码（git clone） |
| `~/MCP/KiCAD-MCP-Server/dist/index.js` | MCP 入口（构建产物） |
| `~/.claude.json` | MCP 注册配置（`mcpServers` 字段） |
| `~/.claude/skills/` | skills 安装目录 |
| `~/kicad-projects/` | 测试与真实工程目录 |
| `~/kicad-projects/blinky/` | 端到端验证工程 |
| `~/kicad-projects/blinky/gen_code.py` | netlist → C 代码生成脚本 |

---

## Task 1: 安装 KiCad 10.x

**Files:**
- Create: 无（系统包）
- Verify: `/usr/bin/kicad-cli`、`/usr/share/kicad/`

**Interfaces:**
- Consumes: 无
- Produces: `kicad-cli` 可执行文件（Task 6-9 的导出/检查依赖）；KiCad 文件格式支持（全部后续 Task 依赖）

- [ ] **Step 1: 确认 KiCad 未安装**

```bash
command -v kicad-cli && kicad-cli version || echo "KiCad 未安装，继续"
```

期望：报 `command not found`（当前状态：未装）

- [ ] **Step 2: 安装 KiCad**

```bash
sudo dnf install -y kicad kicad-packages3d
```

说明：`kicad-packages3d` 是 3D 模型（约 1GB），用于导出 STEP/STL。不需要 3D 可省略。

预计 5-15 分钟（下载 2-4GB）。

- [ ] **Step 3: 验证 kicad-cli 版本**

```bash
kicad-cli version
```

期望：`10.0.6`

- [ ] **Step 4: 验证 KiCad 库文件存在**

```bash
ls /usr/share/kicad/symbols/ | head -5
ls /usr/share/kicad/footprints/ | head -5
```

期望：看到 `Device.kicad_sym`、`Resistor_SMD.pretty` 等

如果不存在，**Fedora 上没有 `kicad-libraries` 这个包**（那是 Debian/Ubuntu 的包名）。Fedora 只有 `kicad`、`kicad-doc`、`kicad-packages3d` 三个包，库文件随 `kicad` 主包一起装。补救做法是重装主包：

```bash
sudo dnf reinstall -y kicad
```

- [ ] **Step 5: 验证 kicad-cli 的子命令（关键）**

```bash
kicad-cli sch export --help
kicad-cli pcb export --help
```

期望：
- `sch export` 包含 `pdf`、`netlist`、`bom`
- `pcb export` 包含 `gerbers`、`drill`、`step`

**这一步是真正的验证**——MCP 的导出工具全依赖这些子命令。

- [ ] **Step 6: 验证 Python 绑定 pcbnew**

```bash
python3 -c "import pcbnew; print('pcbnew:', pcbnew.GetBuildVersion())"
```

期望：输出版本号。如果报 `ModuleNotFoundError`，找出 KiCad 的 Python 绑定路径：

```bash
python3 -c "import pcbnew; print(pcbnew.__file__)"
find /usr -name "pcbnew.py" 2>/dev/null | head -3
```

**Fedora 的实际路径**（已验证）：`/usr/lib64/python3.14/site-packages/pcbnew.py`

> **注意平台差异**：Fedora 把 KiCad 的 Python 绑定装进**系统 site-packages**，而不是 Debian/Ubuntu 那种 `/usr/lib/kicad/lib/python3/dist-packages/`。所以裸 `python3` **无需任何 PYTHONPATH 就能 import pcbnew**——`/usr/lib64/python3.14/site-packages` 本来就在 `sys.path` 里。

记下真实路径，Task 2/3 的配置要用。

> **另注**：KiCad 10.0.6 在 Fedora 构建下，`import pcbnew` 会向 stderr 刷几行断言噪音（`assert "m_choices.GetCount() > 0" failed in PROPERTY_ENUM()`）。这是 KiCad 自身的已知问题，**不影响功能**——`GetBuildVersion()` 正常返回。

- [ ] **Step 7: 记录版本**

```bash
kicad-cli version | tee /tmp/kicad-version.txt
python3 -c "import pcbnew; print(pcbnew.GetBuildVersion())" 2>/dev/null | tee -a /tmp/kicad-version.txt
```

---

## Task 2: 安装 KiCAD-MCP-Server

**Files:**
- Create: `~/MCP/KiCAD-MCP-Server/`（git clone）
- Verify: `dist/index.js` 存在，Node 能加载

**Interfaces:**
- Consumes: Task 1 的 KiCad（运行期需要）
- Produces: `~/MCP/KiCAD-MCP-Server/dist/index.js`（Task 3 注册用）

- [ ] **Step 1: 创建目录并克隆**

```bash
mkdir -p ~/MCP && cd ~/MCP
git clone https://github.com/mixelpixx/KiCAD-MCP-Server.git
cd ~/MCP/KiCAD-MCP-Server
pwd
ls
```

期望：看到 `src/`、`package.json`、`docs/`、`config/` 等

- [ ] **Step 2: 查看安装脚本**

```bash
ls ~/MCP/KiCAD-MCP-Server/*.sh
cat ~/MCP/KiCAD-MCP-Server/setup-linux.sh 2>/dev/null | head -40
```

期望：看到 Linux 安装脚本（项目提供 `setup-linux.sh`）

**先读脚本再执行**——这是安全惯例。

- [ ] **Step 3: 运行安装脚本（或手动安装）**

如果 `setup-linux.sh` 存在且看起来安全：

```bash
cd ~/MCP/KiCAD-MCP-Server
bash setup-linux.sh
```

如果没有该脚本，手动执行：

```bash
cd ~/MCP/KiCAD-MCP-Server
npm install
npm run build
```

期望：`node_modules/` 和 `dist/` 生成，无致命错误

- [ ] **Step 4: 验证构建产物**

```bash
ls -la ~/MCP/KiCAD-MCP-Server/dist/index.js
```

期望：文件存在

- [ ] **Step 5: 验证 Node 能加载它**

```bash
cd ~/MCP/KiCAD-MCP-Server
node -e "console.log('Node OK:', process.version)"
timeout 10 node dist/index.js --help 2>&1 | head -20
```

期望：Node 正常；`--help` 输出帮助或被 timeout 终止（stdio 服务器等待输入是正常的）

- [ ] **Step 6: 确认 Python 能导入 pcbnew**

```bash
cd ~/MCP/KiCAD-MCP-Server
python3 -c "import pcbnew; print('pcbnew OK:', pcbnew.GetBuildVersion())"
```

期望：输出版本号

如果失败，设置 PYTHONPATH（路径来自 Task 1 Step 6）：

```bash
export PYTHONPATH="/usr/lib/kicad/lib/python3/dist-packages:/usr/share/kicad/scripting/plugins"
python3 -c "import pcbnew; print('pcbnew OK:', pcbnew.GetBuildVersion())"
```

---

## Task 3: 注册 MCP 到 Claude Code

**Files:**
- Modify: `~/.claude.json`（`mcpServers` 字段）
- Reference: `~/MCP/KiCAD-MCP-Server/config/linux-config.example.json`

**Interfaces:**
- Consumes: Task 2 的 `dist/index.js`
- Produces: Claude Code 中可调用的 233 个 KiCad 工具（Task 5-9 依赖）

- [ ] **Step 1: 查看官方 Linux 配置模板**

```bash
cat ~/MCP/KiCAD-MCP-Server/config/linux-config.example.json
```

期望输出（已核实）：

```json
{
  "mcpServers": {
    "kicad": {
      "command": "node",
      "args": ["/home/YOUR_USERNAME/MCP/KiCAD-MCP-Server/dist/index.js"],
      "env": {
        "NODE_ENV": "production",
        "PYTHONPATH": "/usr/share/kicad/scripting/plugins:/usr/lib/kicad/lib/python3/dist-packages",
        "LOG_LEVEL": "info",
        "KICAD_AUTO_LAUNCH": "false"
      }
    }
  }
}
```

- [ ] **Step 2: 备份配置**

```bash
cp ~/.claude.json ~/.claude.json.bak-$(date +%Y%m%d-%H%M%S)
ls -la ~/.claude.json.bak-*
```

- [ ] **Step 3: 确认实际路径**

```bash
echo "USER=$(whoami)"
ls -la ~/MCP/KiCAD-MCP-Server/dist/index.js
echo "PYTHONPATH 候选:"
ls -d /usr/lib/kicad/lib/python3/dist-packages 2>/dev/null
ls -d /usr/share/kicad/scripting/plugins 2>/dev/null
```

期望：`dist/index.js` 存在；PYTHONPATH 目录存在（若某个不存在，从配置里去掉）

- [ ] **Step 4: 写入配置**

用 Python 安全合并（不破坏其他字段）：

```bash
python3 <<'PYEOF'
import json, os

conf_path = os.path.expanduser('~/.claude.json')
home = os.path.expanduser('~')

d = json.load(open(conf_path))
d.setdefault('mcpServers', {})
d['mcpServers']['kicad'] = {
    "command": "node",
    "args": [f"{home}/MCP/KiCAD-MCP-Server/dist/index.js"],
    "env": {
        "NODE_ENV": "production",
        # Fedora 的 pcbnew 在系统 site-packages，无需额外 PYTHONPATH；
        # 这里只加 scripting/plugins（官方模板里的 dist-packages 路径在 Fedora 不存在）
        "PYTHONPATH": "/usr/share/kicad/scripting/plugins",
        "LOG_LEVEL": "info",
        "KICAD_AUTO_LAUNCH": "false"
    }
}
json.dump(d, open(conf_path, 'w'), indent=2, ensure_ascii=False)
print("✅ 已写入 mcpServers.kicad")
PYEOF
```

- [ ] **Step 5: 验证配置写入**

```bash
python3 -c "
import json, os
d = json.load(open(os.path.expanduser('~/.claude.json')))
print(json.dumps(d.get('mcpServers', {}), indent=2, ensure_ascii=False))
"
```

期望：看到 `kicad` 条目，路径正确

- [ ] **Step 6: 独立测试 MCP 握手（不依赖 Claude Code）**

```bash
cat > /tmp/mcp-kicad-test.py <<'PYEOF'
import json, subprocess, time, os

home = os.path.expanduser('~')
proc = subprocess.Popen(
    ["node", f"{home}/MCP/KiCAD-MCP-Server/dist/index.js"],
    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    text=True, env={**os.environ, "NODE_ENV": "production"}
)

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
time.sleep(5)

# 请求工具列表
proc.stdin.write(json.dumps({"jsonrpc": "2.0", "id": 2, "method": "tools/list"}) + "\n")
proc.stdin.flush()
time.sleep(5)

proc.terminate()
out, err = proc.communicate(timeout=15)

print("=== stdout (前600字符) ===")
print(out[:600])
if not out.strip():
    print("=== stderr (前600字符) ===")
    print(err[:600])
PYEOF

python3 /tmp/mcp-kicad-test.py
```

期望：stdout 有 JSON 响应，包含 `serverInfo` 和 `tools` 数组

如果 stdout 为空，看 stderr 的错误——常见问题是 `pcbnew` 导入失败或路径不对。

- [ ] **Step 7: 重启 Claude Code 并验证**

**需要用户操作**：退出当前会话，重新启动 Claude Code。

重启后运行 `/mcp` 查看状态。

期望：`kicad` 显示 connected，工具数 200+

如果显示 failed：
1. 检查 `node` 绝对路径：`which node`，如果是 nvm 管理的，配置里要用绝对路径
2. 查看 Claude Code 的 MCP 日志

修正后再次重启验证。

---

## Task 4: 安装高星 Skills 包

**Files:**
- Create: `~/.claude/skills/<skill-name>/`

**Interfaces:**
- Consumes: 无
- Produces: 30+ 个 EDA 相关 skills（Task 5-9 依赖）

**说明**：安装 4 个包，全部是高星且近期活跃：

| 包 | Stars | Skills 数 | 用途 |
|---|---|---|---|
| `aklofas/kicad-happy` | 1257 | 11 | 分析/审查/BOM/datasheet/EMC/SPICE |
| `diodeinc/pcb` | 450 | 5 | Zener 代码化设计、datasheet 解析 |
| `american-embedded/kistack` | 386 | 10 | 原理图/PCB/布局/导出（**创建流程**） |
| `jeffallan/claude-skills@embedded-systems` | 11537 | 1 | 教 AI 写正确的 MCU 代码 |

- [ ] **Step 1: 安装 kicad-happy（1257⭐，11 skills）**

```bash
npx -y skills add aklofas/kicad-happy -g -y 2>&1 | tail -15
```

期望：安装 11 个 skills

- [ ] **Step 2: 验证 kicad-happy 已装**

```bash
ls ~/.claude/skills/ | grep -E "^(kicad|bom|spice|emc|datasheets|digikey|mouser|lcsc|element14|jlcpcb|pcbway)$"
```

期望：看到 11 个目录名

- [ ] **Step 3: 安装 kistack（386⭐，10 skills）**

```bash
npx -y skills add american-embedded/kistack -g -y 2>&1 | tail -15
```

期望：安装 10 个 skills（`schematic`、`pcb`、`layout`、`bom`、`export`、`gerbers`、`panelize`、`footprint`、`symbol`、`pcb-product-render`）

- [ ] **Step 4: 验证 kistack 已装**

```bash
ls ~/.claude/skills/ | grep -E "^(schematic|layout|gerbers|panelize|footprint|symbol|pcb-product-render)$"
```

- [ ] **Step 5: 安装 diodeinc/pcb（450⭐，5 skills）**

```bash
npx -y skills add diodeinc/pcb -g -y 2>&1 | tail -15
```

期望：安装 5 个 skills（`zener-language`、`datasheet-reader`、`spice-sim`、`librarian`、`registry-search`）

- [ ] **Step 6: 安装 embedded-systems（11537⭐）**

```bash
npx -y skills add jeffallan/claude-skills@embedded-systems -g -y 2>&1 | tail -15
```

期望：安装成功

- [ ] **Step 7: 汇总验证**

```bash
echo "═══ 新装的 EDA 相关 skills ═══"
ls ~/.claude/skills/ | grep -iE "kicad|pcb|bom|spice|emc|datasheet|digikey|mouser|lcsc|jlcpcb|pcbway|schematic|layout|gerber|panelize|footprint|symbol|zener|librarian|registry|embedded"
echo ""
echo "总计: $(ls ~/.claude/skills/ | wc -l) 个全局 skills"
```

期望：看到 25+ 个新 skills

---

## Task 5: AI 读取原理图（验证工具层可用）

**Files:**
- Create: `~/kicad-projects/blinky/blinky.kicad_sch`

**Interfaces:**
- Consumes: Task 1 的 KiCad、Task 3 的 MCP 工具、Task 4 的 skills
- Produces: 一个可被解析的原理图（Task 6-9 的输入）

**这一步验证核心需求**：AI 能否通过 MCP 读取/创建原理图。

- [ ] **Step 1: 创建工程目录**

```bash
mkdir -p ~/kicad-projects/blinky
cd ~/kicad-projects/blinky && pwd
```

- [ ] **Step 2: 用 MCP 创建工程（在 Claude Code 会话中）**

在会话中调用：

```
用 kicad MCP 的 create_project 工具，在 ~/kicad-projects/blinky/ 创建名为 blinky 的工程
```

期望：MCP 返回成功，生成 `.kicad_pro`、`.kicad_sch`、`.kicad_pcb`

- [ ] **Step 3: 验证文件生成**

```bash
ls -la ~/kicad-projects/blinky/
```

期望：三个文件都在

- [ ] **Step 4: 验证文件格式合法**

```bash
head -15 ~/kicad-projects/blinky/blinky.kicad_sch
```

期望：S-expression 格式，根节点是 `kicad_sch`，有 `version` 字段

- [ ] **Step 5: 用 kicad-cli 独立验证（不依赖 MCP）**

```bash
cd ~/kicad-projects/blinky
kicad-cli sch export netlist blinky.kicad_sch -o /tmp/blinky-empty.net 2>&1
echo "退出码: $?"
ls -la /tmp/blinky-empty.net
```

期望：退出码 0，生成空 netlist。**这证明文件格式合法**——即使 MCP 坏了，我们也能用命令行验证。

- [ ] **Step 6: 让 AI 读取并描述原理图**

在会话中：

```
用 kicad MCP 读取 blinky 工程，告诉我当前有哪些元件和网络
```

期望：AI 调用 MCP 工具返回结构化信息（此时应该为空）

**这一步验证了「AI 读取原理图」的通路**。

---

## Task 6: AI 绘制原理图（LED 闪烁电路）

**Files:**
- Modify: `~/kicad-projects/blinky/blinky.kicad_sch`

**Interfaces:**
- Consumes: Task 5 的空工程
- Produces: 含元件和连线的原理图（Task 7-9 的输入）

**电路规格**：
- `VCC`：3.3V 电源符号
- `R1`：1kΩ，0805 封装
- `D1`：LED，0805 封装
- `GND`：地
- 连接：VCC → R1 → D1 → GND

- [ ] **Step 1: AI 放置元件**

在会话中：

```
用 kicad MCP 在 blinky 原理图中放置：
- 电源符号 VCC (3.3V)
- 电阻 R1，值 1k，封装 0805
- LED D1，封装 0805
- 接地符号 GND
```

期望：MCP 返回成功

- [ ] **Step 2: 验证元件写入**

```bash
cd ~/kicad-projects/blinky
grep -oE '\(property "Reference" "[^"]*"' blinky.kicad_sch | sort -u
```

期望：看到 `R1`、`D1`、`VCC`、`GND`

- [ ] **Step 3: AI 连线**

在会话中：

```
用 MCP 把元件按 VCC → R1 → D1 → GND 连接起来
```

期望：MCP 返回成功

- [ ] **Step 4: 验证连线**

```bash
grep -c "(wire" ~/kicad-projects/blinky/blinky.kicad_sch
```

期望：计数 > 0

- [ ] **Step 5: AI 运行 ERC**

在会话中：

```
用 MCP 的 run_erc 检查 blinky 原理图
```

或命令行：

```bash
cd ~/kicad-projects/blinky
kicad-cli sch erc blinky.kicad_sch -o /tmp/blinky-erc.rpt 2>&1
cat /tmp/blinky-erc.rpt | head -25
```

期望：生成 ERC 报告。测试电路中出现「电源引脚未驱动」类 warning 是正常的（没有实际电源芯片）。

- [ ] **Step 6: 导出 netlist 验证电路完整性（关键）**

```bash
cd ~/kicad-projects/blinky
kicad-cli sch export netlist blinky.kicad_sch -o ~/kicad-projects/blinky/blinky.net
cat ~/kicad-projects/blinky/blinky.net | grep -A 20 "(nets"
```

期望：netlist 里有 `VCC`、`GND`、以及 R1/D1 之间的连接网络

**这一步是核心验证**——netlist 正确说明原理图在电气上通了，且这是 Task 9 生成代码的输入。

---

## Task 7: AI 生成 PCB + 自动布线

**Files:**
- Create/Modify: `~/kicad-projects/blinky/blinky.kicad_pcb`
- Create: `~/MCP/freerouting-2.0.1-executable.jar`

**Interfaces:**
- Consumes: Task 6 的原理图
- Produces: 完成布线的 PCB（Task 8 的输入）

- [ ] **Step 1: 下载 Freerouting**

```bash
mkdir -p ~/MCP && cd ~/MCP
curl -L -o freerouting-2.0.1-executable.jar \
  https://github.com/freerouting/freerouting/releases/download/v2.0.1/freerouting-2.0.1-executable.jar
ls -lh ~/MCP/freerouting-2.0.1-executable.jar
```

期望：文件约 20-40MB

- [ ] **Step 2: 验证 Freerouting 能运行**

```bash
java -jar ~/MCP/freerouting-2.0.1-executable.jar --help 2>&1 | head -15
echo "退出码: $?"
```

期望：显示帮助信息。Java 25 已装，满足 21+ 要求。

- [ ] **Step 3: AI 创建 PCB**

在会话中：

```
用 MCP 从 blinky 原理图创建 PCB，板子尺寸 20mm x 20mm
```

期望：`.kicad_pcb` 更新

- [ ] **Step 4: 验证 PCB 文件**

```bash
ls -la ~/kicad-projects/blinky/*.kicad_pcb
head -8 ~/kicad-projects/blinky/blinky.kicad_pcb
```

期望：`kicad_pcb` 根节点

- [ ] **Step 5: AI 放置封装并布局**

在会话中：

```
用 MCP 放置所有元件的封装，并自动布局
```

期望：MCP 返回成功

- [ ] **Step 6: 验证封装已放置**

```bash
grep -c "footprint" ~/kicad-projects/blinky/blinky.kicad_pcb
```

期望：计数 ≥ 2（R1 和 D1 各一个）

- [ ] **Step 7: AI 自动布线**

在会话中：

```
用 MCP 的 autoroute_pcb 工具对 blinky 自动布线
```

期望：MCP 调用 Freerouting 完成布线

如果报错说找不到 Freerouting，配置路径（环境变量或 MCP 配置）：

```bash
# 确认 MCP 配置里 Freerouting 的路径设置方式
grep -r "freerouting\|FREEROUTING" ~/MCP/KiCAD-MCP-Server/docs/FREEROUTING_GUIDE.md | head -10
```

- [ ] **Step 8: 验证布线结果**

```bash
grep -c "(segment" ~/kicad-projects/blinky/blinky.kicad_pcb
```

期望：计数 > 0（有走线）

- [ ] **Step 9: 运行 DRC**

```bash
cd ~/kicad-projects/blinky
kicad-cli pcb drc blinky.kicad_pcb -o /tmp/blinky-drc.rpt 2>&1
cat /tmp/blinky-drc.rpt | head -30
```

期望：DRC 报告生成。分析每条 violation——2 层板布 3 个元件通常能 0 violation。

---

## Task 8: 生成 BOM

**Files:**
- Create: `~/kicad-projects/blinky/bom.csv`

**Interfaces:**
- Consumes: Task 6 的原理图
- Produces: BOM 文件（可送厂）

- [ ] **Step 1: 用 kicad-cli 导出 BOM**

```bash
cd ~/kicad-projects/blinky
kicad-cli sch export bom blinky.kicad_sch -o bom.csv 2>&1
cat bom.csv
```

期望：CSV 含元件清单

- [ ] **Step 2: 验证 BOM 内容**

```bash
python3 -c "
import csv
rows = list(csv.DictReader(open('/home/zizimiku/kicad-projects/blinky/bom.csv')))
print(f'元件数: {len(rows)}')
for r in rows:
    print(' ', {k: v for k, v in list(r.items())[:5]})
"
```

期望：看到 R1、D1，字段含 Reference/Value/Footprint/Quantity

- [ ] **Step 3: AI 用 kicad-happy 增强 BOM（在会话中）**

在会话中：

```
用 kicad-happy 的 bom skill 分析 ~/kicad-projects/blinky 的 BOM，
补全缺失的 MPN（厂商料号），并告诉我能否在 LCSC 找到
```

期望：AI 调用 skill 的脚本，输出增强后的 BOM

**这一步验证 skills 包真的可用**——不只是文件躺在目录里。

- [ ] **Step 4: 验证增强结果**

```bash
ls -la ~/kicad-projects/blinky/ | grep -iE "bom|datasheet"
```

期望：看到 BOM 相关产物

- [ ] **Step 5: AI 用 datasheets skill 下载芯片手册**

在会话中：

```
用 kicad-happy 的 datasheets skill，按 BOM 里的元件型号下载数据手册
```

期望：AI 尝试下载或说明需要 API key（DrKiKey/Mouser 等需要密钥，缺失时会退回网页搜索）

---

## Task 9: 从原理图生成 MCU 代码 ⭐

**Files:**
- Create: `~/kicad-projects/blinky/gen_code.py`
- Create: `~/kicad-projects/blinky/main.c`

**Interfaces:**
- Consumes: Task 6 的 netlist（`blinky.net`）、Task 4 的 embedded-systems skill、Task 8 的 datasheet
- Produces: `main.c`（可编译的 MCU 代码）

**核心思路**：netlist 是结构化数据（含元件型号、阻值、连接关系），AI 结合 datasheet 和嵌入式的领域知识，生成初始化代码。

**关键限制**：netlist 有**连接关系**但没有**电气语义**（如"LED 低电平点亮"）。所以 AI 生成的是**引脚定义 + 初始化框架**，业务逻辑需人工确认。

- [ ] **Step 1: 查看 netlist 结构**

```bash
head -60 ~/kicad-projects/blinky/blinky.net
```

期望：能看到 `(components ...)` 和 `(nets ...)` 两节

**理解这个格式是后续所有工作的基础。**

- [ ] **Step 2: 写 netlist 解析脚本**

```bash
cat > ~/kicad-projects/blinky/gen_code.py <<'PYEOF'
#!/usr/bin/env python3
"""从 KiCad netlist 提取结构化数据，供 AI 生成 MCU 代码。

用法: python3 gen_code.py blinky.net
输出: JSON（元件清单 + 网络连接）
"""
import json
import re
import sys
from collections import defaultdict


def parse_netlist(path):
    text = open(path, encoding='utf-8').read()

    # 提取元件
    components = []
    comp_block = re.search(r'\(components\s*(.*?)\n\s*\)\s*\n', text, re.DOTALL)
    if comp_block:
        for m in re.finditer(
            r'\(comp\s+\(ref\s+"([^"]+)"\)\s*\(value\s+"([^"]*)"\)'
            r'(?:\s*\(footprint\s+"([^"]*)"\))?',
            comp_block.group(1)
        ):
            components.append({
                'ref': m.group(1),
                'value': m.group(2),
                'footprint': m.group(3) or '',
            })

    # 提取网络
    nets = defaultdict(list)
    for m in re.finditer(
        r'\(net\s+\(code\s+"[^"]*"\)\s*\(name\s+"([^"]+)"\)(.*?)(?=\(net\s+\(code|\Z)',
        text, re.DOTALL
    ):
        name = m.group(1)
        for n in re.finditer(
            r'\(node\s+\(ref\s+"([^"]+)"\)\s*\(pin\s+"([^"]+)"\)',
            m.group(2)
        ):
            nets[name].append({'ref': n.group(1), 'pin': n.group(2)})

    return {
        'components': components,
        'nets': {k: v for k, v in nets.items()},
    }


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(f'用法: {sys.argv[0]} <netlist>', file=sys.stderr)
        sys.exit(1)

    data = parse_netlist(sys.argv[1])
    print(json.dumps(data, indent=2, ensure_ascii=False))
PYEOF

chmod +x ~/kicad-projects/blinky/gen_code.py
echo "✅ 脚本已创建"
```

- [ ] **Step 3: 运行解析，验证输出**

```bash
cd ~/kicad-projects/blinky
python3 gen_code.py blinky.net | head -40
echo "退出码: $?"
```

期望：输出 JSON，含 `components` 数组（R1/D1 等）和 `nets` 对象

- [ ] **Step 4: AI 根据结构化数据生成代码（在会话中）**

在会话中：

```
读取 ~/kicad-projects/blinky/gen_code.py 的输出（netlist 结构化数据），
用 embedded-systems skill 的指导，为 STM32F103C8T6 生成 main.c：

要求：
1. 根据 netlist 的元件型号和连接关系，判断每个 GPIO 的用途
2. 用 SPL 库风格（stm32f10x_gpio.h）
3. 生成完整的 GPIO 初始化函数
4. 生成 main 函数框架
5. 每个引脚定义处加注释，说明它来自 netlist 的哪条连接

注意：netlist 只提供连接关系，电气语义（如 LED 高低电平点亮）需要你根据电路常识判断，
并在注释里标明这是推断而非原理图明确给出的信息。
```

期望：AI 生成 `main.c`，其中引脚定义确实来自 netlist 数据

- [ ] **Step 5: 验证生成的代码**

```bash
cat ~/kicad-projects/blinky/main.c
```

检查要点：
- [ ] 引脚定义能在 netlist 里找到对应连接
- [ ] 注释标明了信息来源
- [ ] 没有编造的引脚

- [ ] **Step 6: 验证代码能通过语法检查**

```bash
cd ~/kicad-projects/blinky
arm-none-eabi-gcc -mcpu=cortex-m3 -mthumb -fsyntax-only \
  -I/home/zizimiku/Downloads/STM32_test/Start \
  -I/home/zizimiku/Downloads/STM32_test/Library \
  -DSTM32F10X_MD -DUSE_STDPERIPH_DRIVER \
  main.c 2>&1 | head -15
echo "退出码: $?"
```

期望：退出码 0

**这一步证明生成的是可编译的 C 代码，不是看起来像代码的文本。**

如果找不到头文件路径，确认 STM32 工程位置：

```bash
ls -d ~/Downloads/STM32_test/Start ~/Downloads/STM32_test/Library
```

- [ ] **Step 7: 记录方法论**

```bash
cat >> ~/kicad-projects/README.md <<'MDEOF'

## 原理图 → 代码 的方法论

**数据流**：
```
KiCad 原理图
    ↓ kicad-cli sch export netlist
netlist (S-expression，含元件型号 + 引脚连接)
    ↓ gen_code.py
JSON 结构化数据
    ↓ AI + embedded-systems skill + datasheet
main.c (GPIO 初始化 + 框架)
```

**AI 能做**：
- 从 netlist 提取引脚连接
- 结合元件型号推断电路意图（LED/按键/晶振/UART）
- 查 datasheet 确认引脚复用和寄存器配置
- 生成符合芯片库风格的初始化代码

**必须人工确认**：
- 电气语义（LED 高电平还是低电平点亮）
- 时序参数（消抖时间、波特率）
- 业务逻辑
- 所有 AI 的推断都可能错，必须对照原理图复核

**为什么没有现成的 skill**：这个环节高度依赖具体芯片和代码风格，且需要 AI 的推理能力。
现成工具只提供数据（MCP 读 netlist）和知识（embedded-systems skill），中间的推理由 AI 完成。
MDEOF
echo "✅ README 已补充"
```

---

## Task 10: 端到端验证与文档

**Files:**
- Create: `~/kicad-projects/README.md`（完整使用说明）
- Create: `~/kicad-projects/STATUS.md`（环境状态）

**Interfaces:**
- Consumes: Task 1-9 的全部产物
- Produces: 可复现的文档

- [ ] **Step 1: 编写完整使用说明**

```bash
cat > ~/kicad-projects/README.md <<'MDEOF'
# AI 驱动的 PCB 设计工具链

## 环境组成

| 组件 | 版本 | 来源 |
|---|---|---|
| KiCad | 10.0.6 | dnf |
| KiCAD-MCP-Server | 2.7.0 | mixelpixx/KiCAD-MCP-Server (2350⭐) |
| Freerouting | 2.0.1 | freerouting/freerouting (2002⭐) |
| kicad-happy | — | aklofas/kicad-happy (1257⭐, 11 skills) |
| kistack | — | american-embedded/kistack (386⭐, 10 skills) |
| diodeinc/pcb | — | diodeinc/pcb (450⭐, 5 skills) |
| embedded-systems | — | jeffallan/claude-skills (11537⭐) |

## 完整工作流

### 1. 创建工程
```
用 kicad MCP 创建工程
```

### 2. 绘制原理图
```
用 kicad MCP 放置元件并连线
用 kicad MCP 的 run_erc 检查
```

### 3. 生成 PCB 并布线
```
用 kicad MCP 从原理图创建 PCB
用 kicad MCP 放置封装、自动布局
用 kicad MCP 的 autoroute_pcb 自动布线
用 kicad-cli pcb drc 检查
```

### 4. 生成 BOM
```
用 kicad-happy 的 bom skill 分析和增强 BOM
```

### 5. 生成代码
```
用 gen_code.py 解析 netlist
用 embedded-systems skill 指导 AI 生成 MCU 代码
```

## 命令行验证（不依赖 AI）

```bash
cd ~/kicad-projects/blinky

# 原理图检查
kicad-cli sch erc blinky.kicad_sch -o /tmp/erc.rpt

# 导出网表
kicad-cli sch export netlist blinky.kicad_sch -o blinky.net

# PCB 检查
kicad-cli pcb drc blinky.kicad_pcb -o /tmp/drc.rpt

# 导出 Gerber
kicad-cli pcb export gerbers blinky.kicad_pcb -o gerbers/

# 导出 BOM
kicad-cli sch export bom blinky.kicad_sch -o bom.csv

# 导出 PDF（人工复核用）
kicad-cli sch export pdf blinky.kicad_sch -o blinky.pdf
```

## ⚠️ 打样前检查清单

**AI 生成的电路板必须人工复核。**

- [ ] 原理图 PDF 通读一遍，确认拓扑正确
- [ ] 每个元件的封装与实际库存核对
- [ ] 关键元件查 datasheet 确认引脚定义
- [ ] Gerber 用在线查看器预览（如 JLCPCB Gerber viewer）
- [ ] DRC 报告每条 violation 都确认
- [ ] 电源部分重点检查（电压、电流余量、去耦）
- [ ] 机械尺寸和安装孔位

**ERC/DRC 通过 ≠ 设计正确。** 元件选型、去耦布局、EMI、散热这些问题 AI 无法可靠判断。
MDEOF

wc -l ~/kicad-projects/README.md
```

- [ ] **Step 2: 生成状态文件**

```bash
{
  echo "# 环境状态"
  echo ""
  echo "生成时间: $(date '+%Y-%m-%d %H:%M')"
  echo ""
  echo "## 版本"
  echo "- KiCad: $(kicad-cli version 2>/dev/null || echo '未安装')"
  echo "- Node: $(node --version)"
  echo "- Python: $(python3 --version)"
  echo "- Java: $(java --version 2>&1 | head -1)"
  echo "- uvx: $(uvx --version)"
  echo ""
  echo "## MCP 配置"
  python3 -c "
import json, os
d = json.load(open(os.path.expanduser('~/.claude.json')))
print(json.dumps(d.get('mcpServers', {}), indent=2))
"
  echo ""
  echo "## EDA skills"
  ls ~/.claude/skills/ | grep -iE "kicad|pcb|bom|spice|emc|datasheet|schematic|layout|gerber|zener"
} > ~/kicad-projects/STATUS.md

cat ~/kicad-projects/STATUS.md
```

- [ ] **Step 3: 端到端复现测试**

清空重来一次，验证可复现：

```bash
rm -rf ~/kicad-projects/blinky-e2e
mkdir -p ~/kicad-projects/blinky-e2e
echo "✅ 已清空，在 Claude Code 会话中重跑 Task 5-9 的 MCP 调用"
```

期望：能得到相同结果

- [ ] **Step 4: 最终验证脚本**

```bash
cat > ~/kicad-projects/verify.sh <<'SHEOF'
#!/usr/bin/env bash
# 快速验证工具链是否可用
set -e

echo "═══ 工具链健康检查 ═══"
echo ""

check() {
    if command -v "$1" >/dev/null 2>&1; then
        echo "✅ $1"
    else
        echo "❌ $1 未安装"
    fi
}

echo "【核心工具】"
check kicad-cli
check node
check python3
check java
check uvx

echo ""
echo "【MCP 服务器】"
if [ -f "$HOME/MCP/KiCAD-MCP-Server/dist/index.js" ]; then
    echo "✅ KiCAD-MCP-Server 已构建"
else
    echo "❌ KiCAD-MCP-Server 未构建"
fi

echo ""
echo "【Freerouting】"
if [ -f "$HOME/MCP/freerouting-2.0.1-executable.jar" ]; then
    echo "✅ Freerouting JAR 存在"
else
    echo "❌ Freerouting 未下载"
fi

echo ""
echo "【Skills】"
count=$(ls ~/.claude/skills/ 2>/dev/null | grep -icE "kicad|pcb|bom|spice|emc|datasheet|schematic|layout|gerber|zener" || echo 0)
echo "EDA 相关 skills: $count 个"

echo ""
echo "【Python 绑定】"
python3 -c "import pcbnew; print('✅ pcbnew', pcbnew.GetBuildVersion())" 2>/dev/null || echo "❌ pcbnew 导入失败"

echo ""
echo "【测试工程】"
if [ -f ~/kicad-projects/blinky/blinky.kicad_sch ]; then
    echo "✅ blinky 工程存在"
    ls ~/kicad-projects/blinky/*.kicad_sch ~/kicad-projects/blinky/*.kicad_pcb 2>/dev/null
else
    echo "⚠️ blinky 工程不存在（尚未创建）"
fi
SHEOF

chmod +x ~/kicad-projects/verify.sh
~/kicad-projects/verify.sh
```

期望：所有项显示 ✅

- [ ] **Step 5: 提交文档到博客仓库**

```bash
cd ~/Documents/Blog/userzbb.github.io
cp -r ~/kicad-projects/README.md docs/kicad-workflow.md 2>/dev/null || true
git add -A
git commit -m "docs: 添加 AI 驱动的 PCB 设计工具链实施计划与使用说明"
GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=no -o BatchMode=yes" git push
```

期望：推送成功

---

## 风险与限制

| 风险 | 影响 | 缓解 |
|---|---|---|
| **MCP Linux 支持是"部分兼容"** | 配置可能需要手工调整 | 用官方 `linux-config.example.json`；Task 3 Step 6 有独立握手测试 |
| **MCP 项目 Windows 优先** | 某些工具在 Linux 可能失败 | 每步都用 `kicad-cli` 独立验证，不完全依赖 MCP |
| **AI 生成电路不可靠** | 打样后才发现问题 | Task 10 的人工复核清单 |
| **skills 星数差异大** | 低星 skill 可能有 bug | 只选了 ≥386⭐ 的；低星的（l3wi 等）作为可选 |
| **`autoroute_pcb` 需要 Freerouting** | 未配置会失败 | Task 7 Step 1-2 预先装好并验证 |
| **KiCad 下载量大** | 首次安装慢 | 2-4GB，5-15 分钟 |
| **netlist→代码无现成方案** | 需自己写胶水 | Task 9 的 `gen_code.py` 只有约 60 行，逻辑简单 |

## 范围外（本计划不做）

- 多层板（4 层以上）高速信号完整性
- SPICE 仿真的深入使用（`kicad-happy@spice` 可用，但需单独装 ngspice）
- EMC 预合规的完整流程（`kicad-happy@emc` 可用）
- 打样下单自动化（JLCPCB/PCBWay API 集成）
- 量产测试夹具设计

## 后续扩展方向

1. **增强 netlist 解析**：识别常见电路模式（LED/按键/UART/I2C/SPI），自动映射到外设初始化
2. **引脚映射表**：Task 9 的局限是 netlist 只有元件引脚号，需维护"元件引脚 → MCU 引脚"映射才能全自动
3. **集成 kicad-happy 全部 11 个 skills**：EMC 预合规、SPICE 仿真验证
4. **Zener 代码化设计**：用 `diodeinc/pcb` 的 Starlark 语言描述电路，让 AI 直接生成
