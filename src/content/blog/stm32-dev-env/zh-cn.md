---
title: Fedora 嵌入式开发环境全栈配置指南
pubDate: 2026-09-19
description: 从主机编译工具链、ARM 交叉编译、烧录调试，到 Rust 嵌入式、Zephyr、PlatformIO，以及 AI agent 工具与 skills 配置——每个环节都包含说明、安装、验证
image: "https://www.loliapi.com/acg/"
draft: false
slugId: embedded-toolchain-setup
category: Hardware
---

## 写在前面

这篇文章记录我在 Fedora 44 上把一整套嵌入式开发环境搭起来的过程。目标平台是 STM32F103C8T6，调试器有 ST-Link V2 和 J-Link。

覆盖范围：

| 层次 | 内容 |
| --- | --- |
| 主机编译 | gcc / g++ / clang / make / cmake / ninja / gdb |
| 交叉编译 | arm-none-eabi 工具链 |
| 烧录调试 | ST-Link / J-Link / OpenOCD |
| Rust 嵌入式 | rustup / probe-rs / espup |
| RTOS | Zephyr（含 SDK 安装） |
| 一体化平台 | PlatformIO |
| 图形配置 | STM32CubeMX |
| AI 辅助 | Claude Code 插件与嵌入式 skills |
| 实战 | Keil 工程迁移到 GCC |

每一节的结构都一样：**先说明这是什么、为什么需要，再安装，最后验证**。验证尽量做到"实际编译出东西"，而不是只看版本号。

---

## 一、主机编译工具链

### 说明

这是所有开发的基础。写 C/C++ 代码、构建项目，都依赖这几个工具：

| 工具 | 作用 |
| --- | --- |
| **gcc / g++** | C/C++ 编译器，Linux 上最主流 |
| **clang** | LLVM 的 C/C++ 编译器，报错信息更友好，也是很多现代工具链的后端 |
| **make** | 传统构建工具，读 Makefile 决定编译顺序 |
| **cmake** | 跨平台构建系统生成器，生成 Makefile 或 Ninja 文件 |
| **ninja** | 专注于速度的构建系统，CMake 常与它搭配 |
| **gdb** | GNU 调试器，能断点、单步、看变量 |

嵌入式开发里，**主机工具链负责编译工具本身**（比如编译 OpenOCD），而**目标代码要用交叉编译器**（下一节）。两者不能混。

### 安装

Fedora 41 之后 DNF5 成为默认包管理器，**软件包组的名称从"显示名"改成了"组 ID"**——这是第一个坑：

```bash
# ❌ 旧语法，Fedora 44 上会失败
sudo dnf group install "Development Tools"
# Failed to resolve the transaction:
# No match for argument: Development Tools

# ✅ 新语法，注意 @ 前缀
sudo dnf install @development-tools
```

单独安装其余的（这些**不在** development-tools 组里）：

```bash
sudo dnf install gcc gcc-c++ clang make cmake ninja-build gdb
```

> **注意**：Fedora 上 C++ 编译器的包名是 `gcc-c++`，不是 `g++`。

### 验证

先看版本：

```bash
gcc --version      # gcc (GCC) 16.2.1
g++ --version      # g++ (GCC) 16.2.1
clang --version    # clang version 22.1.8
make --version     # GNU Make 4.4.1
cmake --version    # cmake version 4.3.0
ninja --version    # 1.13.2
gdb --version      # GNU gdb 17.2
```

再实际编译运行一个程序——**这才是真的验证**：

```bash
cd /tmp && cat > t.c <<'EOF'
#include <stdio.h>
int main(){ printf("hello\n"); return 0; }
EOF

gcc t.c -o t && ./t
# hello
```

看到 `hello` 就说明主机工具链可用。

---

## 二、ARM 交叉编译工具链

### 说明

**为什么要"交叉"**：你的电脑是 x86_64 架构，而 STM32 是 ARM Cortex-M 内核。x86 的 gcc 编译出来的程序在 STM32 上跑不了。所以需要一套**在 x86 上运行、但生成 ARM 机器码**的编译器，这就是"交叉编译器"。

命名规则是 `架构-厂商-系统-ABI`：

```
arm - none - eabi
 │     │      │
 │     │      └─ EABI：嵌入式应用二进制接口
 │     └──────── none：无操作系统（裸机）
 └────────────── arm：ARM 架构
```

常用的配套工具：

| 工具 | 作用 |
| --- | --- |
| `arm-none-eabi-gcc` | 交叉编译器 |
| `arm-none-eabi-objcopy` | 格式转换（ELF → bin/hex） |
| `arm-none-eabi-objdump` | 反汇编 |
| `arm-none-eabi-size` | 查看固件占用 |
| `arm-none-eabi-ld` / `ar` | 链接器 / 静态库 |

### 安装

```bash
sudo dnf install arm-none-eabi-gcc-cs arm-none-eabi-gcc-cs-c++ \
                 arm-none-eabi-binutils arm-none-eabi-newlib
```

