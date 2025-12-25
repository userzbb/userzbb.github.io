---
title: Rust中的所有权(ownership)
published: 2025-11-25
description: "Rust 程序设计语言 第四章内容 认识所有权"
image: https://upload.wikimedia.org/wikipedia/commons/thumb/2/20/Rustacean-orig-noshadow.svg/768px-Rustacean-orig-noshadow.svg.png?20220509231635
tags: ["rust"]
category: Rust
draft: false
---

- 所有权（系统）是 Rust 最为与众不同的特性，对语言的其他部分有着深刻含义。
- 它让 Rust 无需垃圾回收（garbage collector）即可保障内存安全，因此理解 Rust 中所有权如何工作是十分重要的。
- 本章，我们将讲到所有权以及相关功能：借用（borrowing）、slice 以及 Rust 如何在内存中布局数据。

## [什么是所有权？](https://kaisery.github.io/trpl-zh-cn/ch04-01-what-is-ownership.html#%E4%BB%80%E4%B9%88%E6%98%AF%E6%89%80%E6%9C%89%E6%9D%83)

- **所有权**（_ownership_）是 Rust 用于如何管理内存的一组规则。
- 所有程序都必须管理其运行时使用计算机内存的方式。一些语言中具有垃圾回收机制，在程序运行时有规律地寻找不再使用的内存；在另一些语言中，程序员必须亲自分配和释放内存。
- Rust 则选择了第三种方式：通过所有权系统管理内存，编译器在编译时会根据一系列的规则进行检查。如果违反了任何这些规则，程序都不能编译。在运行时，所有权系统的任何功能都不会减慢程序的运行。

## [栈（Stack）与堆（Heap）](https://kaisery.github.io/trpl-zh-cn/ch04-01-what-is-ownership.html#%E6%A0%88stack%E4%B8%8E%E5%A0%86heap)

- 栈和堆都是代码在运行时可供使用的内存，但是它们的结构不同。
- 栈以放入值的顺序存储值并以相反顺序取出值。这也被称作  **后进先出**（_last in, first out_）。
- 想象一下一叠盘子：当增加更多盘子时，把它们放在盘子堆的顶部，当需要盘子时，也从顶部拿走。不能从中间也不能从底部增加或拿走盘子！增加数据叫做  **入栈**（_pushing onto the stack_），而移出数据叫做  **出栈**（_popping off the stack_）。
- 栈中的所有数据都必须占用已知且固定的大小。在编译时大小未知或大小可能变化的数据，要改为存储在堆上。
- 堆是缺乏组织的：当向堆放入数据时，你要请求一定大小的空间。内存分配器（memory allocator）在堆的某处找到一块足够大的空位，把它标记为已使用，并返回一个表示该位置地址的  **指针**（_pointer_）。
- 这个过程称作  **在堆上分配内存**（_allocating on the heap_），有时简称为 “分配”（allocating）。（将数据推入栈中并不被认为是分配）。因为指向放入堆中数据的指针是已知的并且大小是固定的，你可以将该指针存储在栈上，不过当需要实际数据时，必须访问指针。
- 想象一下去餐馆就座吃饭。当进入时，你说明有几个人，餐馆员工会找到一个够大的空桌子并领你们过去。如果有人来迟了，他们也可以通过询问来找到你们坐在哪。

- 入栈比在堆上分配内存要快，因为（入栈时）分配器无需为存储新数据去搜索内存空间；其位置总是在栈顶。
- 相比之下，在堆上分配内存则需要更多的工作，这是因为分配器必须首先找到一块足够存放数据的内存空间，并接着做一些记录为下一次分配做准备。

- 访问堆上的数据比访问栈上的数据慢，因为必须通过指针来访问。现代处理器在内存中跳转越少就越快。
- 继续类比，假设有一个服务员在餐厅里处理多个桌子的点菜。在一个桌子报完所有菜后再移动到下一个桌子是最有效率的。从桌子 A 听一个菜，接着桌子 B 听一个菜，然后再桌子 A，然后再桌子 B 这样的流程会更加缓慢。
- 出于同样原因，处理器在处理的数据彼此较近的时候（比如在栈上）比较远的时候（比如可能在堆上）更高效。

- 当你的代码调用一个函数时，传递给函数的值（包括可能指向堆上数据的指针）和函数的局部变量被压入栈中。当函数结束时，这些值被移出栈。
-

