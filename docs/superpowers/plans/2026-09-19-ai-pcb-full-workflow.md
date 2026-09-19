# AI 驱动的 STM32 PCB 全链路 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 AI 通过 MCP 工具链完整设计一块 STM32F103C8T6 最小系统板——从原理图、PCB、自动布线、BOM 到生成 MCU 代码，最后写成博客。

**Architecture:** AI 调用 `mixelpixx/KiCAD-MCP-Server`（233 个工具）操作 KiCad 10.0.6 完成设计；`kicad-cli` 独立复核每一步；`kicad-happy` / `kistack` / `diodeinc-pcb` / `embedded-systems` 四套 skills 提供领域知识；最后从 netlist 提取数据生成 SPL 风格代码。

**Tech Stack:**
- KiCad 10.0.6（已装）
- mixelpixx/KiCAD-MCP-Server 2.7.0（2350⭐，233 工具，已注册）
- Freerouting 2.4.1（2002⭐，已就位）
- 27 个 EDA skills（已装）
- Claude Code

**Spec:** 无独立 spec。需求来自用户描述：「AI 调用工具读取原理图 / 根据需求绘制原理图 PCB / 生成 BOM 表 / 根据原理图编写代码」，以及「像之前那样写一篇工具配置验证的博客」

## Global Constraints

- 平台 Fedora 44，KiCad 10.0.6，Node v24.14.0，Python 3.14.7，Java 25.0.2
- **电路必须含 MCU**：目标芯片 STM32F103C8T6（KiCad 符号 `MCU_ST_STM32F1:STM32F103C8Tx`，LQFP-48）
- **每步都要 `kicad-cli` 独立复核**，不能只信 MCP 的 success 返回
- **AI 生成的板子必须人工复核才能打样**——ERC/DRC 通过 ≠ 设计正确
- 博客用 Momo 主题格式：`~/Documents/Blog/userzbb.github.io/src/content/blog/<slug>/zh-cn.md`，frontmatter 含 `title`/`pubDate`/`description`/`image`/`draft`/`slugId`/`category`

---

## 已完成的前置工作（Task 1-4）

**这 4 个 Task 已在 2026-09-19 执行完毕，此处记录结果与已踩的坑，供后续 Task 引用。**

### Task 1: 安装 KiCad 10.x ✅

```bash
sudo dnf install -y kicad kicad-packages3d
```

**结果**：`kicad-cli 10.0.6`
- `/usr/share/kicad/symbols/` — 224 库 / 221M
- `/usr/share/kicad/footprints/` — 155 库 / 179M
- `/usr/share/kicad/3dmodels/` — 3.2G

**验证过的子命令**：
- `kicad-cli sch export` → `bom` `netlist` `pdf` 等
- `kicad-cli pcb export` → `gerbers` `drill` `step` 等

**坑 1 — Fedora 无 `kicad-libraries` 包**（那是 Debian 包名）。Fedora 只有 `kicad`/`kicad-doc`/`kicad-packages3d`，库随主包。补救：`sudo dnf reinstall kicad`。

**坑 2 — pcbnew 路径与 Debian 不同**：
- 计划原假设 `/usr/lib/kicad/lib/python3/dist-packages` ❌ 不存在
- **实际**：`/usr/lib64/python3.14/site-packages/pcbnew.py` ✅
- 裸 `python3` 无需 PYTHONPATH 即可 import（该路径本就在 `sys.path`）

**坑 3 — 断言噪音**：`import pcbnew` 会向 stderr 刷 `assert "m_choices.GetCount() > 0" failed`。KiCad 10.0.6 在 Fedora 构建下的已知问题，**不影响功能**。

### Task 2: 安装 KiCAD-MCP-Server ✅

```bash
mkdir -p ~/MCP && cd ~/MCP
git clone --depth 1 https://github.com/mixelpixx/KiCAD-MCP-Server.git
cd KiCAD-MCP-Server
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
npm install && npm run build
```

**结果**：`dist/index.js` 构建成功，MCP 握手返回 `kicad-mcp-server 2.7.0`，**233 个工具**。

工具分布（实测）：
| 类别 | 数量 |
|---|---|
| schematic | 37 |
| export | 31 |
| symbol_library | 21 |
| board | 15 |
| component | 15 |
| footprint | 11 |
| pcb | 9 |
| drc | 7 |
| library | 7 |
| autoroute | 4 |
| bom | 3 |
| datasheet | 2 |
| netlist | 2 |
| erc | 1 |

**坑 4（关键）— venv 隔离导致 pcbnew 不可见**

MCP 启动时自动发现 `.venv` 并优先使用，但 venv 默认隔离系统 site-packages，导致 `import pcbnew` 失败：

```
[ERROR] pcbnew validation failed: Command failed:
  ".../.venv/bin/python" -c "import pcbnew; print('OK')"
```

**修复**：

```bash
sed -i 's/include-system-site-packages = false/include-system-site-packages = true/' \
  ~/MCP/KiCAD-MCP-Server/.venv/pyvenv.cfg
```

**坑 5 — 官方 `scripts/install-linux.sh` 是 Ubuntu 专用**（用 `apt-get` + `add-apt-repository ppa:`），Fedora 上跑不了。手工执行其核心步骤即可。

### Task 3: 注册 MCP ✅

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
        "PYTHONPATH": "/usr/share/kicad/scripting/plugins",
        "LOG_LEVEL": "info",
        "KICAD_AUTO_LAUNCH": "false"
    }
}
json.dump(d, open(conf_path, 'w'), indent=2, ensure_ascii=False)
print("✅ 已写入")
PYEOF
```

**验证**：`claude mcp list` → `kicad: ... ✔ Connected`
**注意**：注册后需**重启 Claude Code** 才能调用工具。

**坑 6 — 符号库表首次使用前不存在**

新用户的 `~/.config/kicad/10.0/` 里没有 `sym-lib-table`（KiCad GUI 首启才生成）。MCP 因此报 `Library 'Device' not found in sym-lib-table`。

**修复**：

```bash
cp /usr/share/kicad/template/sym-lib-table ~/.config/kicad/10.0/sym-lib-table
cp /usr/share/kicad/template/fp-lib-table  ~/.config/kicad/10.0/fp-lib-table
```

### Task 4: 安装高星 Skills ✅

```bash
npx -y skills add aklofas/kicad-happy -g -y          # 1257⭐, 11 skills
npx -y skills add american-embedded/kistack -g -y    # 386⭐, 10 skills
npx -y skills add diodeinc/pcb -g -y                 # 450⭐, 5 skills
npx -y skills add jeffallan/claude-skills@embedded-systems -g -y  # 11537⭐, 1 skill
```

**结果**：全局 skills 45 → 72 个。

**坑 7 — `✗ PromptScript does not support global skill installation`**

`npx skills` 会同时尝试两种目标格式：`.agents/skills/`（PromptScript，供 Copilot/OpenCode 用）和 Claude Code 格式。前者不支持全局安装，所以报 ✗，但**后者成功了**。判断方法：看 `~/.claude/skills/` 里有没有对应目录。

### Freerouting 预备（Task 7 需要）✅

```bash
mkdir -p ~/.kicad-mcp
curl -L -o ~/.kicad-mcp/freerouting.jar \
  https://github.com/freerouting/freerouting/releases/download/v2.4.1/freerouting-2.4.1.jar
