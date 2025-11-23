---
title: Markdown 示例
published: 2023-10-01
description: 一个简单的 Markdown 博客文章示例。
tags: [Markdown, Blogging, Demo]
category: Examples
draft: false
---

# 一级标题

段落之间用空行分隔。

第二段。_斜体_，**粗体**，和 `等宽字体`。项目列表
看起来像这样：

- 第一项
- 第二项
- 第三项

请注意 --- 不考虑星号 --- 实际文本
内容从第 4 列开始。

> 块引用
> 像这样写。
>
> 如果你喜欢，
> 它们可以跨越多个段落。

使用 3 个破折号表示长破折号。使用 2 个破折号表示范围（例如，“都在第 12--14 章”）。三个点 ... 将转换为省略号。
支持 Unicode。☺

## 二级标题

这是一个编号列表：

1. 第一项
2. 第二项
3. 第三项

再次注意实际文本是如何从第 4 列开始的（距左侧 4 个字符）。这是一个代码示例：

    # 让我重申一下 ...
    for i in 1 .. 10 { do-something(i) }

正如你可能猜到的，缩进 4 个空格。顺便说一句，与其
缩进代码块，如果你喜欢，你可以使用分隔块：

```
define foobar() {
    print "Welcome to flavor country!";
}
```

（这使得复制和粘贴更容易）。你可以选择标记
分隔块以便 Pandoc 对其进行语法高亮显示：

```python
import time
# Quick, count to ten!
for i in range(10):
    # (but not *too* quick)
    time.sleep(0.5)
    print i
```

### 三级标题

现在是一个嵌套列表：

1.  首先，获取这些配料：

    - 胡萝卜
    - 芹菜
    - 扁豆

2.  烧一些水。

3.  把所有东西倒进锅里并遵循
    这个算法：

        找到木勺
        揭开锅盖
        搅拌
        盖上锅盖
        把木勺危险地平衡在锅柄上
        等待 10 分钟
        转到第一步（或完成后关掉燃烧器）

    不要碰到木勺，否则它会掉下来。

再次注意文本总是对齐在 4 空格缩进上（包括
上面第 3 项的最后一行）。

这是一个链接到 [网站](http://foo.bar)，到 [本地文档](local-doc.html)，以及到 [当前文档中的章节标题](#二级标题)。这是一个脚注 [^1]。

[^1]: Footnote text goes here.

Tables can look like this:

size material color

---

9 leather brown
10 hemp canvas natural
11 glass transparent

Table: Shoes, their sizes, and what they're made of

(The above is the caption for the table.) Pandoc also supports
multi-line tables:

---

keyword text

---

red Sunsets, apples, and
other red or reddish
things.

green Leaves, grass, frogs
and other things it's
not easy being.

---

A horizontal rule follows.

---

Here's a definition list:

apples
: Good for making applesauce.
oranges
: Citrus!
tomatoes
: There's no "e" in tomatoe.

Again, text is indented 4 spaces. (Put a blank line between each
term/definition pair to spread things out more.)

Here's a "line block":

| Line one
| Line too
| Line tree

and images can be specified like so:

[//]: # '![example image](./demo-banner.png "An exemplary image")'

Inline math equations go in like so: $\omega = d\phi / dt$. Display
math should get its own line and be put in in double-dollarsigns:

$$I = \int \rho R^{2} dV$$

$$
\begin{equation*}
\pi
=3.1415926535
 \;8979323846\;2643383279\;5028841971\;6939937510\;5820974944
 \;5923078164\;0628620899\;8628034825\;3421170679\;\ldots
\end{equation*}
$$

And note that you can backslash-escape any punctuation characters
which you wish to be displayed literally, ex.: \`foo\`, \*bar\*, etc.