- 跟踪哪部分代码正在使用堆上的哪些数据，最大限度的减少堆上的重复数据的数量，以及清理堆上不再使用的数据确保不会耗尽空间，这些问题正是所有权系统要处理的。

### [`Copy` trait 与实现条件](https://kaisery.github.io/trpl-zh-cn/ch04-01-what-is-ownership.html#%E5%8F%AA%E5%9C%A8%E6%A0%88%E4%B8%8A%E7%9A%84%E6%95%B0%E6%8D%AE%E6%8B%B7%E8%B4%9D)

当类型完全位于栈上且其大小在编译期已知，赋值会执行按位拷贝（廉价），无需“移动”原变量——因此原变量继续有效。满足这些条件的类型可实现 `Copy`：

- 整型：如 `u32`、`i64` 等
- 布尔：`bool`
- 浮点：如 `f32`、`f64`
- 字符：`char`
- 指针/引用（不含可变性规则冲突场景）
- 元组：仅当内部成员全部 `Copy`，例如 `(i32, i32)`；`(i32, String)` 不可

一旦类型或其任何部分实现了 `Drop`，则不能再 `Copy`（避免重复释放）。

### [所有权与函数](https://kaisery.github.io/trpl-zh-cn/ch04-01-what-is-ownership.html#%E6%89%80%E6%9C%89%E6%9D%83%E4%B8%8E%E5%87%BD%E6%95%B0)

传参与赋值语义一致：

- 传入非 `Copy` 的堆数据（如 `String`）会发生“移动”，调用后原变量失效。
- 传入实现 `Copy` 的栈数据（如 `i32`）则复制，调用后仍可用。

示例要点（简化）：

```rust
fn takes_ownership(s: String) { println!("{s}"); }
fn makes_copy(x: i32) { println!("{x}"); }
```

进入函数作用域的参数在结束时按所有权规则被 `drop` 或忽略（栈值）。

### [返回值与作用域](https://kaisery.github.io/trpl-zh-cn/ch04-01-what-is-ownership.html#%E8%BF%94%E5%9B%9E%E5%80%BC%E4%B8%8E%E4%BD%9C%E7%94%A8%E5%9F%9F)

函数返回堆数据可将所有权“移出”到调用者：

- 创建并返回：调用者获得所有权。
- 传入再原样返回：转移到返回值（常见于早期未使用引用时的示例）。

为了避免“传入再返回”的样板，可使用引用（下一节）在不转移所有权情况下访问数据。

示例结构（概念化）：

```rust
fn gives_ownership() -> String { String::from("yours") }
fn takes_and_gives_back(s: String) -> String { s }
```

### 小结与引导

本节核心：

- 所有权三规则定义了 Rust 如何在无 GC 情况下安全管理堆内存。
- 栈/堆区别影响拷贝成本与语义（`Copy` vs move）。
- 赋值与函数传参/返回统一遵循“移动或复制”。
- 深拷贝需显式 `clone`；自动操作均保持低成本。
- 以后通过“引用与借用”减少不必要的移动与克隆。

