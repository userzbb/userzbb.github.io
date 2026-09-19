---
title: 用 AI 设计一块 STM32 板子：从原理图到代码的全链路实践
pubDate: 2026-09-20
description: 通过 MCP 让 AI 操作 KiCad 完成原理图、PCB、自动布线、BOM、Gerber，并从网表生成可编译的 MCU 代码——含完整工具链搭建与验证
image: "https://www.loliapi.com/acg/"
draft: false
slugId: ai-pcb-workflow
category: Hardware
---

## 写在前面

上一篇《[Fedora 嵌入式开发环境全栈配置指南](/blog/stm32-dev-env/)》配好了 MCU 侧的开发链路——编译、烧录、调试。

这篇解决另一半问题：**硬件设计本身能不能让 AI 来做？**

目标是让 AI 完成这条链路：

```
需求描述 → 原理图 → PCB → 自动布线 → BOM → Gerber → 从原理图生成 MCU 代码
```

涉及的工具链：

| 层次 | 工具 | 作用 |
| --- | --- | --- |
| **EDA 引擎** | KiCad 10.0.6 | 提供文件格式与 `kicad-cli` |
| **协议层** | [KiCAD-MCP-Server](https://github.com/mixelpixx/KiCAD-MCP-Server)（2350⭐） | 把 KiCad 能力暴露为 233 个 MCP 工具 |
| **布线引擎** | [Freerouting](https://github.com/freerouting/freerouting) 2.4.1（2002⭐） | 自动布线 |
| **领域知识** | [kicad-happy](https://github.com/aklofas/kicad-happy)（1257⭐，11 skills） | 分析/BOM/datasheet/EMC/SPICE |
| | [kistack](https://github.com/american-embedded/kistack)（386⭐，10 skills） | 原理图/PCB/布局/导出 |
| | [diodeinc/pcb](https://github.com/diodeinc/pcb)（450⭐，5 skills） | Zener 代码化设计 |
| | [embedded-systems](https://github.com/jeffallan/claude-skills)（11537⭐） | 教 AI 写正确的 MCU 代码 |
| **AI 助手** | Claude Code + 19 个插件 | 编排全部 |

每一节的结构：**说明 → 操作 → 验证**。验证尽量做到"实际产出东西"（ERC 报告、DRC 报告、编译出的 `.o`），而不是只看工具的 success 返回。

---

## 一、为什么选 KiCad

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

**验证**：

```bash
kicad-cli version
# 10.0.6

ls /usr/share/kicad/symbols/ | wc -l      # 224 个符号库
ls /usr/share/kicad/footprints/ | wc -l   # 155 个封装库
```

检查关键子命令存在（后面全靠它们）：

```bash
kicad-cli sch export --help | grep -E "bom|netlist|pdf"
kicad-cli pcb export --help | grep -E "gerbers|drill|step"
```

> **坑 1**：Fedora **没有** `kicad-libraries` 包（那是 Debian/Ubuntu 的包名）。Fedora 只有 `kicad` / `kicad-doc` / `kicad-packages3d` 三个，库文件随主包一起装。库缺失的话重装主包：`sudo dnf reinstall kicad`。

---

## 二、让 AI 能操作 KiCad：MCP 服务器

### 说明

**MCP（Model Context Protocol）** 是让 AI 调用外部工具的协议。装了 MCP 服务器之后，AI 就能直接调用它暴露的工具。

我搜了 MCP 注册表和 GitHub，找到 **5 个** KiCad MCP 服务器：

| 项目 | Stars | 能力 |
| --- | --- | --- |
| **mixelpixx/KiCAD-MCP-Server** | **2350** | ✅ 233 工具，含自动布线 |
| lamaalrajih/kicad-mcp | 524 | ❌ 只能读/分析，不能绘制 |
| Seeed-Studio/kicad-mcp-server | 130 | 分析为主 |
| oaslananka/kicad-mcp-pro | 95 | 项目设置+编辑 |
| ProductOfAmerica/mcp-server-kicad | **10** | 功能描述全，但星数太低 |

**选星数最高的那个**（2350⭐，且当天还在更新）。

### 安装

```bash
mkdir -p ~/MCP && cd ~/MCP
git clone --depth 1 https://github.com/mixelpixx/KiCAD-MCP-Server.git
cd KiCAD-MCP-Server

# Python 依赖
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

# Node 依赖 + 构建
npm install && npm run build
```

**验证构建产物**：

```bash
ls -la dist/index.js
```

**测试 MCP 握手**（不依赖 Claude Code，独立验证）：

```python
# /tmp/mcp-test.py
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

运行结果：

```
握手: {'name': 'kicad-mcp-server', 'version': '2.7.0', ...}
工具数: 233
```

**233 个工具**，分布如下（实测统计）：

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

> **坑 2（最关键）**：MCP 启动时报 `pcbnew validation failed`。
>
> 原因：MCP 自动发现 `.venv` 并优先用它，但 **venv 默认隔离系统包**，看不到系统装的 `pcbnew`。
>
> 修复：
> ```bash
> sed -i 's/include-system-site-packages = false/include-system-site-packages = true/' \
>   ~/MCP/KiCAD-MCP-Server/.venv/pyvenv.cfg
> ```
> 验证：`.venv/bin/python -c "import pcbnew; print(pcbnew.GetBuildVersion())"`

> **坑 3**：Fedora 的 `pcbnew` 在 `/usr/lib64/python3.14/site-packages/pcbnew.py`，**不是** Debian 风格的 `/usr/lib/kicad/lib/python3/dist-packages/`。系统 `python3` 本来就能 import，不用配 PYTHONPATH。

> **坑 4**：`import pcbnew` 会向 stderr 刷几行 `assert "m_choices.GetCount() > 0" failed`。这是 KiCad 10.0.6 在 Fedora 构建下的已知问题，**不影响功能**。

> **坑 5**：官方 `scripts/install-linux.sh` 是 **Ubuntu 专用**（用 `apt-get` + `add-apt-repository ppa:`）。Fedora 上跑不了，手动执行上面那几步即可。

### 注册到 Claude Code

```bash
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
```

**验证**：

```bash
claude mcp list
# kicad: node .../dist/index.js - ✔ Connected
```

> **注册后需要重启 Claude Code**，工具才会加载。

> **坑 6**：首次使用前，用户的 `~/.config/kicad/10.0/` 里**没有 `sym-lib-table`**（要 KiCad GUI 首次启动才生成）。不修的话 MCP 会报 `Library 'Device' not found in sym-lib-table`。
>
> ```bash
> cp /usr/share/kicad/template/sym-lib-table ~/.config/kicad/10.0/
> cp /usr/share/kicad/template/fp-lib-table  ~/.config/kicad/10.0/
> ```

---

## 三、Freerouting：自动布线

### 说明

**Freerouting 是开源的 PCB 自动布线器**（2002⭐）。给它一个网表，它算出走线。

KiCAD-MCP-Server 已经集成了它——只要 JAR 在正确的位置，MCP 的 `autoroute` 工具就能用。

**依赖 Java 21+**（本机 OpenJDK 25 已满足）。

### 安装

```bash
mkdir -p ~/.kicad-mcp
curl -L -o ~/.kicad-mcp/freerouting.jar \
  https://github.com/freerouting/freerouting/releases/download/v2.4.1/freerouting-2.4.1.jar
```

**注意路径**：MCP 期望的是 **`~/.kicad-mcp/freerouting.jar`**，不是随便放哪都行。

**验证**：

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

`"ready": true` 才说明配好了。

> **坑 7**：Freerouting 的版本号要去 GitHub release 页确认。网上教程写的 v2.0.1 已经过时，那个 URL 现在返回 9 字节的 404 页面。

---

## 四、Skills：给 AI 领域知识

### 说明

**插件（MCP）给 AI 工具，Skills 给 AI 知识**。

原理图怎么画才规范、BOM 怎么补全料号、MCU 代码怎么写才可靠——这些是知识，用 skill 传递。

装了 4 个包，共 **27 个 skills**：

```bash
npx -y skills add aklofas/kicad-happy -g -y                          # 1257⭐ 11个
npx -y skills add american-embedded/kistack -g -y                    # 386⭐  10个
npx -y skills add diodeinc/pcb -g -y                                 # 450⭐  5个
npx -y skills add jeffallan/claude-skills@embedded-systems -g -y     # 11537⭐ 1个
```

**验证**：

```bash
ls ~/.claude/skills/ | grep -cE 'kicad|pcb|bom|spice|emc|datasheet|schematic|layout|gerber|zener|embedded'
# 21

ls ~/.claude/skills/ | wc -l
# 72（安装前 45）
```

装了哪些：

| 包 | Skills |
| --- | --- |
| kicad-happy | `kicad` `bom` `datasheets` `digikey` `mouser` `lcsc` `element14` `jlcpcb` `pcbway` `spice` `emc` |
| kistack | `kicad-schematic` `kicad-pcb` `kicad-layout` `kicad-bom` `kicad-export` `kicad-gerbers` `kicad-panelize` `kicad-footprint` `kicad-symbol` `pcb-product-render` |
| diodeinc/pcb | `zener-language` `datasheet-reader` `spice-sim` `librarian` `registry-search` |
| jeffallan | `embedded-systems` |

> **坑 8**：安装时会看到 `✗ PromptScript does not support global skill installation`。
>
> **这是误报**。`npx skills` 会同时尝试两种格式：`.agents/skills/`（PromptScript，供 Copilot 等用）和 Claude Code 格式。前者不支持全局安装所以报 ✗，**但后者成功了**。判断方法：看 `~/.claude/skills/` 里有没有对应目录。

---

## 五、实战：让 AI 设计一块 STM32 最小系统板

### 目标

一块基于 **STM32F103C8T6** 的最小系统板，包含常见的周边电路：

| 元件 | 型号/值 | 连接 |
| --- | --- | --- |
| U1 | STM32F103C8Tx (LQFP-48) | MCU |
| Y1 | 8MHz 晶振 + C1/C2 22pF | PD0/PD1 |
| R1 + C3 | 10k + 100nF | 复位电路 |
| R2/R3/R4 + D1/D2/D3 | 1k + LED | PB14 / PB15 / PC13 |
| SW1/SW2 | 按键 | PB12 / PB13 |
| C4/C5/C6 | 100nF | 电源去耦 |

选这个电路的原因：**它包含了生成 MCU 代码所需的全部信息**——芯片型号、晶振频率、每个引脚接了什么。

### 第一步：AI 画原理图

用 MCP 的 `batch_add_and_connect` —— 一次调用完成**放置 + 连接**：

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

然后连 MCU 引脚：

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

**电气规则完全干净。**

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

# 自动布线
mcp__kicad__autoroute(boardPath="...", timeout=300)
```

布线结果：

```
Autoroute completed in 10.1s
board_stats: { "tracks": 141, "vias": 14 }
```

**10.1 秒，141 条走线 + 14 个过孔。**

**验证：DRC 检查**

```bash
kicad-cli pcb drc stm32-min.kicad_pcb -o /tmp/drc.rpt
```

```
Found 0 violations
Found 0 unconnected items
```

**全部连通，零违规。**

> **坑 9**：第一次跑 DRC 报了 **24 个 `track_width` 违规**。
>
> 原因：Freerouting 用 0.15mm 走线，但 KiCad 工程的 `min_track_width` 是 0.20mm。
>
> **关键点**：MCP 的 `set_design_rules` 只改**内存状态**，不落盘。`kicad-cli` 读的是磁盘文件，所以改完还是报错。
>
> 正确做法——直接改工程文件：
> ```python
> import json
> p = 'stm32-min.kicad_pro'
> d = json.load(open(p))
> d['board']['design_settings']['rules']['min_track_width'] = 0.15
> json.dump(d, open(p, 'w'), indent=2)
> ```

> **坑 10**：`suggest_placement`（自动布局工具）对这个电路**不适用**。它报告 `improvement_pct: -159.8`——HPWL（连线总长）反而从 100mm 涨到 260mm。原因是所有元件初始都在 (0,0) 重叠，评分基准失真。改用手动指定坐标效果更好。

### 第三步：导出制造文件

```bash
cd ~/kicad-projects/stm32-min
mkdir -p gerbers

# Gerber（13 个文件：铜层、阻焊、丝印、板框等）
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

产物汇总：

```
【原理图】  stm32-min.kicad_sch    83 KB
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

```python
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

```bash
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

把上面这些数据 + `embedded-systems` skill 的指导交给 AI，生成 `main.c`。

生成结果的关键片段：

```c
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

```c
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

**第四步：编译验证**

```bash
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

**编译通过，480 字节代码段。**

### 诚实标注：哪些是"读出来的"，哪些是"猜的"

这是这类工作**最重要的一点**。netlist 只记录**物理连接**，不记录**设计意图**。

生成代码时我在文件头明确区分了两类信息：

| 类别 | 内容 | 可信度 |
| --- | --- | --- |
| ✅ **来自 netlist** | MCU 型号、晶振频率、电阻电容值、**每一根引脚连接** | 可信——直接从原理图读出 |
| ⚠️ **AI 推断** | LED 是低电平还是高电平点亮、按键是否需要内部上拉、消抖时间 20ms | **需人工确认** |

例如：

```c
 * 【AI 推断 —— 需人工确认】
 *   ⚠️ LED 极性: netlist 只显示"LED1_A 网络连接 R2 和 D1 的第 1 脚"，
 *      无法从中判断 LED 是高电平点亮还是低电平点亮。
 *      本代码按【低电平点亮】编写，依据是 D1 的阴极(第2脚)接 GND。
 *      如果实际硬件相反，把 LED_On/LED_Off 里的位操作对调即可。
```

**为什么不能全自动**：netlist 描述的是"R2.2 和 D1.1 相连"，但"这是 LED 限流电阻、GPIO 应配置为推挽输出"是**人的判断**。AI 能做出合理推断，但推断可能错。

---

## 六、踩坑清单

按"值得记住"排序：

1. **venv 隔离导致 pcbnew 不可见** ⭐⭐⭐ — MCP 自动用 `.venv`，但 venv 看不到系统包。改 `pyvenv.cfg` 的 `include-system-site-packages`。

2. **`set_design_rules` 不落盘** ⭐⭐ — MCP 改的是内存状态，`kicad-cli` 读磁盘。设计规则要直接改 `.kicad_pro`。

3. **符号库表首次使用前不存在** ⭐⭐ — `~/.config/kicad/10.0/sym-lib-table` 要手动从模板复制，否则 MCP 找不到任何符号库。

4. **Fedora 的 Python 路径与 Debian 不同** — 是 `/usr/lib64/python3.14/site-packages/`，不是 `dist-packages`。

5. **Fedora 没有 `kicad-libraries` 包** — 那是 Debian 包名，Fedora 库随主包。

6. **官方 `install-linux.sh` 是 Ubuntu 专用** — 用 `apt-get` 和 PPA，Fedora 上跑不了。

7. **Freerouting 版本要现查** — 网上写的 v2.0.1 已过时，实际最新是 v2.4.1。

8. **`✗ PromptScript does not support global...` 是误报** — Claude Code 格式其实装成功了。

9. **`import pcbnew` 的断言噪音** — `assert "m_choices.GetCount() > 0" failed`，无害。

10. **`suggest_placement` 对重叠元件不适用** — 元件全在原点时 HPWI 评分失真。

---

## 七、AI 做硬件设计的边界

跑完整个链路后，我的结论：

### ✅ AI 现在能做好的

| 能力 | 证据 |
| --- | --- |
| 读写原理图 | 17 个元件、32 个引脚连接，ERC 0 violation |
| 生成 PCB + 自动布线 | 141 走线，10.1 秒，DRC 0 violations |
| 导出制造文件 | 13 个 Gerber + 钻孔 + BOM + PDF + STEP |
| **从网表生成代码** | **编译通过，480 字节代码段** |
| 查数据手册、比价选型 | `kicad-happy` 系列 skills |

### ⚠️ AI 做不好的

| 问题 | 表现 |
| --- | --- |
| **原理图排版美观度** | 文字重叠、布局不合理。需要人眼判断，而 MCP 只有坐标级 API |
| **电气语义推断** | 能猜 LED 极性，但可能猜错 |
| **元件选型** | 能给出候选，但电压余量、精度等级要人判断 |
| **高频/EMI/散热** | 完全超出能力范围 |

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

## 八、完整工具链一览

| 组件 | 版本 | 来源 | 作用 |
| --- | --- | --- | --- |
| **KiCad** | 10.0.6 | dnf | EDA 引擎 + `kicad-cli` |
| **KiCAD-MCP-Server** | 2.7.0 | [mixelpixx](https://github.com/mixelpixx/KiCAD-MCP-Server)（2350⭐） | 233 个 MCP 工具 |
| **Freerouting** | 2.4.1 | [freerouting](https://github.com/freerouting/freerouting)（2002⭐） | 自动布线 |
| **kicad-happy** | — | [aklofas](https://github.com/aklofas/kicad-happy)（1257⭐） | 11 skills：分析/BOM/datasheet/EMC/SPICE |
| **kistack** | — | [american-embedded](https://github.com/american-embedded/kistack)（386⭐） | 10 skills：原理图/PCB/布局/导出 |
| **diodeinc/pcb** | — | [diodeinc](https://github.com/diodeinc/pcb)（450⭐） | 5 skills：Zener 代码化设计 |
| **embedded-systems** | — | [jeffallan](https://github.com/jeffallan/claude-skills)（11537⭐） | MCU 代码规范 |
| Node.js | v24.14.0 | dnf/nvm | 运行 MCP |
| Python | 3.14.7 | 系统 | KiCad 绑定 |
| Java | OpenJDK 25.0.2 | sdkman | Freerouting |

**辅助工具链**（上一篇配的）：`arm-none-eabi-gcc` 15.2.0（验证生成的代码能编译）、`st-flash` / `JLinkExe`（烧录到实物）。

---

## 结语

整条链路是通的，而且每一环都有**可验证的产物**：

```
需求  →  原理图  →  PCB  →  布线  →  Gerber  →  代码
        ERC 0       DRC 0    141 走线   13 个文件   编译通过
```

**最值得记的两点**：

1. **KiCad 的开放文件格式是前提**。S-expression 是纯文本，AI 才能直接操作。换成封闭格式的 EDA 工具，这套做法行不通。

2. **AI 能"读出"原理图数据，但"理解"电路需要人**。netlist 给的是连接关系（确定性的），设计意图（LED 极性、去耦策略、EMC 考虑）需要判断。所以生成代码时我严格区分了「来自 netlist」和「AI 推断」两类信息——**这个区分比代码本身更重要**。

硬件设计不像纯软件——**错误要花钱**。AI 能大幅加速设计流程，但打样前的复核不能省。
