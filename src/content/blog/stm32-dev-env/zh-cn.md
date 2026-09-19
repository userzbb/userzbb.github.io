---
title: 在 Fedora 上折腾 STM32 开发环境
pubDate: 2026-09-19
description: 记录一次 STM32 开发环境的搭建过程：J-Link 官网下载的坑、DNF5 组名变更、从 Keil 工程迁移到 GCC，以及 .thumb_func 导致的固件静默失败
image: "https://www.loliapi.com/acg/"
draft: false
slugId: stm32-dev-env
category: Hardware
---

## 前言

手头有一块 STM32F103C8T6（俗称"蓝莓派"板），一个 ST-Link V2 调试器，一台装了 Fedora 44 的笔记本。目标是配齐一套尽量脱离 Windows/Keil 的开发链路。

这篇文章记录实际做了哪些操作、踩了哪些坑，以及哪些部分**没做成**。

> **说明**：本文分两部分——前半部分（一至三节）是本地实测并验证过的环境安装，后半部分（五、六节）涉及 PlatformIO / Rust / Zephyr 的探索。每节我会标注实际完成到什么程度。

---

## 一、先摸清家底

装任何东西之前，先看看系统里已经有什么。

```bash
for cmd in arm-none-eabi-gcc cmake make st-flash st-info st-util openocd gdb JLinkExe; do
  command -v $cmd >/dev/null 2>&1 && echo "✅ $cmd" || echo "❌ $cmd"
done
```

Fedora 44 上的实际结果：

| 工具 | 状态 |
| --- | --- |
| `arm-none-eabi-gcc` 15.2 | ✅ 已装 |
| `cmake` / `make` | ✅ 已装 |
| `st-flash` / `st-info` / `st-util` | ✅ 已装 |
| `openocd` 0.12.0 | ✅ 已装 |
| `JLinkExe` | ❌ 未装 |

ST-Link 工具链、OpenOCD、ARM 交叉编译器都已经在系统里了，只差 J-Link。

### DNF5 的组名变更

Fedora 41 之后 DNF5 成为默认包管理器，**软件包组的名称从"显示名"改成了"组 ID"**：

```bash
# ❌ 旧语法，在 Fedora 44 上会失败
sudo dnf group install "Development Tools"
# Failed to resolve the transaction:
# No match for argument: Development Tools

# ✅ 新语法，注意 @ 前缀
sudo dnf install @development-tools
```

如果提示 `Group "development-tools" is already installed`，说明基础工具链早就装好了。

需要注意 `cmake`、`gdb`、`clang`、`openocd` 这些**不在**该组内：

```bash
sudo dnf install cmake gdb openocd picocom
```

---

## 二、J-Link：官网下载的坑

SEGGER 的 J-Link 软件没进 Fedora 仓库，只能从官网下载。但下载机制有个陷阱。

### 问题：拿到的是 HTML，不是安装包

直接请求下载 URL：

```bash
wget https://www.segger.com/downloads/jlink/JLink_Linux_x86_64.rpm
ls -lh JLink_Linux_x86_64.rpm
# -rw-r--r-- 1 user user 27K JLink_Linux_x86_64.rpm   ← 只有 27KB
```

检查文件类型：

```bash
file JLink_Linux_x86_64.rpm
# HTML document, ASCII text — 是个网页，不是 RPM
```

原因是 SEGGER 要求你先**在页面上同意许可协议**，才会真正开始传输二进制文件。命令行直接请求拿到的只是那个协议确认页（27KB 的 HTML）。即使用 `curl -d "accept_license_agreement=true"` 尝试绕过，拿到的仍然是同一个 HTML。

### 解决：认准带版本号的文件名

真正的安装包文件名**包含版本号**：

```
JLink_Linux_V978_x86_64.rpm    # 73MB
```