```

**注意**：MCP 期望的路径是 **`~/.kicad-mcp/freerouting.jar`**（不是 `~/MCP/`）。
**版本**：实际最新是 **v2.4.1**（早期计划写的 v2.0.1 已过时，那个 URL 返回 9 字节的 404 页面）。

验证：

```
mcp__kicad__check_freerouting
→ {"java":{"java_21_ok":true}, "freerouting":{"jar_found":true}, "ready":true}
```

---

## 文件结构

| 路径 | 职责 |
|---|---|
| `~/kicad-projects/stm32-min/` | 本次的 STM32 最小系统工程 |
| `~/kicad-projects/stm32-min/stm32-min.kicad_sch` | 原理图 |
| `~/kicad-projects/stm32-min/stm32-min.kicad_pcb` | PCB |
| `~/kicad-projects/stm32-min/stm32-min.net` | 导出的网表 |
| `~/kicad-projects/stm32-min/gen_code.py` | netlist → 代码生成脚本 |
| `~/kicad-projects/stm32-min/main.c` | AI 生成的 MCU 代码 |
| `~/kicad-projects/stm32-min/bom/` | BOM 与订单文件 |
| `~/kicad-projects/stm32-min/gerbers/` | Gerber 输出 |
| `~/Documents/Blog/userzbb.github.io/src/content/blog/ai-pcb-workflow/zh-cn.md` | 博客文章 |

---

## Task 5: 创建 STM32 最小系统原理图

**Files:**
- Create: `~/kicad-projects/stm32-min/stm32-min.kicad_sch`

**Interfaces:**
- Consumes: Task 1-4 的环境
- Produces: 含 MCU + 外设的原理图（Task 6-9 的输入）

**电路规格**（基于用户原有的 STM32_test 工程）：

| 元件 | 型号/值 | 连接 |
|---|---|---|
| U1 | STM32F103C8Tx (LQFP-48) | MCU |
| Y1 | 8MHz 晶振 | PD0/PD1（OSC_IN/OSC_OUT） |
| C1, C2 | 22pF | 晶振负载电容 |
| C3 | 100nF | 复位电容 |
| R1 | 10k | 复位上拉 |
| R2, R3, R4 | 1k | LED 限流 |
| D1, D2, D3 | LED | PB14 / PB15 / PC13 |
| SW1, SW2 | SW_Push | PB12 / PB13 |
| C4-C6 | 100nF | 电源去耦 |

- [ ] **Step 1: 创建工程**

```bash
mkdir -p ~/kicad-projects/stm32-min && cd ~/kicad-projects/stm32-min && pwd
```

- [ ] **Step 2: 用 MCP 创建 KiCad 工程**

```
mcp__kicad__create_project(
  name="stm32-min",
  path="/home/zizimiku/kicad-projects/stm32-min"
)
```

期望：返回 `success: true`，生成 `.kicad_pro` / `.kicad_sch` / `.kicad_pcb`

- [ ] **Step 3: 验证工程文件**

```bash
ls -la ~/kicad-projects/stm32-min/
head -8 ~/kicad-projects/stm32-min/stm32-min.kicad_sch
```

期望：三个文件存在，原理图是合法的 S-expression

- [ ] **Step 4: 确认 STM32 符号可用**

```
mcp__kicad__batch_list_symbol_pins(
  symbols=["MCU_ST_STM32F1:STM32F103C8Tx", "Device:Crystal", "Switch:SW_Push"],
  compact=true
)
```

期望：STM32F103C8Tx 有 48 个引脚（或符号定义中的引脚数）

如果报 `Library not found`，执行 Task 3 的坑 6 修复（复制 sym-lib-table）。

- [ ] **Step 5: 放置 MCU 和晶振电路**

```
mcp__kicad__batch_add_and_connect(
  schematicPath="/home/zizimiku/kicad-projects/stm32-min/stm32-min.kicad_sch",
  components=[
    {"symbol":"MCU_ST_STM32F1:STM32F103C8Tx","reference":"U1",
     "value":"STM32F103C8Tx","footprint":"Package_QFP:LQFP-48_7x7mm_P0.5mm",
     "position":{"x":120,"y":100}},
    {"symbol":"Device:Crystal","reference":"Y1","value":"8MHz",
     "footprint":"Crystal:Crystal_HC49-4H_Vertical",
     "position":{"x":80,"y":80}},
    {"symbol":"Device:C","reference":"C1","value":"22pF",
     "footprint":"Capacitor_SMD:C_0805_2012Metric",
     "position":{"x":75,"y":90}},
    {"symbol":"Device:C","reference":"C2","value":"22pF",
     "footprint":"Capacitor_SMD:C_0805_2012Metric",
     "position":{"x":85,"y":90}}
  ],
  labelType="label"
)
```

期望：5 个元件放置成功

- [ ] **Step 6: 验证元件已放置**

```bash
grep -oE '\(property "Reference" "[^"]+"' ~/kicad-projects/stm32-min/stm32-min.kicad_sch | sort -u
```

期望：看到 U1、Y1、C1、C2

- [ ] **Step 7: 放置 LED、按键、复位、去耦**

```
mcp__kicad__batch_add_and_connect(
  schematicPath="/home/zizimiku/kicad-projects/stm32-min/stm32-min.kicad_sch",
  components=[
    {"symbol":"Device:R","reference":"R2","value":"1k",
     "footprint":"Resistor_SMD:R_0805_2012Metric","position":{"x":170,"y":80},
     "nets":{"1":"LED1_A","2":"PB14"}},
    {"symbol":"Device:LED","reference":"D1","value":"LED",
     "footprint":"LED_SMD:LED_0805_2012Metric","position":{"x":180,"y":80},
     "nets":{"1":"LED1_A","2":"GND"}},
    {"symbol":"Device:R","reference":"R3","value":"1k",
     "footprint":"Resistor_SMD:R_0805_2012Metric","position":{"x":170,"y":90},
     "nets":{"1":"LED2_A","2":"PB15"}},
    {"symbol":"Device:LED","reference":"D2","value":"LED",
     "footprint":"LED_SMD:LED_0805_2012Metric","position":{"x":180,"y":90},
     "nets":{"1":"LED2_A","2":"GND"}},
    {"symbol":"Device:R","reference":"R4","value":"1k",
     "footprint":"Resistor_SMD:R_0805_2012Metric","position":{"x":170,"y":100},
     "nets":{"1":"LED3_A","2":"PC13"}},
    {"symbol":"Device:LED","reference":"D3","value":"LED",
     "footprint":"LED_SMD:LED_0805_2012Metric","position":{"x":180,"y":100},
     "nets":{"1":"LED3_A","2":"GND"}},
    {"symbol":"Switch:SW_Push","reference":"SW1","value":"KEY1",
     "footprint":"Button_Switch_SMD:SW_SPST_PTS645","position":{"x":60,"y":110},
     "nets":{"1":"PB12","2":"GND"}},
    {"symbol":"Switch:SW_Push","reference":"SW2","value":"KEY2",
     "footprint":"Button_Switch_SMD:SW_SPST_PTS645","position":{"x":60,"y":120},
     "nets":{"1":"PB13","2":"GND"}},
    {"symbol":"Device:R","reference":"R1","value":"10k",
     "footprint":"Resistor_SMD:R_0805_2012Metric","position":{"x":60,"y":70},
     "nets":{"1":"+3V3","2":"NRST"}},
    {"symbol":"Device:C","reference":"C3","value":"100nF",
     "footprint":"Capacitor_SMD:C_0805_2012Metric","position":{"x":70,"y":70},
     "nets":{"1":"NRST","2":"GND"}}
  ],
  labelType="label"
)
```

期望：10 个元件放置成功

- [ ] **Step 8: 放置电源符号和去耦电容**

```
mcp__kicad__batch_add_and_connect(
  schematicPath="/home/zizimiku/kicad-projects/stm32-min/stm32-min.kicad_sch",
  components=[
    {"symbol":"power:+3V3","reference":"#PWR01","value":"+3V3",
     "position":{"x":100,"y":50},"nets":{"1":"+3V3"}},
    {"symbol":"power:GND","reference":"#PWR02","value":"GND",
     "position":{"x":100,"y":150},"nets":{"1":"GND"}},
    {"symbol":"Device:C","reference":"C4","value":"100nF",
     "footprint":"Capacitor_SMD:C_0805_2012Metric","position":{"x":140,"y":120},
     "nets":{"1":"+3V3","2":"GND"}},
    {"symbol":"Device:C","reference":"C5","value":"100nF",
     "footprint":"Capacitor_SMD:C_0805_2012Metric","position":{"x":145,"y":120},
     "nets":{"1":"+3V3","2":"GND"}},
    {"symbol":"Device:C","reference":"C6","value":"100nF",
     "footprint":"Capacitor_SMD:C_0805_2012Metric","position":{"x":150,"y":120},
     "nets":{"1":"+3V3","2":"GND"}},
    {"symbol":"power:PWR_FLAG","reference":"#FLG01","value":"PWR_FLAG",
     "position":{"x":90,"y":50},"nets":{"1":"+3V3"}},
    {"symbol":"power:PWR_FLAG","reference":"#FLG02","value":"PWR_FLAG",
     "position":{"x":90,"y":150},"nets":{"1":"GND"}}
  ],
  labelType="label"
)
```

期望：7 个元件放置成功

- [ ] **Step 9: 验证元件总数**

```bash
cd ~/kicad-projects/stm32-min
echo "=== 元件清单 ==="
grep -oE '\(property "Reference" "[^"#]+"' stm32-min.kicad_sch | sed 's/.*"\(.*\)"/\1/' | sort -u
echo ""
echo "总数: $(grep -oE '\(property "Reference" "[^"#]+"' stm32-min.kicad_sch | sort -u | wc -l)"
```

期望：U1、Y1、R1-R4、C1-C6、D1-D3、SW1、SW2 = 19 个（不含 #PWR/#FLG）

- [ ] **Step 10: 运行 ERC**

```
mcp__kicad__run_erc(schematicPath="/home/zizimiku/kicad-projects/stm32-min/stm32-min.kicad_sch")
```

期望：ERовC 结果。这是复杂电路（19 个元件），**预期会有一些 warning**（如未连接的 MCU 引脚、电源引脚未驱动等）。记录所有 violation，判断哪些是真问题、哪些是这个测试电路可以接受的。

- [ ] **Step 11: 导出 netlist（关键产物）**

```bash
cd ~/kicad-projects/stm32-min
kicad-cli sch export netlist stm32-min.kicad_sch -o stm32-min.net
echo "退出码: $?"
echo ""
echo "=== 网络数 ==="
grep -c "(net " stm32-min.net
echo ""
echo "=== 关键连接（LED/按键/晶振）==="
grep -A 4 'name "PB14"\|name "PC13"\|name "PB12"\|name "OSC' stm32-min.net | head -40
```

期望：netlist 包含 PB14/PB15/PC13/PB12/PB13/OSC_IN/OSC_OUT 等网络

**这是 Task 9 的输入**——netlist 里能看到「PB14 连到 R2 → D1」这样的连接关系。

---

## Task 6: 从原理图生成 PCB + 自动布线

**Files:**
- Modify: `~/kicad-projects/stm32-min/stm32-min.kicad_pcb`

**Interfaces:**
- Consumes: Task 5 的原理图
- Produces: 完成布线的 PCB（Task 7-8 的输入）

- [ ] **Step 1: 同步原理图到 PCB**

```
mcp__kicad__sync_schematic_to_board(
  schematicPath="/home/zizimiku/kicad-projects/stm32-min/stm32-min.kicad_sch",
  boardPath="/home/zizimiku/kicad-projects/stm32-min/stm32-min.kicad_pcb"
)
```

期望：所有封装加入 PCB

**如果出现 `Auto-save refused: ... changed externally`**：说明文件被外部改动过（如 `kicad-cli` 操作）。按提示重新加载再同步：

```
mcp__kicad__open_project(filename="/home/zizimiku/kicad-projects/stm32-min/stm32-min.kicad_pro")
mcp__kicad__sync_schematic_to_board(...)  # 再执行一次
```

- [ ] **Step 2: 验证封装已加入**

```bash
cd ~/kicad-projects/stm32-min
echo "=== 封装数 ==="
grep -c '(footprint "' stm32-min.kicad_pcb
echo ""
echo "=== 网络数 ==="
grep -cE '^\s+\(net "' stm32-min.kicad_pcb
```

期望：封装数 ≈ 15（除去 #PWR/#FLG），网络数 ≈ 20

- [ ] **Step 3: 设置板框**

```
mcp__kicad__set_board_size(width=60, height=50, unit="mm")
```

期望：创建 60×50mm 板框

- [ ] **Step 4: 检查元件位置**

```
mcp__kicad__get_component_list()
```

期望：看到所有元件的位置。**如果都在 (0,0)**（重叠），需要布局。

- [ ] **Step 5: 用建议工具自动布局**

```
mcp__kicad__suggest_placement(refs=["U1","Y1","C1","C2","C3","C4","C5","C6","R1","R2","R3","R4","D1","D2","D3","SW1","SW2"])
```

期望：返回布局建议（dry-run），包含 HPWL 评分和改进建议

如果结果合理（无重叠），应用它：

```
mcp__kicad__suggest_placement(refs=[...], apply=true)
```

**如果自动布局效果不好**，手动放置关键元件（MCU 居中，去耦电容贴近 MCU）：

```
mcp__kicad__batch_move_components(moves={
  "U1": {"position": {"x": 30, "y": 25, "unit": "mm"}},
  "Y1": {"position": {"x": 15, "y": 15, "unit": "mm"}},
  "C1": {"position": {"x": 17, "y": 20, "unit": "mm"}},
  "C2": {"position": {"x": 13, "y": 20, "unit": "mm"}},
  "R1": {"position": {"x": 45, "y": 12, "unit": "mm"}},
  "C3": {"position": {"x": 47, "y": 15, "unit": "mm"}},
  "D1": {"position": {"x": 50, "y": 22, "unit": "mm"}},
  "R2": {"position": {"x": 45, "y": 22, "unit": "mm"}},
  "D2": {"position": {"x": 50, "y": 27, "unit": "mm"}},
  "R3": {"position": {"x": 45, "y": 27, "unit": "mm"}},
  "D3": {"position": {"x": 50, "y": 32, "unit": "mm"}},
  "R4": {"position": {"x": 45, "y": 32, "unit": "mm"}},
  "SW1": {"position": {"x": 15, "y": 38, "unit": "mm"}},
  "SW2": {"position": {"x": 22, "y": 38, "unit": "mm"}},
  "C4": {"position": {"x": 38, "y": 38, "unit": "mm"}},
  "C5": {"position": {"x": 41, "y": 38, "unit": "mm"}},
  "C6": {"position": {"x": 44, "y": 38, "unit": "mm"}}
})
```

- [ ] **Step 6: 检查 courtyard 重叠**

```
mcp__kicad__check_courtyard_overlaps()
```

期望：无重叠，或有少量可接受的警告。**有重叠必须调整位置**，否则 DRC 会报错。

- [ ] **Step 7: 铺铜（可选，推荐）**

```
mcp__kicad__add_copper_pour(layer="B.Cu", net="GND", clearance=0.3)
```

期望：在底层铺 GND 铜

- [ ] **Step 8: 自动布线**

```
mcp__kicad__autoroute(
  boardPath="/home/zizimiku/kicad-projects/stm32-min/stm32-min.kicad_pcb",
  timeout=180
)
```

期望：Freerouting 完成布线。19 个元件的板子可能需要 10-60 秒。

**如果失败**，先确认 Freerouting 就绪：

```
mcp__kicad__check_freerouting()   # 期望 ready: true
```

- [ ] **Step 9: 验证布线结果**

```bash
cd ~/kicad-projects/stm32-min
echo "=== 走线段数 ==="
grep -c "(segment" stm32-min.kicad_pcb
echo "=== 过孔数 ==="
grep -c "(via" stm32-min.kicad_pcb
echo "=== 已有铜箔 ==="
grep -c "(zone" stm32-min.kicad_pcb
```

期望：走线数 > 0（19 个元件应该有 20+ 条走线）

- [ ] **Step 10: 运行 DRC**

```bash
cd ~/kicad-projects/stm32-min
kicad-cli pcb drc stm32-min.kicad_pcb -o /tmp/stm32-drc.rpt
echo "退出码: $?"
head -30 /tmp/stm32-drc.rpt
```

期望：DRC 报告。**有 violation 是正常的**（自动布线在密集板上会有问题），但要记录并分析每一类。

如果 violation 太多，尝试：

```bash
# 重新布线，增加尝试次数
mcp__kicad__autoroute(boardPath="...", attempts=3, targetNets=["+3V3","GND"])
```

- [ ] **Step 11: 记录布线质量**

```bash
{
  echo "=== 布线统计 ==="
  echo "走线段: $(grep -c '(segment' stm32-min.kicad_pcb)"
  echo "过孔: $(grep -c '(via' stm32-min.kicad_pcb)"
  echo ""
  echo "=== DRC 摘要 ==="
  grep -E "Found [0-9]+ (DRC|unconnected)" /tmp/stm32-drc.rpt
} | tee /tmp/routing-stats.txt
```

---

## Task 7: 生成 BOM 并补全器件信息

**Files:**
- Create: `~/kicad-projects/stm32-min/bom/bom.csv`
- Modify: `~/kicad-projects/stm32-min/stm32-min.kicad_sch`（写入 MPN 属性）

**Interfaces:**
- Consumes: Task 5 的原理图
- Produces: 含 MPN 的 BOM（可下单）

- [ ] **Step 1: 用 kicad-cli 导出基础 BOM**

```bash
cd ~/kicad-projects/stm32-min
kicad-cli sch export bom stm32-min.kicad_sch -o bom/bom-basic.csv
cat bom/bom-basic.csv
```

期望：CSV 含所有元件

- [ ] **Step 2: 用 kicad-happy 的 bom skill 分析**

```bash
cd ~/.claude/skills/bom
python3 scripts/bom_manager.py analyze \
  /home/zizimiku/kicad-projects/stm32-min/stm32-min.kicad_sch \
  --json --recursive > /tmp/bom-analysis.json
python3 -c "
import json
d = json.load(open('/tmp/bom-analysis.json'))
print('BOM 行数:', d['stats']['total_bom_lines'])
print('有 MPN:', d['stats']['with_mpn'])
print('缺 MPN:', d['stats']['without_mpn'])
print()
print('需要补全的元件:')
for b in d['bom']:
    if not b['mpn']:
        print(f\"  {b['references']}: {b['value']} [{b['footprint']}]\")
"
```

期望：列出所有缺 MPN 的元件

- [ ] **Step 3: 用 LCSC 搜索关键元件（免 API key）**

```bash
cd ~/.claude/skills/lcsc
ls scripts/
# 用实际脚本名搜索（下面用通用名，执行时替换）
python3 scripts/lcsc_search.py "STM32F103C8T6" 2>&1 | head -20
python3 scripts/lcsc_search.py "8MHz crystal 5032" 2>&1 | head -10
python3 scripts/lcsc_search.py "1k 0805 resistor" 2>&1 | head -10
```

期望：返回候选型号、库存、价格

**如果脚本名不同**，先 `ls scripts/` 看清楚再调用。

- [ ] **Step 4: 写入 MPN 到原理图**

用 `edit_properties.py` 写入（先 dry-run）：

```bash
echo '{
  "U1": {"MPN": "STM32F103C8T6", "Manufacturer": "STMicroelectronics", "LCSC": "C8734"},
  "Y1": {"MPN": "X50328MSB2GI", "Manufacturer": "Yangxing", "LCSC": "C115962"},
  "R1": {"MPN": "0805W8F1002T5E", "Manufacturer": "UNI-ROYAL", "LCSC": "C17408"},
  "R2": {"MPN": "0805W8F1001T5E", "Manufacturer": "UNI-ROYAL", "LCSC": "C17513"},
  "R3": {"MPN": "0805W8F1001T5E", "Manufacturer": "UNI-ROYAL", "LCSC": "C17513"},
  "R4": {"MPN": "0805W8F1001T5E", "Manufacturer": "UNI-ROYAL", "LCSC": "C17513"},
  "C1": {"MPN": "CL21C220JBANNNC", "Manufacturer": "Samsung", "LCSC": "C107108"},
  "C2": {"MPN": "CL21C220JBANNNC", "Manufacturer": "Samsung", "LCSC": "C107108"},
  "C3": {"MPN": "CL21B104KBCNNNC", "Manufacturer": "Samsung", "LCSC": "C13967"},
  "C4": {"MPN": "CL21B104KBCNNNC", "Manufacturer": "Samsung", "LCSC": "C13967"},
  "C5": {"MPN": "CL21B104KBCNNNC", "Manufacturer": "Samsung", "LCSC": "C13967"},
  "C6": {"MPN": "CL21B104KBCNNNC", "Manufacturer": "Samsung", "LCSC": "C13967"}
}' | python3 ~/.claude/skills/bom/scripts/edit_properties.py \
  /home/zizimiku/kicad-projects/stm32-min/stm32-min.kicad_sch --dry-run
```

**先看 dry-run 输出**，确认无误后去掉 `--dry-run` 再执行。

> **注意**：上面的 MPN/LCSC 号是常见型号，但**执行时必须先用 LCSC 脚本验证**（Step 3），确认库存和规格匹配。不要盲目照抄。

- [ ] **Step 5: 验证 MPN 已写入**

```bash
grep -oE '\(property "(MPN|LCSC)" "[^"]+"' ~/kicad-projects/stm32-min/stm32-min.kicad_sch | sort | uniq -c | head -20
```

期望：看到 MPN 和 LCSC 属性

- [ ] **Step 6: 导出完整 BOM**

```bash
cd ~/.claude/skills/bom
python3 scripts/bom_manager.py export \
  /home/zizimiku/kicad-projects/stm32-min/stm32-min.kicad_sch \
  -o /home/zizimiku/kicad-projects/stm32-min/bom/bom.csv --recursive
cat /home/zizimiku/kicad-projects/stm32-min/bom/bom.csv
```

期望：CSV 含 MPN、Manufacturer、LCSC 列

- [ ] **Step 7: 验证 BOM 完整性**

```bash
python3 -c "
import json
d = json.load(open('/tmp/bom-analysis.json'))
" 2>/dev/null
cd ~/.claude/skills/bom
python3 scripts/bom_manager.py analyze \
  /home/zizimiku/kicad-projects/stm32-min/stm32-min.kicad_sch --json --recursive \
  | python3 -c "
import json, sys
d = json.load(sys.stdin)
s = d['stats']
print(f\"总元件: {s['total_components']}\")
print(f\"有 MPN: {s['with_mpn']}\")
print(f\"缺 MPN: {s['without_mpn']}\")
print(f\"有 LCSC: {s['with_lcsc']}\")
"
```

期望：`缺 MPN` 应为 0（或只剩电源符号等非采购件）

---

## Task 8: 导出制造文件

**Files:**
- Create: `~/kicad-projects/stm32-min/gerbers/`

**Interfaces:**
- Consumes: Task 6 的 PCB
- Produces: Gerber + 钻孔文件（可送厂）

- [ ] **Step 1: 导出 Gerber**

```bash
cd ~/kicad-projects/stm32-min
mkdir -p gerbers
kicad-cli pcb export gerbers stm32-min.kicad_pcb -o gerbers/
ls gerbers/*.gbr | wc -l
ls gerbers/ | head -12
```

期望：生成 7-12 个 `.gbr` 文件（顶层铜、底层铜、阻焊、丝印、板框、钻孔图等）

- [ ] **Step 2: 导出钻孔文件**

```bash
cd ~/kicad-projects/stm32-min
kicad-cli pcb export drill stm32-min.kicad_pcb -o gerbers/
ls -la gerbers/*.drl
```

期望：`.drl` 文件存在

- [ ] **Step 3: 导出 PDF 原理图（人工复核用）**

```bash
cd ~/kicad-projects/stm32-min
kicad-cli sch export pdf stm32-min.kicad_sch -o stm32-min-schematic.pdf
ls -lh stm32-min-schematic.pdf
```

- [ ] **Step 4: 导出 3D 模型（可选）**

```bash
cd ~/kicad-projects/stm32-min
timeout 180 kicad-cli pcb export step stm32-min.kicad_pcb -o stm32-min.step 2>&1 | tail -3
ls -lh stm32-min.step 2>/dev/null || echo "（3D 导出失败或超时，不影响主流程）"
```

- [ ] **Step 5: 汇总产物**

```bash
cd ~/kicad-projects/stm32-min
{
  echo "═══ stm32-min 工程产物 ═══"
  echo ""
  echo "【原理图】"; ls -la *.kicad_sch *.pdf 2>/dev/null | awk '{print "  " $9 " (" $5 " bytes)"}'
  echo ""
  echo "【PCB】";    ls -la *.kicad_pcb 2>/dev/null | awk '{print "  " $9 " (" $5 " bytes)"}'
  echo ""
  echo "【Gerber】"; echo "  $(ls gerbers/*.gbr 2>/dev/null | wc -l) 个文件"
  echo "【钻孔】";   echo "  $(ls gerbers/*.drl 2>/dev/null | wc -l) 个文件"
  echo ""
  echo "【BOM】";    ls -la bom/*.csv 2>/dev/null | awk '{print "  " $9}'
  echo ""
  echo "【网表】";   ls -la *.net 2>/dev/null | awk '{print "  " $9}'
} | tee PRODUCTS.txt
```

期望：所有产物齐全

---

## Task 9: 从原理图生成 MCU 代码 ⭐

**Files:**
- Create: `~/kicad-projects/stm32-min/gen_code.py`
- Create: `~/kicad-projects/stm32-min/main.c`

**Interfaces:**
- Consumes: Task 5 的 `stm32-min.net`、`embedded-systems` skill
- Produces: `main.c`（可编译的 SPL 代码）

**核心思路**：netlist 含「元件型号 + 引脚连接」，AI 结合芯片手册和嵌入式知识，推断电路意图并生成代码。

- [ ] **Step 1: 检查 netlist 里的关键信息**

```bash
cd ~/kicad-projects/stm32-min
echo "=== 元件（含型号）==="
grep -A 4 '(comp ' stm32-min.net | grep -E '\(ref |\(value ' | head -40
echo ""
echo "=== 涉及 PB14 的网络 ==="
grep -B 2 -A 8 '"PB14"' stm32-min.net | head -25
```

期望：能看到 `U1` 的型号是 `STM32F103C8Tx`、`Y1` 的值是 `8MHz`、`PB14` 连着 `R2`

**这些信息就是 AI 生成代码的依据。**

- [ ] **Step 2: 写 netlist 解析脚本**

```bash
cat > ~/kicad-projects/stm32-min/gen_code.py <<'PYEOF'
#!/usr/bin/env python3
"""从 KiCad netlist 提取结构化数据，供 AI 生成 MCU 代码。

用法: python3 gen_code.py stm32-min.net [--json|--summary]

输出:
  --json    完整 JSON（元件 + 网络 + 每个引脚的归属）
  --summary 人类可读摘要（默认）
"""
import argparse
import json
import re
from collections import defaultdict


def parse_netlist(path):
    text = open(path, encoding='utf-8').read()

    # --- 元件 ---
    components = {}
    for m in re.finditer(
        r'\(comp\s+\(ref\s+"([^"]+)"\)(.*?)(?=\(comp\s+\(ref|\Z)',
        text, re.DOTALL
    ):
        ref, body = m.group(1), m.group(2)
        val = re.search(r'\(value\s+"([^"]*)"', body)
        fp = re.search(r'\(footprint\s+"([^"]*)"', body)
        components[ref] = {
            'ref': ref,
            'value': val.group(1) if val else '',
            'footprint': fp.group(1) if fp else '',
        }

    # --- 网络 ---
    nets = defaultdict(list)
    for m in re.finditer(
        r'\(net\s+\(code\s+"[^"]*"\)\s*\(name\s+"([^"]+)"\)(.*?)(?=\(net\s+\(code|\Z)',
        text, re.DOTALL
    ):
        name, body = m.group(1), m.group(2)
        for n in re.finditer(
            r'\(node\s+\(ref\s+"([^"]+)"\)\s*\(pin\s+"([^"]+)"\)'
            r'(?:\s*\(pinfunction\s+"([^"]*)"\))?',
            body
        ):
            nets[name].append({
                'ref': n.group(1),
                'pin': n.group(2),
                'pinfunction': n.group(3) or '',
            })

    # --- 反向索引：每个元件的引脚连到哪个网络 ---
    pin_nets = defaultdict(dict)
    for net_name, nodes in nets.items():
        for node in nodes:
            pin_nets[node['ref']][node['pin']] = net_name

    return {
        'components': components,
        'nets': dict(nets),
        'pin_nets': {k: dict(v) for k, v in pin_nets.items()},
    }


def print_summary(data):
    print("═══ 元件清单 ═══")
    for ref, c in sorted(data['components'].items()):
        if ref.startswith('#'):
            continue
        print(f"  {ref:6s} {c['value']:20s} {c['footprint']}")

    print()
    print("═══ 网络连接 ═══")
    for name, nodes in sorted(data['nets'].items()):
        members = ', '.join(
            f"{n['ref']}.{n['pin']}{'(' + n['pinfunction'] + ')' if n['pinfunction'] else ''}"
            for n in nodes
        )
        print(f"  {name:20s} {members}")

    print()
    print("═══ 各元件引脚归属 ═══")
    for ref in sorted(data['pin_nets'].keys()):
        if ref.startswith('#'):
            continue
        pins = data['pin_nets'][ref]
        print(f"  {ref:6s} {pins}")


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('netlist')
    ap.add_argument('--json', action='store_true')
    ap.add_argument('--summary', action='store_true')
    args = ap.parse_args()

    data = parse_netlist(args.netlist)

    if args.json:
        print(json.dumps(data, indent=2, ensure_ascii=False))
    else:
        print_summary(data)
PYEOF

chmod +x ~/kicad-projects/stm32-min/gen_code.py
echo "✅ 脚本已创建"
```

- [ ] **Step 3: 运行解析，验证提取效果**

```bash
cd ~/kicad-projects/stm32-min
python3 gen_code.py stm32-min.net 2>&1 | head -60
```

期望：清晰列出元件（U1=STM32F103C8Tx、Y1=8MHz）、网络（PB14 连着 R2.2）、引脚归属

**这一步验证了「AI 能读到原理图数据」**。如果解析不出内容，说明 netlist 格式与正则不符，需要调整。

- [ ] **Step 4: 用 AI 生成 MCU 代码**

在 Claude Code 会话中，用 `embedded-systems` skill：

```
读取 ~/kicad-projects/stm32-min/gen_code.py 的输出（netlist 结构化数据），
调用 embedded-systems skill，为 STM32F103C8T6 生成 SPL 风格的 main.c。

要求：
1. 从 netlist 提取真实的引脚连接：
   - LED1 → PB14（经 R2 1k 限流）
   - LED2 → PB15（经 R3 1k）
   - LED3 → PC13（经 R4 1k）
   - KEY1 → PB12
   - KEY2 → PB13
   - 晶振 8MHz → PD0/PD1（OSC_IN/OSC_OUT）
2. 生成完整的外设初始化：
   - GPIOB/GPIOC 时钟使能
   - LED 引脚：推挽输出
   - 按键引脚：上拉输入
   - HSE 8MHz 晶振配置（RCC）
3. 生成 main 函数框架：按键控制 LED 的逻辑
4. 每个引脚定义处加注释，标明它来自 netlist 的哪条连接
5. 在文件头注明：引脚定义来自原理图 netlist（可信），
   电气语义（如 LED 低电平点亮）是推断（需人工确认）
```

- [ ] **Step 5: 验证生成的代码**

```bash
cd ~/kicad-projects/stm32-min
wc -l main.c
head -50 main.c
```

检查：
- [ ] 引脚号与 netlist 一致（PB14/PB15/PC13/PB12/PB13）
- [ ] 注释标明信息来源
- [ ] 没有编造的引脚
- [ ] 晶振频率是 8MHz

- [ ] **Step 6: 语法检查（关键验证）**

```bash
cd ~/kicad-projects/stm32-min
arm-none-eabi-gcc -mcpu=cortex-m3 -mthumb -fsyntax-only \
  -I/home/zizimiku/Downloads/STM32_test/Start \
  -I/home/zizimiku/Downloads/STM32_test/Library \
  -DSTM32F10X_MD -DUSE_STDPERIPH_DRIVER \
  main.c 2>&1 | head -20
echo "退出码: $?"
```

期望：退出码 0

**如果报 `stm32f10x.h: No such file`**，确认路径：

```bash
ls -d ~/Downloads/STM32_test/Start ~/Downloads/STM32_test/Library
```

- [ ] **Step 7: 完整编译（可选，更强的验证）**

```bash
cd ~/kicad-projects/stm32-min
mkdir -p build

arm-none-eabi-gcc -mcpu=cortex-m3 -mthumb \
  -DSTM32F10X_MD -DUSE_STDPERIPH_DRIVER \
  -I/home/zizimiku/Downloads/STM32_test/Start \
  -I/home/zizimiku/Downloads/STM32_test/Library \
  -I/home/zizimiku/Downloads/STM32_test/User \
  -c main.c -o build/main.o 2>&1 | head -20
echo "退出码: $?"
ls -la build/main.o 2>/dev/null
```

期望：生成 `main.o`。**这证明代码不只是语法正确，而是能真正编译成 ARM 目标文件。**

---

## Task 10: 写博客

**Files:**
- Create: `~/Documents/Blog/userzbb.github.io/src/content/blog/ai-pcb-workflow/zh-cn.md`
- Create: 配图（如有截图）

**Interfaces:**
- Consumes: Task 1-9 的全部结果与踩坑记录
- Produces: 已部署的博客文章

**博客要求**（沿用之前那篇《Fedora 嵌入式开发环境全栈配置指南》的风格）：
- 每个环节「说明 → 安装/操作 → 验证」
- 验证要做到"实际产出东西"，不只看 success 返回
- 如实标注未完成/未验证的部分

- [ ] **Step 1: 收集素材**

```bash
cd ~/kicad-projects/stm32-min
{
  echo "═══ 最终的工程产物 ═══"
  cat PRODUCTS.txt
  echo ""
  echo "═══ 布线统计 ═══"
  cat /tmp/routing-stats.txt 2>/dev/null
  echo ""
  echo "═══ BOM 摘要 ═══"
  head -20 bom/bom.csv 2>/dev/null
  echo ""
  echo "═══ 生成的代码行数 ═══"
  wc -l main.c 2>/dev/null
} > /tmp/blog-materials.txt

cat /tmp/blog-materials.txt
```

- [ ] **Step 2: 截图（可选但推荐）**

生成可视化产物供配图：

```bash
cd ~/kicad-projects/stm32-min

# 原理图 SVG
kicad-cli sch export svg stm32-min.kicad_sch -o schematic.svg 2>&1 | tail -2

# PCB 顶层视图
kicad-cli pcb export svg stm32-min.kicad_pcb -o pcb-top.svg \
  --layers F.Cu,F.SilkS,Edge.Cuts 2>&1 | tail -2

ls -la *.svg 2>/dev/null
```

- [ ] **Step 3: 写文章**

创建 `~/Documents/Blog/userzbb.github.io/src/content/blog/ai-pcb-workflow/zh-cn.md`

frontmatter 格式（Momo 主题，参考现有文章）：

```yaml
---
title: 用 AI 设计一块 STM32 板子：从原理图到代码的全链路实践
pubDate: 2026-09-19
description: 通过 MCP 让 AI 操作 KiCad 完成原理图、PCB、自动布线、BOM，并从网表生成 MCU 代码——包含全部踩坑记录
image: "https://www.loliapi.com/acg/"
draft: false
slugId: ai-pcb-workflow
category: Hardware
---
```

**文章结构建议**：

1. **写在前面** — 目标、覆盖范围、所需环境
2. **工具链说明** — KiCad / MCP / skills 各自的作用（附星数）
3. **环境搭建** — Task 1-4 的步骤与**全部 7 个坑**
4. **AI 画原理图** — Task 5，含 ERC 验证
5. **AI 布 PCB** — Task 6，含自动布线与 DRC
6. **BOM 生成** — Task 7
7. **制造文件导出** — Task 8
8. **⭐ 从原理图生成代码** — Task 9，这是最有价值的部分
9. **踩坑清单** — 按价值排序
10. **打样前检查清单** — 强调人工复核的必要性

**必须包含的 7 个坑**（都已实测）：
1. Fedora 无 `kicad-libraries` 包
2. pcbnew 路径与 Debian 不同（`/usr/lib64/python3.14/site-packages/`）
3. `import pcbnew` 的断言噪音（无害）
4. **venv 隔离导致 pcbnew 不可见**（改 `pyvenv.cfg`）
5. 官方 `install-linux.sh` 是 Ubuntu 专用
6. 符号库表首次使用不存在（复制模板）
7. `✗ PromptScript does not support global...` 是误报

**诚实标注**：
- ERC/DRC 有 violation 的部分要说清楚
- 自动布线的实际质量（不要美化）
- AI 生成代码里哪些是「来自 netlist」、哪些是「AI 推断」
- 未验证的部分明确标注

- [ ] **Step 4: 构建验证**

```bash
cd ~/Documents/Blog/userzbb.github.io
pnpm build 2>&1 | grep -E "error|Error|Complete|Indexed" | head -8
```

期望：`[build] Complete!`，文章被索引

- [ ] **Step 5: 提交并推送**

```bash
cd ~/Documents/Blog/userzbb.github.io
git add -A
git commit -m "文章：用 AI 设计 STM32 板子——原理图到代码全链路"
GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=no -o BatchMode=yes" git push
```

- [ ] **Step 6: 验证线上**

```bash
sleep 90
curl -s -m 30 -L "https://userzbb.github.io/blog/ai-pcb-workflow/" | grep -oE "<title>[^<]*</title>" | head -1
```

期望：看到文章标题

---

## Task 11: 端到端复现验证

**Files:**
- Create: `~/kicad-projects/verify-ai-pcb.sh`

**Interfaces:**
- Consumes: Task 1-10 的全部产物
- Produces: 一键验证脚本

- [ ] **Step 1: 写验证脚本**

```bash
cat > ~/kicad-projects/verify-ai-pcb.sh <<'SHEOF'
#!/usr/bin/env bash
# AI PCB 工具链健康检查
echo "═══ AI PCB 工具链验证 ═══"
echo ""

check() {
    printf "%-42s" "$1"
    if eval "$2" >/dev/null 2>&1; then echo "✅"; else echo "❌"; fi
}

echo "【核心工具】"
check "kicad-cli" "command -v kicad-cli"
check "node" "command -v node"
check "python3" "command -v python3"
check "java (21+)" "java --version"
check "arm-none-eabi-gcc" "command -v arm-none-eabi-gcc"

echo ""
echo "【KiCad 资源】"
check "符号库 (224个)" "test \$(ls /usr/share/kicad/symbols/*.kicad_sym 2>/dev/null | wc -l) -gt 200"
check "封装库" "test -d /usr/share/kicad/footprints"
check "pcbnew 可导入" "python3 -c 'import pcbnew'"
check "sym-lib-table" "test -f ~/.config/kicad/10.0/sym-lib-table"

echo ""
echo "【MCP 服务器】"
check "dist/index.js" "test -f ~/MCP/KiCAD-MCP-Server/dist/index.js"
check "venv 可见系统包" "grep -q 'include-system-site-packages = true' ~/MCP/KiCAD-MCP-Server/.venv/pyvenv.cfg"
check "MCP 已注册" "grep -q '\"kicad\"' ~/.claude.json"
check "Freerouting JAR" "test -f ~/.kicad-mcp/freerouting.jar"

echo ""
echo "【Skills】"
for s in kicad bom datasheets kicad-schematic kicad-layout kicad-gerbers zener-language embedded-systems; do
    check "skill: $s" "test -d ~/.claude/skills/$s"
done

echo ""
echo "【工程产物】"
P=~/kicad-projects/stm32-min
check "原理图" "test -f $P/stm32-min.kicad_sch"
check "PCB" "test -f $P/stm32-min.kicad_pcb"
check "网表" "test -f $P/stm32-min.net"
check "BOM" "test -f $P/bom/bom.csv"
check "Gerber" "test -n \"\$(ls $P/gerbers/*.gbr 2>/dev/null)\""
check "生成的 main.c" "test -f $P/main.c"
check "main.o 编译产物" "test -f $P/build/main.o"

echo ""
echo "【统计】"
if [ -f $P/stm32-min.kicad_pcb ]; then
    echo "  走线段数: $(grep -c '(segment' $P/stm32-min.kicad_pcb)"
    echo "  过孔数:   $(grep -c '(via' $P/stm32-min.kicad_pcb)"
fi
if [ -f $P/main.c ]; then
    echo "  生成代码: $(wc -l < $P/main.c) 行"
fi
SHEOF

chmod +x ~/kicad-projects/verify-ai-pcb.sh
~/kicad-projects/verify-ai-pcb.sh
```

期望：所有项 ✅

- [ ] **Step 2: 从头复现一次（可选）**

用一个新工程名重跑 Task 5-9，确认流程可复现：

```bash
rm -rf ~/kicad-projects/stm32-e2e
mkdir -p ~/kicad-projects/stm32-e2e
echo "✅ 已清空，在会话中重跑 Task 5-9"
```

- [ ] **Step 3: 记录最终状态**

```bash
{
  echo "# AI PCB 工具链状态"
  echo ""
  echo "生成时间: $(date '+%Y-%m-%d %H:%M')"
  echo ""
  echo "## 版本"
  echo "- KiCad: $(kicad-cli version 2>/dev/null)"
  echo "- Node: $(node --version)"
  echo "- Python: $(python3 --version)"
  echo "- Java: $(java --version 2>&1 | head -1)"
  echo ""
  echo "## MCP"
  python3 -c "
import json, os
d = json.load(open(os.path.expanduser('~/.claude.json')))
print(json.dumps(d.get('mcpServers', {}), indent=2))
"
  echo ""
  echo "## 工程统计"
  P=~/kicad-projects/stm32-min
  echo "- 元件数: $(grep -oE '\(property \"Reference\" \"[^\"#]+' $P/stm32-min.kicad_sch 2>/dev/null | sort -u | wc -l)"
  echo "- 网络数: $(grep -c '(net ' $P/stm32-min.net 2>/dev/null)"
  echo "- 走线段: $(grep -c '(segment' $P/stm32-min.kicad_pcb 2>/dev/null)"
  echo "- 生成代码: $(wc -l < $P/main.c 2>/dev/null) 行"
} > ~/kicad-projects/STATUS-AI-PCB.md

cat ~/kicad-projects/STATUS-AI-PCB.md
```

---

## 风险与限制

| 风险 | 影响 | 缓解 |
|---|---|---|
| **ERC 会有 violation** | 19 元件含 MCU 的电路，未连接引脚多 | 逐条分析，区分「真问题」和「测试电路可接受」 |
| **自动布线质量未知** | 密集板可能大量 DRC 错误 | Task 6 Step 10 有降级方案（增加 attempts） |
| **AI 生成的代码需人工确认** | 电气语义是推断的 | 代码注释标明来源；Task 9 Step 5 有检查清单 |
| **MPN 是预填值** | 可能库存不足或已停产 | Task 7 Step 3 必须先用 LCSC 脚本验证 |
| **MCP 是「部分兼容 Linux」** | 某些工具可能失败 | 每步都用 kicad-cli 独立复核 |
| **博客写作耗时长** | 内容多（11 个 Task 的素材） | 可分段写，先完成技术部分 |

## 范围外

- 多层板（本次用 2 层）
- 高速信号完整性分析
- EMC 预合规完整流程（`kicad-happy@emc` 可用但需单独配置）
- SPICE 仿真（需装 ngspice）
- 实际打样下单
- 焊接与实物验证

---

## 执行顺序提示

```
Task 5  (原理图)  ──→ Task 6  (PCB+布线)
                           │
                           ├──→ Task 8 (Gerber)
                           │
Task 5  ──→ Task 7 (BOM) ──┤
                           │
Task 5  ──→ Task 9 (代码) ──┼──→ Task 10 (博客) ──→ Task 11 (验证)
                           │
                           └──→ Task 11
```

Task 7 和 Task 9 都只依赖 Task 5，可以并行或调换顺序。
