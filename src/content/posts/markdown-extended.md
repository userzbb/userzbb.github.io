---
title: Markdown 扩展功能
published: 2024-05-01
updated: 2024-11-29
description: "了解更多关于 Fuwari 中的 Markdown 功能"
image: ""
tags: [Demo, Example, Markdown, Fuwari]
category: "Examples"
draft: false
---

## GitHub 仓库卡片

您可以添加链接到 GitHub 仓库的动态卡片，页面加载时，仓库信息将从 GitHub API 拉取。

::github{repo="Fabrizz/MMM-OnSpotify"}

使用代码 `::github{repo="<owner>/<repo>"}` 创建 GitHub 仓库卡片。

```markdown
::github{repo="saicaca/fuwari"}
```

## 警告提示 (Admonitions)

支持以下类型的警告提示：`note` `tip` `important` `warning` `caution`

:::note
强调用户即使在略读时也应考虑的信息。
:::

:::tip
帮助用户更成功的可选信息。
:::

:::important
用户成功所必需的关键信息。
:::

:::warning
由于潜在风险，需要用户立即注意的关键内容。
:::

:::caution
行动的潜在负面后果。
:::

### 基本语法

```markdown
:::note
Highlights information that users should take into account, even when skimming.
:::

:::tip
Optional information to help a user be more successful.
:::
```

### 自定义标题

警告提示的标题可以自定义。

:::note[我的自定义标题]
这是一个带有自定义标题的提示。
:::

```markdown
:::note[我的自定义标题]
这是一个带有自定义标题的提示。
:::
```

### GitHub 语法

> [!TIP]
> 也支持 [GitHub 语法](https://github.com/orgs/community/discussions/16925)。

```
> [!NOTE]
> The GitHub syntax is also supported.

> [!TIP]
> The GitHub syntax is also supported.
```

### 剧透 (Spoiler)

您可以向文本添加剧透效果。文本也支持 **Markdown** 语法。

内容 :spoiler[被隐藏了 **哎呀**]!

```markdown
The content :spoiler[is hidden **ayyy**]!
```