在浏览器打开 [segger.com/downloads/jlink](https://www.segger.com/downloads/jlink/)，找到 **J-Link Software Packages**，同意协议后下载带版本号的那个。注意确认是 `Linux` + `x86_64` + `.rpm` 三项都对，别下成 `.deb`（Debian 系用不了）或 `.tar.gz`。

下载后先验证再加安装：

```bash
file ~/Downloads/JLink_Linux_V978_x86_64.rpm
# RPM v3.0 bin i386/x86_64 jlink-9.78.0-1   ← 这个才是对的

sudo dnf install -y ~/Downloads/JLink_Linux_V978_x86_64.rpm
```

验证：

```bash
JLinkExe
# SEGGER J-Link Commander V9.78 (Compiled Sep 16 2026 16:34:54)
# DLL version V9.78
```

✅ **本节完成并验证**：J-Link V9.78 已安装，`JLinkExe` 位于 `/usr/bin/`。

RPM 包会自动安装 `/etc/udev/rules.d/99-jlink.rules`，普通用户即可访问调试探针，不需要每次 `sudo`。

---

## 三、STM32CubeMX

CubeMX 同样不在 Fedora 仓库，需要从 ST 官网下载（**需要 ST 账号登录**）。

下载到的文件：

```
SetupSTM32CubeMX-6.18.1-Lin-x86_64.zip   # 633MB
```

解压后得到自解压安装器：

```bash
unzip SetupSTM32CubeMX-6.18.1-Lin-x86_64.zip
# 得到 SetupSTM32CubeMX-6.18_1  (548MB)

chmod 777 SetupSTM32CubeMX-6.18_1
./SetupSTM32CubeMX-6.18_1
```

几个要点：

- 这是**图形化安装向导**，没有静默安装参数，必须在有图形环境的机器上运行
- 自带 JRE（Temurin 21），不需要系统额外装 Java
- **不需要 sudo**（除非要装到 `/opt` 这类共享目录）

安装后验证：

```bash
ls ~/STM32CubeMX/
# db  help  jre  olddb  plugins
```

✅ **本节完成并验证**：CubeMX 6.18.1 已安装到 `~/STM32CubeMX`，自带 JRE。

---

## 四、核心：把 Keil 工程迁移到 GCC

前面都是装环境，这一节才是真正的技术活。

手上的工程是 **Keil MDK5 + 标准外设库（SPL）** 写的，芯片 STM32F103C8T6，功能是两个按键控制三颗 LED：

```
STM32_test/
├── Project.uvprojx      # Keil 工程文件
├── User/main.c
├── Start/               # 启动文件 + CMSIS
├── Library/             # SPL 库
└── System/Delay.c
```

### 障碍：启动文件语法不兼容

Keil 用 **ARMASM** 汇编器，启动文件长这样：

```asm
Stack_Size      EQU     0x00000400
                AREA    STACK, NOINIT, READWRITE, ALIGN=3
```

而 `arm-none-eabi-gcc` 用 **GNU as**，语法完全不同，这个文件没法直接编译。

### 从 Keil 工程里挖配置

好在 Keil 的工程文件是 XML，配置都能抠出来：

```bash
grep -oE "<Define>[^<]*</Define>" Project.uvprojx
# <Define>USE_STDPERIPH_DRIVER</Define>

grep -oE "<IncludePath>[^<]*</IncludePath>" Project.uvprojx
# .\Start;.\Library;.\User;.\System

grep -oE "<FileName>[^<]*\.s</FileName>" Project.uvprojx
# startup_stm32f10x_md.s   ← 确定用哪个启动文件
```

得到三条关键信息：

- 宏定义：`USE_STDPERIPH_DRIVER`（还要自己补 `STM32F10X_MD`，因为 F103C8T6 是中容量）
- 头文件路径：`Start`、`Library`、`User`、`System`
- 启动文件：`startup_stm32f10x_md.s`（md = medium density）

### 手写链接脚本

`gcc/stm32_flash.ld` —— F103C8T6 有 64K Flash 和 20K RAM：

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
    KEEP(*(.isr_vector))
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
  } > RAM AT> FLASH
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

`gcc/startup_stm32f10x_md_gcc.s`，包含向量表和复位逻辑：

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
    .thumb_func          ; ← 关键，后面详细说
Reset_Handler:
    ldr sp, =_estack
    bl SystemInit
    ; 复制 .data 段到 RAM
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

### 编译过程中的小坑

第一次编译报错：

```
undefined reference to `Default_Handler'
```

因为我写的向量表引用了 `Default_Handler`，但没定义它。补上即可：

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

## 五、最大的坑：`.thumb_func`

### 症状：烧录成功，但板子毫无反应

```bash
st-flash --reset write build/STM32_test.bin 0x08000000
# Flash written and verified! jolly good!
```

烧录和校验都通过，复位也执行了。但板子**完全没有反应**——按键没反应，灯不亮，连闪一下都没有。

作为对照，把 Keil 原本编译好的 `.axf` 转成二进制烧进去：

```bash
arm-none-eabi-objcopy -O binary Objects/Project.axf build/Project_keil.bin
st-flash --reset write build/Project_keil.bin 0x08000000
# Flash written and verified!
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