> **包名注意**：Fedora 里这个包叫 `arm-none-eabi-gcc-cs`（带 `-cs` 后缀，表示 CodeSourcery 版本），不是简单的 `arm-none-eabi-gcc`。

### 验证

```bash
arm-none-eabi-gcc --version
# arm-none-eabi-gcc (Fedora 15.2.0-4.fc44) 15.2.0
```

实际编译一个 Cortex-M3 目标文件：

```bash
cat > arm.c <<'EOF'
int main(void){ volatile int i=0; while(1){ i++; } return 0; }
EOF

arm-none-eabi-gcc -mcpu=cortex-m3 -mthumb -c arm.c -o arm.o
arm-none-eabi-size arm.o
#    text    data     bss     dec     hex filename
#      18       0       0      18      12 arm.o
```

编译通过、能用 `size` 看到占用，说明工具链完整。

> **注意**：Fedora 仓库**没有** `arm-none-eabi-gdb`。但系统自带的 `gdb` 已经编译了多目标支持：
> ```bash
> gdb --configuration | grep enable-targets
> # --enable-targets=...,arm-linux-gnu
> ```
> 所以调试 ARM 目标不需要额外装 gdb。

---

## 三、烧录与调试工具

### 说明

代码编译出来是 `.elf` / `.bin`，需要**通过调试探针写进芯片的 Flash**。不同探针对应不同工具。

| 工具 | 对应硬件 | 特点 |
| --- | --- | --- |
| **st-flash / st-info / st-util** | ST-Link | 开源，ST-Link 专用 |
| **JLinkExe / JLinkGDBServer** | J-Link | SEGGER 官方，功能最全 |
| **OpenOCD** | 多种 | 开源，支持 ST-Link、J-Link、CMSIS-DAP 等 |
| **picocom** | — | 串口终端，看日志用 |

三者关系：

- **ST-Link 用户**：`st-flash` 最省事，`openocd` 更灵活
- **J-Link 用户**：只能用 SEGGER 官方软件（OpenOCD 也支持，但功能少）
- 调试都要走 **GDB**：`st-util` / `JLinkGDBServer` / `openocd` 提供一个 GDB Server 端口，然后 gdb 连上去

### 安装

**ST-Link 和 OpenOCD**（Fedora 仓库直接有）：

```bash
sudo dnf install stlink openocd picocom
```

**J-Link**（商业软件，不在仓库里）：