下一步：进入“引用与借用（References & Borrowing）”以理解如何在不转移所有权的情况下共享访问。原文链接：[引用与借用](https://kaisery.github.io/trpl-zh-cn/ch04-02-references-and-borrowing.html)

> 注：以上为基于原章节的结构化摘要，避免逐字大段复制；若需完整逐字版本请确认相关许可（Rust 官方文档采用 Apache/MIT 许可，中文译文请参考其仓库声明）。

## [所有权规则](https://kaisery.github.io/trpl-zh-cn/ch04-01-what-is-ownership.html#%E6%89%80%E6%9C%89%E6%9D%83%E8%A7%84%E5%88%99)

首先，让我们看一下所有权的规则。当我们通过举例说明时，请谨记这些规则：

> 1. Rust 中的每一个值都有一个  **所有者**（_owner_）。
> 2. 值在任一时刻有且只有一个所有者。
> 3. 当所有者离开作用域，这个值将被丢弃。

## [变量作用域](https://kaisery.github.io/trpl-zh-cn/ch04-01-what-is-ownership.html#%E5%8F%98%E9%87%8F%E4%BD%9C%E7%94%A8%E5%9F%9F)

在所有权的第一个例子中，我们看看一些变量的  **作用域**（_scope_）。作用域是一个项（item）在程序中有效的范围。假设有这样一个变量：

```rust
#![allow(unused)]
fn main() {
  let s = "hello";
}
```

变量  `s`  绑定到了一个字符串字面值，这个字符串值是硬编码进程序代码中的。这个变量从声明的点开始直到当前**作用域**结束时都是有效的。

```rust
fn main() {
    {                      // s 在这里无效，它尚未声明
        let s = "hello";   // 从此处起，s 是有效的

        // 使用 s
    }                      // 此作用域已结束，s 不再有效
}                   // 此作用域已结束，s 不再有效
```

换句话说，这里有两个重要的时间点：

- 当  `s` **进入作用域**时，它就是有效的。
- 这一直持续到它**离开作用域**为止。

## [`String`  类型](https://kaisery.github.io/trpl-zh-cn/ch04-01-what-is-ownership.html#string-%E7%B1%BB%E5%9E%8B)

- 我们已经见过字符串字面值，即被硬编码进程序里的字符串值。字符串字面值是很方便的，不过它们并不适合使用文本的每一种场景。
- 原因之一就是它们是不可变的。
- 另一个原因是并非所有字符串的值都能在编写代码时就知道：例如，要是想获取用户输入并存储该怎么办呢？
- 为此，Rust 有另一种字符串类型，`String`。这个类型管理被分配到堆上的数据，所以能够存储在编译时未知大小的文本。可以使用  `from`  函数基于字符串字面值来创建  `String`，如下：

这两个冒号  `::`  是运算符，允许将特定的  `from`  函数置于  `String`  类型的命名空间（namespace）下，而不需要使用类似  `string_from`  这样的名字。

```rust
fn main() {
    let mut s = String::from("hello");

    s.push_str(", world!"); // push_str() 在字符串后追加字面值

    println!("{s}"); // 将打印 `hello, world!`
}
```

那么这里有什么区别呢？为什么  `String`  可变而字面值却不行呢？区别在于两个类型对内存的处理上。

## [内存与分配](https://kaisery.github.io/trpl-zh-cn/ch04-01-what-is-ownership.html#%E5%86%85%E5%AD%98%E4%B8%8E%E5%88%86%E9%85%8D)

- 就字符串字面值来说，我们在编译时就知道其内容，所以文本被直接硬编码进最终的可执行文件中。这使得字符串字面值快速且高效。
- 不过这些特性都只得益于字符串字面值的不可变性。
- 不幸的是，我们不能为了每一个在编译时大小未知的文本而将一块内存放入二进制文件中，并且它的大小还可能随着程序运行而改变。
  对于  `String`  类型，为了支持一个可变，可增长的文本片段，需要在堆上分配一块在编译时未知大小的内存来存放内容。这意味着：
- 必须在运行时向内存分配器（memory allocator）请求内存。
- 需要一个当我们处理完  `String`  时将内存返回给分配器的方法。
  第一部分由我们完成：当调用  `String::from`  时，它的实现 (_implementation_) 请求其所需的内存。这在编程语言中是非常通用的。

然而，第二部分实现起来就各有区别了。

- 在有  **垃圾回收**（_garbage collector_，_GC_）的语言中，GC 记录并清除不再使用的内存，而我们并不需要关心它。
- 在大部分没有 GC 的语言中，识别出不再使用的内存并调用代码显式释放就是我们的责任了，跟请求内存的时候一样。
- 从历史的角度上说正确处理内存回收曾经是一个困难的编程问题。如果忘记回收了会浪费内存。如果过早回收了，将会出现无效变量。如果重复回收，这也是个 bug。我们需要精确的为一个  `allocate`  配对一个  `free`。
  Rust 采取了一个不同的策略：内存在拥有它的变量离开作用域后就被自动释放。

```rust
    {
        let s = String::from("hello"); // 从此处起，s 是有效的

        // 使用 s
    }                                  // 此作用域已结束，
                                       // s 不再有效
```

- 这是一个将  `String`  需要的内存返回给分配器的很自然的位置：当  `s`  离开作用域的时候。
- 当变量离开作用域，Rust 为我们调用一个特殊的函数。这个函数叫做  [`drop`](https://doc.rust-lang.org/std/ops/trait.Drop.html#tymethod.drop)，在这里  `String`  的作者可以放置释放内存的代码。Rust 在结尾的  `}`  处自动调用  `drop`。
  这个模式对编写 Rust 代码的方式有着深远的影响。现在它看起来很简单，不过在更复杂的场景下代码的行为可能是不可预测的，比如当有多个变量使用在堆上分配的内存时。现在让我们探索一些这样的场景。

### [使用移动的变量与数据交互](https://kaisery.github.io/trpl-zh-cn/ch04-01-what-is-ownership.html#%E4%BD%BF%E7%94%A8%E7%A7%BB%E5%8A%A8%E7%9A%84%E5%8F%98%E9%87%8F%E4%B8%8E%E6%95%B0%E6%8D%AE%E4%BA%A4%E4%BA%92)

在 Rust 中，多个变量可以采取不同的方式与同一数据进行交互。

```rust
    let x = 5;
    let y = x;
```

- 我们大致可以猜到这在干什么：“将  `5`  绑定到  `x`；接着生成一个值  `x`  的拷贝并绑定到  `y`”。
- 现在有了两个变量，`x`  和  `y`，都等于  `5`。这也正是事实上发生了的，因为整数是有已知固定大小的简单值，所以这两个  `5`  被压入了栈中。

```rust
    let s1 = String::from("hello");
    let s2 = s1;
```

这看起来与上面的代码非常类似，所以我们可能会假设它们的运行方式也是类似的：也就是说，第二行可能会生成一个  `s1`  的拷贝并绑定到  `s2`  上。但事实并非如此。

看看图 4-1 以了解  `String`  的底层会发生什么。

- `String`  由三部分组成，如图左侧所示：一个指向存放字符串内容内存的指针，一个长度，和一个容量。
- 这一组数据存储在栈上。右侧则是堆上存放内容的内存部分。
  ![|439|720x622](https://kaisery.github.io/trpl-zh-cn/img/trpl04-01.svg)
  <font color="#00b0f0">图 4-1：将值  `"hello"`  绑定给  `s1`  的  `String`  在内存中的表现形式</font>

- 长度表示  `String`  的内容当前使用了多少字节的内存。
- 容量是  `String`  从分配器总共获取了多少字节的内存。
- 长度与容量的区别是很重要的，不过在当前上下文中并不重要，所以现在可以忽略容量。

当我们将  `s1`  赋值给  `s2`，`String`  的数据被复制了，这意味着我们从栈上拷贝了它的指针、长度和容量。我们并没有复制指针指向的堆上数据。换句话说，内存中数据的表现如图 4-2 所示。
![|375](https://kaisery.github.io/trpl-zh-cn/img/trpl04-02.svg)
<font color="#00b0f0">图 4-2：变量  `s2`  的内存表现，它有一份  `s1`  指针、长度和容量的拷贝</font>

- 这个表现形式看起来**并不像**图 4-3 中的那样，如果 Rust 也拷贝了堆上的数据，那么内存看起来就是这样的。
- 如果 Rust 这么做了，那么操作  `s2 = s1`  在堆上数据比较大的时候会对运行时性能造成非常大的影响。
  ![|720x936|365](https://kaisery.github.io/trpl-zh-cn/img/trpl04-03.svg)
  <font color="#00b0f0">图 4-3：另一个  `s2 = s1`  时可能的内存表现，如果 Rust 同时也拷贝了堆上的数据的话</font>

- 之前我们提到过当变量离开作用域后，Rust 自动调用  `drop`  函数并清理变量的堆内存。
- 不过图 4-2 展示了两个数据指针指向了同一位置。这就有了一个问题：当  `s2`  和  `s1`  离开作用域，它们都会尝试释放相同的内存。这是一个叫做  **二次释放**（_double free_）的错误，也是之前提到过的内存安全性 bug 之一。
- 两次释放（相同）内存会导致内存污染，它可能会导致潜在的安全漏洞。
-

- 为了确保内存安全，在  `let s2 = s1;`  之后，Rust 认为  `s1`  不再有效，因此 Rust 不需要在  `s1`  离开作用域后清理任何东西。
- 看看在  `s2`  被创建之后尝试使用  `s1`  会发生什么；这段代码不能运行：

```rust
    let s1 = String::from("hello");
    let s2 = s1;

    println!("{s1}, world!");
```

你会得到一个类似如下的错误，因为 Rust 禁止你使用无效的引用。

```bash
$ cargo run
   Compiling ownership v0.1.0 (file:///projects/ownership)
error[E0382]: borrow of moved value: `s1`
 --> src/main.rs:5:15
  |
2 |     let s1 = String::from("hello");
  |         -- move occurs because `s1` has type `String`, which does not implement the `Copy` trait
3 |     let s2 = s1;
  |              -- value moved here
4 |
5 |     println!("{s1}, world!");
  |               ^^^^ value borrowed here after move
  |
  = note: this error originates in the macro `$crate::format_args_nl` which comes from the expansion of the macro `println` (in Nightly builds, run with -Z macro-backtrace for more info)
help: consider cloning the value if the performance cost is acceptable
  |
3 |     let s2 = s1.clone();
  |                ++++++++

For more information about this error, try `rustc --explain E0382`.
error: could not compile `ownership` (bin "ownership") due to 1 previous error
```

- 如果你在其他语言中听说过术语  **浅拷贝**（_shallow copy_）和  **深拷贝**（_deep copy_），那么拷贝指针、长度和容量而不拷贝数据可能听起来像浅拷贝。
- 不过因为 Rust 同时使第一个变量无效了，这个操作被称为  **移动**（_move_），而不是叫做浅拷贝。
- 上面的例子可以解读为  `s1`  被  **移动**  到了  `s2`  中。那么具体发生了什么，如图 4-4 所示。
  ![|300](https://kaisery.github.io/trpl-zh-cn/img/trpl04-04.svg)
  <font color="#00b0f0">图 4-4：`s1`  无效之后的内存表现</font>

这样就解决了我们的问题！因为只有  `s2`  是有效的，当其离开作用域，它就释放自己的内存，完毕。

另外，这里还隐含了一个设计选择：Rust 永远也不会自动创建数据的 “深拷贝”。因此，任何**自动**的复制都可以被认为是对运行时性能影响较小的。

## [作用域与赋值](https://kaisery.github.io/trpl-zh-cn/ch04-01-what-is-ownership.html#%E4%BD%9C%E7%94%A8%E5%9F%9F%E4%B8%8E%E8%B5%8B%E5%80%BC)

- 作用域、所有权和通过  `drop`  函数释放内存之间的关系反过来也同样成立。
- 当你给一个已有的变量赋一个全新的值时，Rust 将会立即调用  `drop`  并释放原始值的内存。例如，考虑如下代码：

```rust
    let mut s = String::from("hello");
    s = String::from("ahoy");

    println!("{s}, world!");
```

- 起初我们声明了变量  `s`  并绑定为一个  `"hello"`  值的  `String`。
- 接着立即创建了一个值为  `"ahoy"`  的  `String`  并赋值给  `s`。
- 在这里，完全没有任何内容指向了原始堆上的值。
  ![|316](https://kaisery.github.io/trpl-zh-cn/img/trpl04-05.svg)
  <font color="#00b0f0">图 4-5: 当初始值被整体替换后的内存表现</font>

因此原始的字符串立刻就离开了作用域。Rust 会在其上运行  `drop`  函数同时内存会马上释放。当结尾打印其值时，将会是  `"ahoy, world!"`。

## [使用克隆的变量与数据交互](https://kaisery.github.io/trpl-zh-cn/ch04-01-what-is-ownership.html#%E4%BD%BF%E7%94%A8%E5%85%8B%E9%9A%86%E7%9A%84%E5%8F%98%E9%87%8F%E4%B8%8E%E6%95%B0%E6%8D%AE%E4%BA%A4%E4%BA%92)

如果我们  **确实**  需要深度复制  `String`  中堆上的数据，而不仅仅是栈上的数据，可以使用一个叫做  `clone`  的常用方法。
这是一个实际使用  `clone`  方法的例子：

```rust
    let s1 = String::from("hello");
    let s2 = s1.clone();

    println!("s1 = {s1}, s2 = {s2}");
```

这段代码能正常运行，并且明确产生图 4-3 中行为，这里堆上的数据**确实**被复制了。

当出现  `clone`  调用时，你知道一些特定的代码被执行而且这些代码可能相当消耗资源。你很容易察觉到一些不寻常的事情正在发生。

## [只在栈上的数据：拷贝](https://kaisery.github.io/trpl-zh-cn/ch04-01-what-is-ownership.html#%E5%8F%AA%E5%9C%A8%E6%A0%88%E4%B8%8A%E7%9A%84%E6%95%B0%E6%8D%AE%E6%8B%B7%E8%B4%9D)

```rust
    let x = 5;
    let y = x;

    println!("x = {x}, y = {y}");
```