Cortex-M 内核**只能执行 Thumb 指令集**。向量表里每个函数地址的**最低位**被用作模式标志：

- 最低位 = `1` → 进入 Thumb 模式 ✅
- 最低位 = `0` → 进入 ARM 模式 → **Cortex-M 不支持 → 上电立刻 HardFault**

所以我的固件一上电就崩了，`main()` 根本没机会执行，现象就是"完全没反应"。

### 根因：GNU 汇编器的坑

Keil 的 ARMASM 会自动置位这个标志。而 **GNU 汇编器里，`.thumb` 伪指令只影响指令编码，不改变符号属性**：

```asm
    .thumb              ; 告诉汇编器用 Thumb 指令编码
    .global Reset_Handler
    .thumb_func         ; 这个才给符号打上 Thumb 标记
Reset_Handler:
```

少了 `.thumb_func`，`Reset_Handler` 就被当成普通（ARM 模式）函数，链接器写进向量表时末位就是 0。

### 修复与验证

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

末位从 0 变成 1 了，链接器现在会正确标记 `Reset_Handler`。

> **诚实说明**：以上是**软件层面的验证**（向量表二进制确认）。这个修复后的固件**没有在硬件上完成复验**——写作时调试探针反复从 USB 总线掉线（`st-flash` 报 `Couldn't find any ST-Link devices`），一直没能稳定连上。`.thumb_func` 缺失导致 Cortex-M 上电即 HardFault 是确定的行为，向量表末位的变化也已实测确认，但"板子恢复正常"这句我没有验证过，所以不写。

---

## 六、其他工具链的探索（部分未完成）

以下是我和 AI 助手讨论过的其他路线，**完成度各不相同**，如实记录。

### PlatformIO —— 只配了权限，没装本体 ⚠️

讨论的安装流程是：

```bash
sudo dnf install python3-pip curl git
curl -fsSL https://raw.githubusercontent.com/platformio/platformio-core-installer/master/get-platformio.py -o get-platformio.py
python3 get-platformio.py
```

实际只完成了**权限配置**部分：

```bash
# udev 规则（已完成）
curl -fsSL https://raw.githubusercontent.com/platformio/platformio-core/develop/platformio/assets/system/99-platformio-udev.rules \
  | sudo tee /etc/udev/rules.d/99-platformio-udev.rules
sudo udevadm control --reload-rules
sudo udevadm trigger

# 加入 dialout 组（已完成）
sudo usermod -a -G dialout $USER
```

**但 `pio` 本体从未装上**——`~/.platformio` 目录不存在，`which pio` 也找不到命令。所以这一节只能算"准备了权限"，不算装好了。

#### dialout 组的坑：必须重新登录

```bash
sudo usermod -a -G dialout $USER
groups    # ⚠️ 这里看不到 dialout！
```

**这是正常现象**。`usermod` 修改的是账户的组归属，但当前已登录的 shell 会话不会自动刷新。`source ~/.zshrc` **也没用**——组权限是**登录会话级别**的。

必须**完全退出终端重新登录**：

```bash
groups
# zizimiku wheel dialout kvm docker  ← 重新登录后才对
```

### Rust 嵌入式 —— 已装好 ✅

```bash
# 系统依赖
sudo dnf install libusbx-devel libftdi-devel libudev-devel openssl-devel perl gcc

# Rust 工具链
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env

# 烧录调试工具
cargo install probe-rs-tools
cargo install flip-link
rustup component add llvm-tools
cargo install cargo-binutils
```

probe-rs 的 udev 规则：

```bash
curl -o /tmp/69-probe-rs.rules https://probe.rs/files/69-probe-rs.rules
sudo cp /tmp/69-probe-rs.rules /etc/udev/rules.d/
sudo udevadm control --reload
sudo udevadm trigger
```

验证结果：

```bash
rustc --version      # rustc 1.98.1 (48a229cea 2026-09-01)
cargo --version      # cargo 1.98.1
probe-rs --version   # probe-rs 0.32.0
```

不同内核需要不同的编译目标，等确定芯片型号后再加：

```bash
rustup target add thumbv7m-none-eabi        # Cortex-M3（STM32F103）
rustup target add thumbv6m-none-eabi        # Cortex-M0/M0+（RP2040）
rustup target add thumbv7em-none-eabihf     # Cortex-M4F/M7F
```

### Zephyr RTOS —— 已装好 ✅

Fedora 仓库里**没有**现成的 `zephyr` 包，得按官方文档装依赖 + 手动配 SDK。

