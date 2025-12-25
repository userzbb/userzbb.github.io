---
title: Verilog基础语法
published: 2025-11-25
description: "verilog 入门语法"
image: "https://www.loliapi.com/acg/"
tags: ["verilog", "hardware"]
category: Hardware
draft: false
---

## 逻辑门
XOR = Exclusive OR（异或）

口诀：相同为0，不同为1

`assign out = ~{ ... } ^ { ... };` 这个写法是**完全合法**的，原因在于Verilog的**运算符优先级**规则。让我详细解释：

## verilog grama/syntax
### comment（注释）
```verilog
/* ===========
     多行注释
     多行注释
   =========== */
always @(*) begin
    // 这里是单行注释
    if (a) 
        b = 1'b1;   // 这里也是单行注释
    else
        b = 1'b0;
    /* 多行注释也可以写在一行里 */
end
```

### 数值系统
- `0` `1` `x/X` `z/Z`
- `x` 表示电平未知
- `z` 表示高阻态
- 关于高阻态，你可以参考[这里](https://en.wikipedia.org/wiki/High_impedance)获取更多信息。

### 变量 
- `wire` default_value:`x`
- `reg`  default_value: `z`
- 向量[7:0]     //  WIDTH = 8

### 关于变量的声明
```verilog
wire [4:0] my_vec;      // 一个位宽为 5 的向量，范围为 0 ~ 4

// 假定 my_vec 此时的值是 5'b01011

my_vec[0]       // 表示最低位，值为 1'b1
my_vec[3:2]     // 表示第四、三位，值为 2'b10
my_vec[4]       // 表示最高位，值为 1'b0
```

Verilog 中也是存在数组的概念的。你可以按照如下的格式初始化一个数组：
```toml
wire/reg [width-1:0] <var_name> [0:width-1];
```
例如：
```verilog
reg [7:0] my_regs [0:31];
```

### 连续赋值：`assign`
连续赋值语句用于对 wire 型变量进行赋值。其通用格式如下：
```verilog
assign LHS = RHS;
```
LHS（left hand side）指赋值操作的左侧（左值），RHS（right hand side）指赋值操作的右侧（右值）。下面是一个简单的示例：
```verilog
wire Cout, A, B;
assign Cout = A & B;

/* 
Verilog 还提供了另一种对 wire 型赋值的简单方法，即在 wire 型变量声明的时候同时对其赋值。例如，下面的赋值方式和上面赋值例子的效果是一致的。
*/

wire A, B;
wire Cout = A & B;

```

这里有一些语法细节：
- LHS 必须是一个 wire 型变量，而不能是 reg 类型的变量；
- RHS 的类型没有要求；
- **只要 RHS 表达式的操作数有事件发生（值的变化）时，RHS 就会立刻重新计算，同时赋值给 LHS**。这体现了 Verilog 语言的硬件特征：assign 语句实际上是构建了一段门电路，会长期存在于数字系统之中。

### 过程赋值 `initial`/`always`
`initial` 与 `always`。这两种语句不可嵌套使用，彼此间并行执行：
```verilog
/*
每个 initial 语句或 always 语句都会产生一个独立的控制流，执行时间都是从 0 时刻开始。二者的区别在于 initial 仅在 0 时刻开始执行一次内部的语句，而 always 语句块从 0 时刻开始执行，当执行完最后一条语句后，便再次执行语句块中的第一条语句，如此循环反复。*/

// 变量 a、b、c、d 会被同时赋值。

reg [3:0] a, b, c, d;
always begin
    a = 1;
    a = 2;
end

initial begin
    b = 3;
    b = 4;
end

initial c = 5;

always d = 6;
```

没有任何条件限制的 `always` 并不是那么好用。因此，always 引入了**敏感变量**的概念。我们常常以下面的格式使用 `always` 语句：
```toml
always @(敏感变量列表) 过程语句
```
敏感变量就是触发 `always` 块内部语句的条件。加入敏感变量后，`always` 语句仅在列表中的变量发生变化时才执行内部的过程语句。
```verilog
// 每当 a 或 b 的值发生变化时就执行内部的语句
always @(a or b) begin
    [过程语句]
end

/*
有的时候，敏感列表过多，一个一个加入太麻烦，且容易遗漏。为了解决这个问题，Verilog 2001 标准允许使用符号 `*` 在敏感列表中表示缺省，编译器会根据 always 块内部的内容自动识别敏感变量。
*/

// 例如，先前的例子可以写为：
reg Cout;
wire A, B;
always @(*) begin
    Cout = A & B;
end

/* 
使用 `posedge` 和 `negedge` 关键字将电平变化作为敏感变量。其中 `posedge` 对应上升沿，`negedge` 对应下降沿。 
*/

reg Cout;
wire A, B, clk;
always @(posedge clk) begin
    Cout <= A & B;
end

```

### 阻塞赋值与非阻塞赋值
- 阻塞赋值  `=`  // 顺序执行
- 非阻塞赋值 `<=`    // 并行执行
```verilog
reg temp;
always @(posedge clk) begin
    temp = a;
    a = b;
    b = temp;
end

// 无需定义中间变量temp  
// 并行执行，这两条语句不会有先后的差异，也就实现了值的交换。
always @(posedge clk) begin
    a <= b;
    b <= a;
end
```

### 条件语句 `if`/`case`
- `if`-`else` 语句的例子
```verilog
/*
当时钟 clk 的上升沿到来时，我们首先判断 `a != 0` 是否成立。如果成立，则将 b 的值赋值给 o；否则将 s 的值赋值给 o。
*/

module test(
    input wire a, b, clk,
    output reg o
);
    wire s;
    assign s = a & b;
    always @(posedge clk) begin
        if (a)
            o <= b;
        else
            o <= s;
    end
endmodule
```
---
- `case` 语句
`case` 和 `endcase` 两个关键字必须成对出现。与 if-else 语句一样，case 语句出现在 always 的中，而不能在模块内部单独出现。其用法如下：
```verilog
case（case 表达式）
    case 条目表达式 1：过程语句
    case 条目表达式 2：过程语句
    ...
    [default:过程语句]
endcase
```

```verilog
module test(
    input wire a, b, clk,
    output reg o
);
    wire s;
    assign s = a & b;
    always @(posedge clk) begin
        case (a)
            1'b0: o <= s;
            1'b1: o <= b;
        endcase
    end
endmodule
```

### 模块结构

---
**端口**是模块与外界交互的接口。
根据端口的方向，端口类型有 3 种： 
- 输入端口（input）
- 输出端口（output）
- 和双向端口（inout）
```verilog
/*最常用的写法*/
module FA (
// 声明端口
    input           a, b, cin, // 默认为wire
    output          cout,  //wire
    output reg      s    //指定reg 
);

//也可以这样写
module FA (
    a, b, cin, cout, s
);
// 端口类型声明
input a, b, cin;    // 可以声明多个
output cout;
output s;   // 也可以只声明一个

// 数据类型声明
wire a, b, cin;
wire cout;
reg s;

/*
在 Verilog 中，wire 型为默认数据类型，因此当端口为 wire 型时，不用再次声明端口类型为 wire；但是当端口为 reg 型时，对应的 reg 声明不可省略。基于此，上面的例子可以简化为：
*/
module FA (
    a, b, cin, cout, s
);
// 端口类型声明
input a, b, cin;
output cout;
output s;

// 数据类型声明
reg s;

/*为了进一步简化代码，端口类型和数据类型可以同时指定*/
module FA (
    a, b, cin, cout, s
);
// 端口类型与数据声明
input a, b, cin;
output cout;
output reg s;

/*最终化简形式为第一种*/
```
- **第一**：每个模块都是由关键字 `module` 开头，由 `endmodule` 结束。

- **第二**：每个模块都应该有一个唯一的模块名，模块名不能使用 Verilog 语法的关键字。

- **第三**：模块名后面的括号内是对输入输出信号的定义，除后面实验中要讲到的仿真文件外，任何能实际工作的模块都应该有输入和输出信号。

- **第四**：模块主体部分只能出现四类语句（仿真文件中会用到的 initial 语句等暂不考虑）：内部信号定义、模块实例化、assign 语句、always 语句，每类语句的数量与顺序不受限制，但要遵循变量先定义后使用的原则。

### 模块实例化
```verilog
module FA (
    input [7:0]         a, b,
    input               cin,
    output reg [7:0]    s,
    output              cout
);

wire [7:0] num1, num2, sum;
wire cin, cout;

/*基于位置的端口关联*/
FA fa (num1, num2, cin, sum, cout);

/*基于名字的端口关联*/
FA fa (.a(num1), .b(num2), .s(sum), .cin(cin), .cout(cout));

FA fa (
    .a(num1),
    .b(num2),
    .s(sum),
    .cin(cin),
    .cout(cout)
);
```

### 参数传递
模块例化功能大大提升了 Verilog 的代码复用能力。假定我们有如下所示的模块代码：
```verilog
/*
该模块接收三个 1bit 位宽数据的输入，输出一个 1bit 位宽的数据。但如果现在顶层模块的输入 num1、num2 是两个 4bits 数据，我们应该怎么办呢？自然，使用四个选择器分别选择每一位是一个可行的方案。
*/
module MUX2 (
    input           num1, num2,
    input           sel,
    output reg      ans
); 
always @(*) begin
    if (sel)
        ans = num1;
    else
        ans = num2;
end
endmodule

/*
这种方法固然可行，但在数据位宽较大时便会十分繁琐。一种新的思路是：在编写子模块时并不预先指定位宽，而是在例化的时候根据需要确定位宽。此时我们可以使用 Verilog 的带参数例化功能：模块声明时使用 `parameter` 关键字指定参数，例化时将新的参数值写入模块例化语句，以此来改写子模块的参数值。
*/
/*
此时，子模块中的变量 num1、num2 和 ans 都是位宽为 WIDTH 的信号变量。参数 WIDTH 的默认值为 8。
*/
module MUX2 
# (
    parameter                   WIDTH = 8
)(
    input [WIDTH-1: 0]          num1, num2,
    input                       sel,
    output reg [WIDTH-1: 0]     ans
); 
always @(*) begin
    if (sel)
        ans = num1;
    else
        ans = num2;
end
endmodule

// ......
wire [3:0] num1, num2, ans;
wire sel;

MUX2 #(4) mux (
    .num1(num1),
    .num2(num2),
    .sel(sel),
    .ans(ans)
);
```

###  硬件层面的并行
![[Pasted image 20251225223530.png]]
![[Pasted image 20251225223547.png]]

```verilog
/*
不同 always 块和 initial 块之间是并行执行的，而同一个模块里的 always 语句和 initial 语句执行顺序与其在模块中的位置无关。
always 块和 initial 块内的过程赋值语句可以是阻塞赋值 `=`，也可以是非阻塞赋值 `<=`。
其中阻塞赋值用于组合逻辑电路，为串行执行；非阻塞赋值用于时序逻辑电路，为并行执行。
*/

/*
然而，在同一个 always 块里的阻塞赋值语句也可以是并行执行的，
只要其内部的信号不会产生冲突。我们来看下面这段代码
*/

/*
`always @(*)` 语句块，表明当 `sel`、`out1` 或 `out2` 任何一个发生变化时，就执行内部的语句。不难发现，`out1` 和 `out2` 的逻辑是依赖于 `sel` 信号的，因此我们只需要关注 `sel` 信号的变化即可。
*/

module Test (
    input                       sel,
    output reg [1:0]            out1,
    output reg [1:0]            out2
);
always @(*) begin
    // Part 1
    if (sel)
        out1 = 2'd2;
    else
        out1 = 2'd0;

    // Part 2
    if (sel)
        out2 = 2'd2;
    else
        out2 = 2'd1;
end
endmodule


/*
什么时候 Verilog 中的阻塞赋值会串行执行呢？答案是：在信号出现依赖与冲突时，自然就会串行执行了。例如下面这段 Verilog 代码：
*/
module Test (
    input [1:0]             num1,
    input [1:0]             num2,
    input [1:0]             sel,
    output reg [1:0]        out
);
always @(*) begin
    out = 0;
    // Part 1
    if (sel[0])
        out = num1;

    // Part 2
    if (sel[1])
        out = num2;
end
endmodule

/*
我们将上面的讨论结果总结如下：如果两个 if 的赋值对象没有冲突，那么两个 if 描述的多选器是并行的，否则是串行的。

当然，我们也可以使用 if-else-if 语句实现上面的结构，而 else-if 将显式指出多选器的串行执行顺序。
*/
module Test (
    input [1:0]             num1,
    input [1:0]             num2,
    input [1:0]             sel,
    output reg [1:0]        out
);
always @(*) begin
    out = 0;
    if (sel[0])
        out = num1;
    else if (sel[1])    // <- 串行执行
        out = num2;
end
endmodule

```

### 避免锁存器
在 Verilog 中，一个变量如果声明为寄存器类型（reg），它既可以被综合成组合逻辑的导线，也可能被综合成时序逻辑中的寄存器或锁存器。
在使用 `always @(*)` 语句时，我们会希望变量被综合成导线，但是有时候由于代码书写问题，它会被综合成我们不期望的锁存器结构，进而对电路带来危害。主要有：
- 电路的输出状态可能发生多次变化，增加了下一级电路的不确定性；
- 在大部分 FPGA 的设计里，锁存器结构会消耗更多的电路资源；
- 锁存器导致电路不能按照我们预期的方式工作，在调试时带来额外的问题。
因此，我们在代码书写时需要格外注意，应当避免出现锁存器。一个简单且好记的原则是：
**组合逻辑中不应出现记忆电路，即电路不能保存自身的状态。违反了这一原则的组合逻辑电路往往就会产生锁存器**。

首先，我们补充介绍了 Verilog 中语句的串行与并行执行的情况，强调了硬件描述语言与硬件结构的对应关系。
接下来，我们介绍了 reg 型变量的多种电路形式、锁存器的危害与避免方式。为避免锁存器的产生，在组合逻辑设计中，我们需要注意以下几点：
- if-else 或 case 语句的结构一定要完整；
- 不要将赋值信号放在赋值源头或条件判断中；
- 养成使用默认赋值的好习惯。

#### if-else 逻辑缺陷
```verilog
module Latch1(
    input               data,
    input               en,
    output reg          q
);

always @(*) begin
    if (en) 
        q = data;
end
endmodule
/*
我们来分析一下。当 en 信号为 1 时，q 会被赋值为 data 的值；当 en 信号不变时，由于 always 语句里的 if 缺少对应的 else 分支，因此编译器默认 else 的分支下寄存器 q 的值保持**不变**。此时电路应当具有存储数据的功能，所以变量 q 会被综合成锁存器结构。
*/

/*
避免此类锁存器的方法主要有 2 种，一种是补全 if-else 结构，另一种是对信号赋初值。例如，上面的代码可以改为以下两种形式：
*/
// 补全 if-else 分支结构    
always @(*) begin
    if (en)  
        q = data;
    else
        q = 1'b0;
end

// 为 q 赋初值
always @(*) begin
    q = 1'b0;
    if (en)
        q = data;
end

/*
在时序逻辑中，不完整的 if-else 结构不会产生锁存器，例如下面这段 Verilog 代码：
*/
/*
这是因为，时序逻辑中的变量 q 会被综合生成寄存器，而寄存器是具有存储功能的，其数值仅在时钟的边沿到来时才会改变，这正是寄存器的特性。
*/
module module_ff(
    input           clk,
    input           en,
    input           data, 
    output reg      q
);
always @(posedge clk) begin
    if (en)
        q <= data;
end
endmodule

/*
另外一种比较隐蔽的情况是：当条件语句中有很多条赋值语句时，每个分支条件下的逻辑不完整也是会产生锁存器的。例如：
*/
module Latch2(
    input               data1,
    input               data2,
    input               en,
    output reg          q1,
    output reg          q2
);

always @(*) begin
    if (en)
        q1 = data1;
    else
        q2 = data2;
end
endmodule


/*
这段代码看起来 if 和 else 都有了，但 if 部分里没有对 q2 赋值，else 部分里没有对 q1 赋值。从每个信号各自的的逻辑来看，这实际上也相当于是 if-else 结构不完整，相关信号缺少在其他条件下的赋值行为。
这种情况也可以通过补充完整赋值语句或赋初值来避免产生锁存器。例如：
*/
// 补全 if-else 分支结构    
always @(*) begin
    if (en)  begin
        q1 = data1;
        q2 = 1'b0;
    end
    else begin
        q1 = 1'b0;
        q2 = data2;
    end
end

// 为 q1、q2 赋初值
always @(*) begin
    q1 = 1'b0;
    q2 = 1'b0;
    if (en)
        q1 = data1;
    else
        q2 = data2;
end

```

#### case 逻辑缺陷
```verilog
/*
case 语句产生锁存器的原理几乎和 if 语句一致。在组合逻辑中，当 case 选项列表不全且没有加 default 关键字，或有多个赋值语句不完整时，也会产生锁存器。例如：
*/
/*
这段代码会产生锁存器。因为在 sel 为 2'b10、2'b11 时，case 语句中并没有给出 q 的赋值结果，进而会被默认为保持原先的值不变。
*/
module Latch3(
    input               data1,
    input               data2,
    input [1:0]         sel,
    output reg          q
);

always @(*) begin
    case(sel)
        2'b00:  q = data1;
        2'b01:  q = data2;
    endcase
end
endmodule

//下面这段代码会产生锁存器吗？
always @(*) begin
    case(sel)
        1'b0:  q = data1;
        1'b1:  q = data2;
    endcase
end

/*
同样地，消除此种锁存器的方法也是 2 种：将 case 选项列表补充完整，或对信号赋初值。补充完整 case 选项列表时，可以罗列所有的选项结果，也可以用 default 关键字来代替其他选项结果。

例如，上面的 always 语句有以下 3 种修改方式。
*/
// 使用 default 补充逻辑
always @(*) begin
    case(sel)
        2'b00:    q = data1;
        2'b01:    q = data2;
        default:  q = 1'b0;
    endcase
end

// 枚举补充逻辑
always @(*) begin
    case(sel)
        2'b00:  q = data1;
        2'b01:  q = data2;
        2'b10, 2'b11:  
                q = 1'b0;
    endcase
end

// 使用默认赋值
always @(*) begin
    q = 1'b0;
    case(sel)
        2'b00:  q = data1;
        2'b01:  q = data2;
    endcase
end


/*
更特别地，当 if 和 case 组合起来时，我们往往就容易出现逻辑遗漏。例如下面这段 Verilog 代码：
*/
reg [3:0] value;
always @(*) begin
    case (state)
        2'b00: value = 1;
        2'b01: begin
            if (signal)
                value = 2;
        end
        2'b10: begin
            if (signal)
                value = 3;
        end
        default: value = 0;
    endcase
end

/*
这段代码中尽管有 endcase 语句，但依然会产生锁存器，因为 case 分支中的 if 逻辑不完整。一种比较好的策略是：在 always 语句块的一开始就进行默认赋值。这样可以避免潜在的逻辑不完整风险。
*/
reg [3:0] value;
always @(*) begin
    value = 0;
    case (state)
        2'b00: value = 1;
        2'b01: begin
            if (signal)
                value = 2;
        end
        2'b10: begin
            if (signal)
                value = 3;
        end
        default: value = 0;
    endcase
end
```

#### 自赋值与判断
```verilog
/*
在组合逻辑中，如果一个信号的赋值源头有其信号本身，或者判断条件中有其信号本身的逻辑，也会产生锁存器。因为此时的信号也需要具有存储功能，能够获得先前时刻该信号的数值。此类问题在 if 语句、case 语句、问号表达式中都可能出现，例如
*/
/*
避免此类锁存器的方法只有一种，就是在组合逻辑中避免这种写法。时刻提醒自己：**信号不要给信号自己赋值，且不要用赋值信号本身参与判断条件逻辑**
*/

//自己作为判断条件
reg a, b;
always @(*) begin
    if (a & b)  
        a = 1'b1;   // a 会生成锁存器
    else 
        a = 1'b0;
end

//自增？
reg a, en;
always @(*) begin
    if (en)
        a = a + 1;  // a 会生成锁存器
    else
        a = 1'b0;
end

//条件表达式也要小心
wire d, sel;
assign d = (sel2 && d) ? 1'b0 : 1'b1;  // d 会生成锁存器

```
```verilog
/*
如果不要求下一时刻信号立刻输出，我们可以将信号进行一个时钟周期的延时后再接入组合逻辑。例如：
*/

//自己作为判断条件
reg a, b;
always @(*) begin
    if (a & b)  
        a = 1'b1;   // a 会生成锁存器
    else 
        a = 1'b0;
end

//上面这段代码可以更改为：
//增加一个周期的延时
reg a, b;
reg a_r;

always @(posedge clk)
    a_r <= a;

always @(*) begin
    if (a_r & b)
        a = 1'b1;
    else 
        a = 1'b0;
end
//这段代码不会生成锁存器，因为我们人为引入了 a_r 作为寄存变量，用于存储变量 a 先前的值。


```

[[编写测试文件]]