从 [segger.com/downloads/jlink](https://www.segger.com/downloads/jlink/) 下载。**这里有个大坑**：

```bash
# ❌ 这样下到的是 27KB 的 HTML 页面，不是安装包
wget https://www.segger.com/downloads/jlink/JLink_Linux_x86_64.rpm
file JLink_Linux_x86_64.rpm
# HTML document, ASCII text

# ✅ 真实的文件名带版本号
# JLink_Linux_V978_x86_64.rpm   (73MB)
```

原因是 SEGGER 要求你**先在页面上同意许可协议**。命令行直接请求只会拿到那个协议页。

正确的做法是在浏览器里下载，然后：

```bash
# 先验证文件类型
file ~/Downloads/JLink_Linux_V978_x86_64.rpm
# RPM v3.0 bin i386/x86_64 jlink-9.78.0-1

sudo dnf install -y ~/Downloads/JLink_Linux_V978_x86_64.rpm
```

### 验证

**版本检查**：

```bash
st-flash --version    # v1.8.0
openocd --version     # Open On-Chip Debugger 0.12.0
JLinkExe              # SEGGER J-Link Commander V9.78
picocom --version     # picocom v2024-07
```

**硬件探测**（插上探针后）——这是最有价值的验证，因为能**自动识别芯片型号**：

```bash
st-info --probe
# Found 1 stlink programmers
#   version:    V2J29S7
#   serial:     E1007200D0D2139393740544
#   flash:      65536 (pagesize: 1024)
#   sram:       20480
#   chipid:     0x410
#   dev-type:   STM32F1xx_MD
```

`dev-type: STM32F1xx_MD` 直接告诉你这是 STM32F1 系列中容量芯片，Flash 64KB / RAM 20KB。

**udev 权限**：J-Link 的 RPM 包会自动装 `/etc/udev/rules.d/99-jlink.rules`，普通用户即可访问探针，不需要 sudo。

---

## 四、Rust 嵌入式开发

### 说明

Rust 在嵌入式领域的优势是**编译期内存安全**——没有空指针、没有数据竞争、不需要 GC。生态里最成熟的框架是 **Embassy**，它把 `async/await` 带进裸机，用编译期状态机替代传统 RTOS 的任务调度。

核心工具：

| 工具 | 作用 |
| --- | --- |
| **rustup** | Rust 工具链管理器 |
| **probe-rs** | 现代化的烧录/调试工具，替代 OpenOCD |
| **flip-link** | 栈溢出保护链接器 |
| **espup** | ESP32 专用（Xtensa 架构需要定制工具链） |

Rust 用 **target** 表示编译目标。嵌入式常用的：

| Target | 对应内核 | 典型芯片 |
| --- | --- | --- |
| `thumbv6m-none-eabi` | Cortex-M0/M0+ | RP2040 |
| `thumbv7m-none-eabi` | Cortex-M3 | **STM32F103** |
| `thumbv7em-none-eabihf` | Cortex-M4F/M7F | STM32F4 |
| `thumbv8m.main-none-eabihf` | Cortex-M33 | RP2350 |

### 安装

```bash
# 1. 系统依赖（probe-rs 需要 libusb 和 libudev）
sudo dnf install libusbx-devel libftdi-devel libudev-devel openssl-devel perl gcc

# 2. Rust 工具链
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env

# 3. 烧录调试工具（编译时间较长）
cargo install probe-rs-tools

# 4. 辅助工具
cargo install flip-link
rustup component add llvm-tools
cargo install cargo-binutils
```

**probe-rs 的 udev 规则**（不加普通用户无法访问探针）：

```bash
curl -o /tmp/69-probe-rs.rules https://probe.rs/files/69-probe-rs.rules
sudo cp /tmp/69-probe-rs.rules /etc/udev/rules.d/
sudo udevadm control --reload
sudo udevadm trigger
```

**添加编译目标**：

```bash
rustup target add thumbv7m-none-eabi        # Cortex-M3
rustup target add thumbv6m-none-eabi        # Cortex-M0+
rustup target add thumbv7em-none-eabihf     # Cortex-M4F
rustup target add thumbv8m.main-none-eabihf # Cortex-M33
```

### 验证

**版本**：

```bash
rustc --version      # rustc 1.98.1
cargo --version      # cargo 1.98.1
probe-rs --version   # probe-rs 0.32.0
rustup target list --installed
# thumbv7m-none-eabi
# thumbv6m-none-eabi
# ...
```

**实际编译**（这才是关键）：

```bash
cat > rust.rs <<'EOF'
#![no_std]
#![no_main]
#[panic_handler]
fn p(_: &core::panic::PanicInfo) -> ! { loop {} }
#[no_mangle]
pub extern "C" fn _start() -> ! { loop {} }
EOF

rustc --target thumbv7m-none-eabi --crate-type staticlib rust.rs -o librust.a
ls -lh librust.a
# -rw-r--r-- 1 user user 7.7M librust.a
```

能生成 ARM 静态库，说明 target 和工具链都正常。

**探测探针**：

```bash
probe-rs list
# 插上探针时应该显示 "STLink V2" 或 "J-Link"
```

### ESP32 补充

Xtensa 架构的 ESP32 **不被 Rust 标准工具链支持**，需要乐鑫的定制版本：

```bash
cargo install espup --locked
espup install
```

安装后会生成 `~/export-esp.sh`，需要每次 shell 启动时加载。zsh 用户：

```bash
cat $HOME/export-esp.sh >> ~/.zshrc
```

文件内容大致是：

```bash
export LIBCLANG_PATH=".../esp-clang/lib"
export PATH=".../xtensa-esp-elf/bin:$PATH"
```

验证：

```bash
espup --version   # espup 0.17.1
```

---

## 五、Zephyr RTOS

### 说明

**Zephyr 是什么**：一个开源的实时操作系统（RTOS），支持几百种开发板，模块化程度高，适合正经的 IoT 产品。

它和裸机开发的区别在于：自带内核、线程调度、设备驱动模型、设备树（Device Tree）配置系统。代价是**环境配置比裸机复杂得多**。

Zephyr 的架构是 **west 工作区**：

```
~/zephyrproject/          ← 工作区根（有 .west 目录标识）
├── .west/                ← west 的元数据
├── zephyr/               ← Zephyr 源码
├── modules/              ← 各个依赖模块（HAL、加密库等）
├── tools/
└── myprojects/           ← 你自己的项目放这里
```

`west` 是它的元构建工具，必须在工作区内运行（会逐级向上找 `.west`）。

**关键概念：Zephyr SDK**。这是一个包含所有架构交叉编译器的套装包。**没有它，Zephyr 一行代码都编译不了**。这是最容易出问题的环节，下面详细讲。

### 安装

#### 步骤 1：安装系统依赖

```bash
# 注意 DNF5 的组名格式
sudo dnf install @development-tools @c-development

sudo dnf install git cmake ninja-build gperf ccache dfu-util dtc wget \
  python3-pip python3-tkinter xz file glibc-devel.i686 libstdc++-devel.i686
```

#### 步骤 2：创建 west 工作区

```bash
python3 -m venv ~/zephyrproject/.venv
source ~/zephyrproject/.venv/bin/activate

pip install west
west init ~/zephyrproject
cd ~/zephyrproject
west update              # 拉取所有模块，比较慢
west zephyr-export       # 导出 CMake 包
pip install -r ~/zephyrproject/zephyr/scripts/requirements.txt
```

> **踩坑记录**：如果先跑 `west zephyr-export` 再装 Python 依赖，会报：
> ```
> ModuleNotFoundError: No module named 'jsonschema'
> ```
> 紧接着还会跟一个 `AttributeError: 'NoneType' object has no attribute 'err'`——那是 west 自身的 bug，报告错误时又抛了新异常，把真正的错误盖住了。**正确顺序是先 `pip install`，再 `export`。**

#### 步骤 3：安装 Zephyr SDK ⭐

这是最容易踩坑的一步。**三个坑**：

**坑 1：版本必须匹配**

```bash
cat ~/zephyrproject/zephyr/SDK_VERSION
# 1.0.1
```

SDK 版本要和工作区要求一致，否则编译会报错。

**坑 2：文件名带 `_gnu` 后缀**

```bash
# ❌ 404
zephyr-sdk-1.0.1_linux-x86_64.tar.xz

# ✅ 正确
zephyr-sdk-1.0.1_linux-x86_64_gnu.tar.xz
```

**坑 3：下载容易中断，必须校验大小**

```bash
cd ~
curl -L --retry 5 -C - -o zephyr-sdk-1.0.1_linux-x86_64_gnu.tar.xz \
  https://github.com/zephyrproject-rtos/sdk-ng/releases/download/v1.0.1/zephyr-sdk-1.0.1_linux-x86_64_gnu.tar.xz
```

下载后**一定要检查大小**：

```bash
ls -lh zephyr-sdk-1.0.1_linux-x86_64_gnu.tar.xz
# 应该约 2.0GB
```

我第一次只下到 62MB，解压时报：

```
xz: (stdin): Unexpected end of input
tar: Unexpected EOF in archive
```

**坑 4：`setup.sh` 会卡死** ⭐⭐

解压后要运行 `setup.sh` 注册工具链：

```bash
tar xf zephyr-sdk-1.0.1_linux-x86_64_gnu.tar.xz
cd zephyr-sdk-1.0.1
./setup.sh
```

**但如果用非交互方式运行（比如重定向输入），脚本会陷入死循环，CPU 100% 空转。**

原因在脚本的 `ask_yn` 函数：

```bash
ask_yn()
{
  local reply
  while true; do
    read -r -p "$1 [y/n]? " reply    # 从 /dev/null 读取 → 立即 EOF
    case "${reply}" in
      Y* | y*)  return 0 ;;
      N* | n*)  return 1 ;;
      *)        echo "Invalid choice '${reply}'" ;;   # 空响应 → 死循环
    esac
  done
}
```

`read` 读到 EOF 返回空字符串，`case` 匹配到 `*` 分支，打印提示后**再次循环**——永久空转。

我观察到的情况：

```bash
ps -o pid,etime,time,%cpu,cmd -p <pid>
#  154267  21:14  21:03  99.1  bash ./setup.sh
# 运行 21 分钟，CPU 时间 21 分钟，占用 99.1%
```

**正解：用 `yes` 预先喂入所有确认为 y**：

```bash
yes | ./setup.sh
```

### 验证

SDK 安装的验证要分四层，逐层排除：

**第 1 层：目录结构完整**

```bash
ls ~/zephyr-sdk-1.0.1/
# 应该包含：cmake/  gnu/  hosttools/  llvm/  sysroots/  setup.sh  sdk_version
```

**第 2 层：ARM 工具链存在**

```bash
ls ~/zephyr-sdk-1.0.1/gnu/
# 会列出所有架构，关键是包含 arm-zephyr-eabi
# aarch64-zephyr-elf  arc-zephyr-elf  arm-zephyr-eabi  riscv64-zephyr-elf ...
```

**第 3 层：编译器能运行**

```bash
~/zephyr-sdk-1.0.1/gnu/arm-zephyr-eabi/bin/arm-zephyr-eabi-gcc --version
# arm-zephyr-eabi-gcc (Zephyr SDK 1.0.1) 14.3.0
```

**第 4 层：CMake 注册成功**

```bash
ls ~/.cmake/packages/Zephyr-sdk/
# 应该有一个哈希文件名的文件
```

**第 5 层（终极）：实际编译**

```bash
cd ~/zephyrproject
source .venv/bin/activate
west build -b stm32f4_disco zephyr/samples/basic/blinky
```

成功输出：

```
[161/161] Linking C executable zephyr/zephyr.elf
Memory region         Used Size  Region Size  %age Used
           FLASH:       18056 B         1 MB      1.72%
             RAM:        4608 B       128 KB      3.52%
Generating files from zephyr/zephyr.elf for board: stm32f4_disco/stm32f407xx
```

161 个编译单元全部通过，生成了 `zephyr.elf`——**这才算真正装好了**。

> 输出末尾如果出现 `BrokenPipeError`，那是 `| head` 导致的（head 读够就关管道），不是错误。

### 使用

```bash
cd ~/zephyrproject
source .venv/bin/activate              # 新终端必须重新激活

# 编译自己的项目
cd myprojects/myapp
west build -b stm32f4_disco .

# 烧录
west flash
```

**工作区规则**：

- ✅ 可以在 `~/zephyrproject` 的**任何子目录**运行 west
- ❌ 在工作区外运行会报 `unknown command "boards"`

建议把所有自己的项目放在工作区内的一个总目录里（如 `myprojects/`），这样 west 开箱即用，不需要额外环境变量。

---

## 六、PlatformIO

### 说明

**PlatformIO 是嵌入式的一体化开发平台**：你声明目标板，它自动下载对应的交叉编译器、框架、库，然后统一构建。支持的芯片从 AVR、ESP32、STM32 到 RISC-V 都有。

优点：**省心**。不用自己折腾工具链版本、不用手写 Makefile。
缺点：**封装层厚**，出问题时排查到底层比较麻烦。

它和前面几种方式的关系：

| 方式 | 控制粒度 | 适合 |
| --- | --- | --- |
| 手写 Makefile + GCC | 完全控制 | 学习、深度定制 |
| PlatformIO | 中等 | 快速原型、多芯片切换 |
| Zephyr | 高（有 OS） | 正经产品 |

### 安装

官方推荐用安装脚本，但 **Fedora 仓库里就有包**，用 dnf 更简单也更安全（不用 `curl | python` 执行远程脚本）：

```bash
sudo dnf install platformio
```

这会连带装好 `python3-platformio` 等依赖。

### 验证

```bash
pio --version
# PlatformIO Core, version 6.1.19
```

**实际编译**——先初始化一个 STM32 项目：

```bash
mkdir ~/pio-test && cd ~/pio-test
pio project init --board bluepill_f103c8
```

这一步会**自动下载** STM32 平台包和工具链（几百 MB，第一次比较慢）：

```
Tool Manager: framework-arduinoststm32@4.30000.0 has been installed!
Tool Manager: tool-scons@4.40801.0 has been installed!
Project has been successfully initialized!
```

写一个闪灯程序：

```bash
cat > src/main.cpp <<'EOF'
#include <Arduino.h>
void setup(){ pinMode(PC13, OUTPUT); }
void loop(){ digitalWrite(PC13, !digitalRead(PC13)); delay(500); }
EOF
```

编译：

```bash
pio run
```

成功输出：

```
Linking .pio/build/bluepill_f103c8/firmware.elf
RAM:   [          ]   4.2% (used 852 bytes from 20480 bytes)
Flash: [=         ]  14.5% (used 9528 bytes from 65536 bytes)
Building .pio/build/bluepill_f103c8/firmware.bin
========================= [SUCCESS] Took 5.52 seconds =========================
```

**烧录**（需要 udev 规则）：

```bash
# 一次性配置
curl -fsSL https://raw.githubusercontent.com/platformio/platformio-core/develop/platformio/assets/system/99-platformio-udev.rules \
  | sudo tee /etc/udev/rules.d/99-platformio-udev.rules
sudo udevadm control --reload-rules && sudo udevadm trigger

# 烧录 + 串口监视
pio run -t upload
pio device monitor
```

---

## 七、STM32CubeMX

### 说明

**STM32CubeMX 是 ST 官方的图形化配置工具**。你在界面上点选引脚、配置时钟树、勾选外设，它生成对应的初始化 C 代码——省去手写寄存器配置的工作量。

它的定位和前面几个不同：**前面是编译/烧录工具，CubeMX 是代码生成器**。它支持生成 STM32CubeIDE、IAR、Keil 三种工程，也能只导出初始化代码用在自定义构建系统里。

### 安装

从 [st.com](https://www.st.com/en/development-tools/stm32cubemx.html) 下载（**需要 ST 账号登录**）：

```
SetupSTM32CubeMX-6.18.1-Lin-x86_64.zip   # 633MB
```

解压得到自解压安装器：

```bash
unzip SetupSTM32CubeMX-6.18.1-Lin-x86_64.zip
# 得到 SetupSTM32CubeMX-6.18_1  (548MB)

chmod 777 SetupSTM32CubeMX-6.18_1
./SetupSTM32CubeMX-6.18_1
```

**几个要点**：

- 这是**图形化安装向导**，没有静默安装参数，必须在有图形环境的机器上运行
- **自带 JRE**（Temurin 21），不需要系统额外装 Java，也不使用系统的 Java
- **不需要 sudo**（除非装到 `/opt`）；装到家目录更省事，避免权限问题

### 验证

```bash
ls ~/STM32CubeMX/
# db  help  jre  olddb  plugins
```

看到 `jre/` 目录说明自带的 Java 运行时也在。

---

## 八、AI 辅助工具配置

### 说明

嵌入式开发里 AI 助手能帮上忙的地方：查寄存器、解释编译错误、生成外设初始化代码、写 Makefile、排查启动问题。

但**默认状态下 AI 并不懂你的芯片和工具链**。需要两样东西：

- **插件（Plugin）**：扩展 Claude Code 本身的能力（LSP、代码审查、上下文检索等）
- **Skills（技能包）**：教 AI 特定领域的知识和工作流

### 插件安装

Claude Code 有插件市场机制：

```bash
# 查看已配置的市场
claude plugin marketplace list

# 更新市场索引
claude plugin marketplace update

# 安装插件
claude plugin install <插件名>
```

我装了 19 个插件，包括：

| 插件 | 作用 |
| --- | --- |
| `rust-analyzer-lsp` | Rust 语言服务器 |
| `clangd-lsp` | C/C++ 语言服务器 |
| `pyright-lsp` | Python 语言服务器 |
| `context7` | 查库文档 |
| `firecrawl` | 网页抓取 |
| `github` | GitHub 集成 |
| `superpowers` | 开发工作流增强 |

> **踩坑**：`github` 插件连的是 `api.githubcopilot.com`，需要 **GitHub Copilot 订阅**才能用。如果只有普通 GitHub 账号，会报：
> ```
> Error POSTing to endpoint: bad request: Authorization header is badly formatted
> ```
> 因为它的配置要求环境变量 `GITHUB_PERSONAL_ACCESS_TOKEN`，而普通 PAT 对 Copilot 端点无效。

### Skills 安装

Skills 是模块化的领域知识包，用 `skills` CLI 管理：

```bash
# 搜索
npx skills find stm32
npx skills find embedded

# 安装（-g 全局，-y 跳过确认）
npx skills add <owner/repo@skill> -g -y

# 更新全部
npx skills update
```

我找到并安装了 **`leokemp223/embed-ai-tool`**（GitHub 933 stars），它提供了 **24 个覆盖嵌入式全流程的 skills**：

| 阶段 | Skills |
| --- | --- |
| 构建 | `build-cmake` / `build-makefile` / `build-keil` / `build-platformio` |
| 烧录 | `flash-jlink` / `flash-openocd` / `flash-keil` / `flash-platformio` |
| 调试 | `debug-jlink` / `debug-gdb-openocd` / `rtos-debug` |
| 外设 | `serial-monitor` / `serial-shell` / `can-debug` / `modbus-debug` |
| 分析 | `memory-analysis` / `static-analysis` |
| 编排 | `workflow` |

**`workflow` 这个最有用**——它能串联多个 skill 完成流水线，比如"编译 → 烧录 → 串口监控"一条命令。

### 验证

```bash
# 插件
claude plugin list

# Skills
ls ~/.claude/skills/          # 全局
ls <项目>/.agents/skills/     # 项目级
```

> **踩坑**：`embed-ai-tool` **不支持全局安装**，必须装在项目级。用 `-g` 会报：
> ```
> PromptScript does not support global skill installation
> ```

---

## 九、实战：Keil 工程迁移到 GCC

前面都是环境配置，这一节是真正的技术活。

### 背景

手上的工程是 **Keil MDK5 + 标准外设库（SPL）** 写的，芯片 STM32F103C8T6。要在 Linux 上用 GCC 编译，面临一个根本障碍：

**Keil 用 ARMASM 汇编器，GCC 用 GNU as，启动文件语法完全不兼容。**

Keil 的启动文件：

```asm
Stack_Size      EQU     0x00000400
                AREA    STACK, NOINIT, READWRITE, ALIGN=3
```

GCC 完全不认识 `EQU` 和 `AREA`。

### 从 Keil 工程里挖配置

好在 `.uvprojx` 是 XML 格式，配置都能抠出来：

```bash
grep -oE "<Define>[^<]*</Define>" Project.uvprojx
# <Define>USE_STDPERIPH_DRIVER</Define>

grep -oE "<IncludePath>[^<]*</IncludePath>" Project.uvprojx
# .\Start;.\Library;.\User;.\System

grep -oE "<FileName>[^<]*\.s</FileName>" Project.uvprojx
# startup_stm32f10x_md.s
```

得到三条关键信息：

- **宏定义**：`USE_STDPERIPH_DRIVER`（还要手工补 `STM32F10X_MD`，因为 F103C8T6 是中容量）
- **头文件路径**：`Start`、`Library`、`User`、`System`
- **启动文件**：`startup_stm32f10x_md.s`（`md` = medium density）

### 手写链接脚本

STM32F103C8T6 有 64K Flash 和 20K RAM：

```ld
ENTRY(Reset_Handler)

MEMORY
{
  FLASH (rx)  : ORIGIN = 0x08000000, LENGTH = 64K
  RAM   (rwx) : ORIGIN = 0x20000000, LENGTH = 20K
}

_estack = ORIGIN(RAM) + LENGTH(RAM);

SECTIONS
{
  .isr_vector :
  {
    . = ALIGN(4);
    KEEP(*(.isr_vector))     /* 中断向量表必须在最前面 */
    . = ALIGN(4);
  } > FLASH

  .text :
  {
    *(.text*)
    *(.rodata*)
    . = ALIGN(4);
    _etext = .;
  } > FLASH

  .data :
  {
    . = ALIGN(4);
    _sdata = .;
    *(.data*)
    . = ALIGN(4);
    _edata = .;
  } > RAM AT> FLASH          /* 加载地址在 FLASH，运行地址在 RAM */
  _sidata = LOADADDR(.data);

  .bss (NOLOAD) :
  {
    . = ALIGN(4);
    _sbss = .;
    *(.bss*)
    *(COMMON)
    . = ALIGN(4);
    _ebss = .;
  } > RAM
}
```

### 手写 GNU 启动文件

```asm
    .syntax unified
    .cpu cortex-m3
    .thumb

.section .isr_vector, "a", %progbits
    .word _estack
    .word Reset_Handler
    .word NMI_Handler
    .word HardFault_Handler
    ; ... 其余中断向量

.section .text
    .thumb
    .global Reset_Handler
    .thumb_func              ; ← 关键，下一节详细说
Reset_Handler:
    ldr sp, =_estack
    bl SystemInit

    ; 把 .data 段从 FLASH 复制到 RAM
    ldr r0, =_sdata
    ldr r1, =_edata
    ldr r2, =_sidata
1:  cmp r0, r1
    bcs 2f
    ldr r3, [r2], #4
    str r3, [r0], #4
    b 1b

2:  ; 清零 .bss 段
    ldr r0, =_sbss
    ldr r1, =_ebss
    movs r3, #0
3:  cmp r0, r1
    bcs 4f
    str r3, [r0], #4
    b 3b

4:  bl main
    b .
```

### Makefile

```makefile
CPU   := -mcpu=cortex-m3 -mthumb
DEFS  := -DSTM32F10X_MD -DUSE_STDPERIPH_DRIVER
CFLAGS := $(CPU) $(DEFS) -IStart -ILibrary -IUser -ISystem \
          -std=c99 -Wall -O1 -g3 -ffunction-sections -fdata-sections
LDFLAGS := $(CPU) -Tgcc/stm32_flash.ld --specs=nosys.specs -Wl,--gc-sections
```

**编译过程中的小坑**：第一次编译报

```
undefined reference to `Default_Handler'
```

因为向量表引用了 `Default_Handler` 但没定义它。补上：

```asm
    .weak Default_Handler
    .type Default_Handler, %function
Default_Handler:
    b .
```

修复后编译通过：

```bash
make -j$(nproc)
#    text    data     bss     dec     hex
#    1304       0       0    1304     518
```

1.3KB 固件，Flash 只用了 2%。

---

## 十、最大的坑：`.thumb_func`

### 症状：烧录成功，但板子毫无反应

```bash
st-flash --reset write build/STM32_test.bin 0x08000000
# Flash written and verified! jolly good!
```

烧录和校验都通过，复位也执行了。但板子**完全没有反应**——按键没反应，灯不亮，连闪一下都没有。

作为对照，把 Keil 原本编译的 `.axf` 转成二进制烧进去：

```bash
arm-none-eabi-objcopy -O binary Objects/Project.axf build/Project_keil.bin
st-flash --reset write build/Project_keil.bin 0x08000000
```

板子正常工作。**说明硬件和接线都没问题，问题出在我编译的固件上。**

### 排查：用十六进制对比向量表

```bash
xxd -e -g4 build/STM32_test.bin | head -1     # GCC 版
xxd -e -g4 build/Project_keil.bin | head -1   # Keil 版
```

对比第二个字（Reset_Handler 地址）：

| 固件 | Reset_Handler | 二进制末位 |
| --- | --- | --- |
| Keil | `0x0800016D` | **1** ✅ |
| GCC | `0x080004C4` | **0** ❌ |

差异就在最低位。

### 原理：Cortex-M 与 Thumb 位

Cortex-M 内核**只能执行 Thumb 指令集**，不支持 ARM 指令集。向量表里每个函数地址的**最低位**被用作模式标志：

- 最低位 = `1` → 进入 Thumb 模式 ✅
- 最低位 = `0` → 进入 ARM 模式 → **Cortex-M 不支持 → 上电立刻 HardFault**

所以我的固件一上电就崩了，`main()` 根本没机会执行，现象就是"完全没反应"。

### 根因：GNU 汇编器的一个陷阱

Keil 的 ARMASM 会自动置位这个标志。而 **GNU 汇编器里，`.thumb` 伪指令只影响指令编码，不改变符号属性**：

```asm
    .thumb              ; 告诉汇编器用 Thumb 指令编码
    .global Reset_Handler
    .thumb_func         ; 这个才给符号打上 Thumb 标记
Reset_Handler:
```

少了 `.thumb_func`，`Reset_Handler` 就被当成普通（ARM 模式）函数，链接器写进向量表时末位就是 0。

### 修复

```asm
    .global Reset_Handler
    .thumb_func          ; 加上这一行
Reset_Handler:
```

重新编译后检查向量表：

```bash
xxd -e -g4 build/STM32_test.bin | head -1
# 00000000: 20005000 080004c5

# Reset_Handler: 0x080004C5 -> 最低位=1 ✅ Thumb
```

末位从 0 变成 1 了。

> **诚实说明**：以上是**软件层面的验证**（向量表二进制确认）。这个修复后的固件**没有在硬件上完成复验**——写作时调试探针反复从 USB 总线掉线（`st-flash` 报 `Couldn't find any ST-Link devices`），一直没能稳定连上。
>
> `.thumb_func` 缺失导致 Cortex-M 上电即 HardFault 是确定的行为，向量表末位的变化也已实测确认。但"板子恢复正常"这句我没有验证过，所以不写。

> **补充**：实际上所有中断服务函数都需要 `.thumb_func`。如果不想逐个加，可以在文件开头用宏批量处理，或者依赖编译器生成的 C 函数——GCC 编 C 代码时会自动加这个标记，**只有手写汇编才需要操心**。

---

## 十一、最终环境总览

所有工具链的实测验证结果：

| 类别 | 工具 | 版本 | 验证方式 |
| --- | --- | --- | --- |
| 主机编译 | gcc / g++ | 16.2.1 | 编译并运行 C 程序 |
| | clang | 22.1.8 | 版本检查 |
| | make / cmake / ninja | 4.4.1 / 4.3.0 / 1.13.2 | 版本检查 |
| | gdb | 17.2 | 版本检查（支持 ARM 目标） |
| 交叉编译 | arm-none-eabi-gcc | 15.2.0 | 编译 Cortex-M3 目标文件 |
| | objcopy / objdump / size | — | 全部存在 |
| 烧录调试 | st-flash / st-info / st-util | 1.8.0 | 探测到 STM32F103C8 |
| | JLinkExe / JLinkGDBServer | V9.78 | 版本检查 |
| | openocd | 0.12.0 | 版本检查 |
| Rust | rustc / cargo | 1.98.1 | 编译 thumbv7m 静态库 |
| | probe-rs | 0.32.0 | 版本检查 |
| | espup | 0.17.1 | ESP32 支持 |
| Zephyr | west | v1.5.0 | — |
| | **Zephyr SDK** | 1.0.1 | **编译 blinky 生成 ELF** |
| PlatformIO | pio | 6.1.19 | **编译 STM32 固件成功** |
| CubeMX | STM32CubeMX | 6.18.1 | 目录检查 |
| AI | Claude Code 插件 | 19 个 | 列表检查 |
| | 嵌入式 skills | 24 个 | 目录检查 |

### 日常开发流程

裸机 + Makefile：

```bash
make -j$(nproc)
make flash-stlink     # 或 make flash-jlink
```

Zephyr：

```bash
cd ~/zephyrproject && source .venv/bin/activate
cd myprojects/myapp && west build -b <board> . && west flash
```

PlatformIO：

```bash
pio run -t upload && pio device monitor
```

---

## 十二、踩坑清单

按"值得记住"排序：

1. **`.thumb_func`** ⭐⭐⭐ — Cortex-M 手写汇编的必修课。缺了它固件会静默失败，所有工具都报成功，只有板子自己知道它崩了。排查用十六进制对比向量表。

2. **Zephyr `setup.sh` 死循环** ⭐⭐ — 非交互运行时 `read` 读到 EOF 会陷入 99% CPU 空转。用 `yes | ./setup.sh` 解决。

3. **SEGGER 官网下载认准带版本号的文件名** ⭐⭐ — 不带版本号的多半是 27KB 的 HTML 协议页。

4. **Fedora 41+ 的 DNF5 改了组名格式** — 要用 `@development-tools` 而不是 `"Development Tools"`。

5. **Zephyr SDK 文件名必须带 `_gnu`** — 少这个后缀就是 404。下载后必须校验大小（约 2GB）。

6. **改用户组后必须重新登录** — `source ~/.zshrc` 不起作用，组权限是登录会话级别的。

7. **Zephyr 的安装顺序** — 先 `west packages pip --install` 再 `west zephyr-export`，顺序反了会报 `jsonschema` 缺失，而且错误信息会被 west 自身的 bug 掩盖。

8. **GitHub Copilot 插件需要订阅** — 普通 PAT 对 `api.githubcopilot.com` 无效。

---

## 结语

整套环境配下来，最耗时的不是安装本身，而是**定位那些"工具都报告成功、但实际不工作"的问题**。

`.thumb_func` 那个坑最典型：编译成功、烧录成功、校验通过——所有环节都是绿的，但板子就是不动。如果不是把两份固件做十六进制对比，很容易往硬件方向排查。

这也是为什么这篇文章里每个环节都强调**实际验证**，而不只是看版本号：**能编译出东西，才算真的装好了。**