```bash
# 注意 DNF5 的组名格式
sudo dnf install @development-tools @c-development

sudo dnf install git cmake ninja-build gperf ccache dfu-util dtc wget \
  python3-pip python3-tkinter xz file glibc-devel.i686 libstdc++-devel.i686
```

安装脚本如果遇到 SSL 证书问题：

```bash
curl -O https://cese.ewi.tudelft.nl/real-time-systems/zephyr-install-fedora.zip
# curl: (60) SSL certificate problem: unable to get local issuer certificate
```

该站点的根证书不在 Fedora 信任列表里。确认站点可信的话可以临时跳过，或者改用 `wget`：

```bash
curl -k -O https://cese.ewi.tudelft.nl/real-time-systems/zephyr-install-fedora.zip
```

#### 安装顺序的坑

脚本跑完如果出现 `ModuleNotFoundError: No module named 'jsonschema'`，是**安装顺序错了**。Zephyr 4.0 之后必须先装 Python 依赖再 export：

```bash
cd ~/zephyrproject
source .venv/bin/activate
west packages pip --install    # 先装依赖
west zephyr-export             # 再 export
```

> 如果错误信息里还跟着 `AttributeError: 'NoneType' object has no attribute 'err'`，那是 west 自身的 bug——它报告错误时又抛了个新异常，把真正的错误盖住了。真正的错误就是上面那个 `jsonschema` 缺失。

#### west 工作区机制

`west` 命令必须在**工作区内**运行。工作区根由隐藏的 `.west` 目录标识，west 会从当前目录逐级向上查找。

```
~/zephyrproject/
├── .west/              # 工作区标识
├── zephyr/             # Zephyr 源码
├── modules/
└── myprojects/         # ← 自己的项目放这里
```

- ✅ 可以在 `~/zephyrproject` 的**任何子目录**里运行 `west build`
- ❌ 在 `~/Downloads` 等工作区外运行会报 `unknown command "boards"`

验证安装：

```bash
west --version     # West version: v1.5.0
west boards | head
# opi_zero
# opi_zero2w
# w5500_evb_pico
# ...
```

> `west boards | head` 输出末尾的 `BrokenPipeError` 是正常的——`head` 读够行数就关闭了管道，west 还在写就撞上"管道破裂"。不是错误。

---

## 七、最终的工具链

| 环节 | 工具 | 状态 |
| --- | --- | --- |
| 编译 | `arm-none-eabi-gcc` + `make` | ✅ |
| 烧录（ST-Link） | `st-flash` | ✅ |
| 烧录（J-Link） | `JLinkExe` V9.78 | ✅ |
| 调试 | `openocd` / `st-util` / `JLinkGDBServer` | ✅ |
| 项目生成 | STM32CubeMX 6.18.1 | ✅ |
| Rust 嵌入式 | rustc 1.98.1 / probe-rs 0.32.0 | ✅ |
| Zephyr | west v1.5.0 | ✅ |
| PlatformIO | pio 本体 | ❌ 未装 |

日常开发流程：

```bash
make -j$(nproc)
make flash-stlink    # 或 make flash-jlink
```

### 关于 AI 辅助

顺带试了把嵌入式 skills 装进 AI 编程助手：

```bash
npx skills find stm32
npx skills add leokemp223/embed-ai-tool
```

[embed-ai-tool](https://github.com/leokemp223/embed-ai-tool)（933 stars）提供了 24 个覆盖全流程的 skills——`build-cmake`、`flash-jlink`、`debug-jlink`、`serial-monitor`、`workflow` 等。

> **注意**：这个包**不支持全局安装**（`-g` 参数会报 `PromptScript does not support global skill installation`），必须装在项目级。

---

## 总结

值得记住的几点：

1. **SEGGER 官网下载要认准带版本号的文件名**——不带版本号的多半是 27KB 的 HTML 协议页
2. **Fedora 41+ 的 DNF5 改了组名格式**，要用 `@development-tools` 而不是 `"Development Tools"`
3. **改用户组后必须重新登录**，`source ~/.zshrc` 不起作用
4. **`.thumb_func` 是 Cortex-M 手写汇编的必修课**——缺了它固件会静默失败，烧录校验全过但板子毫无反应
5. **排查这类问题要用十六进制对比**——直接看向量表末位比瞎猜快得多

整个过程中最耗时的不是装环境，而是定位那个 `.thumb_func` 问题：所有工具都报告"成功"，只有板子自己知道它崩了。
