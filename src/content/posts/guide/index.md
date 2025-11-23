---
title: Fuwari 简易指南
published: 2024-04-01
description: "如何使用此博客模板。"
image: "https://www.loliapi.com/acg/"
tags: ["Fuwari", "Blogging", "Customization"]
category: Guides
draft: false
---

> 封面图片来源：[Source](https://docs.loliapi.com/)

此博客模板基于 [Astro](https://astro.build/) 构建。对于本指南中未提及的内容，您可以在 [Astro 文档](https://docs.astro.build/) 中找到答案。

## 文章的 Front-matter

```yaml
---
title: 我的第一篇博客文章
published: 2023-09-09
description: 这是我新 Astro 博客的第一篇文章。
image: ./cover.jpg
tags: [Foo, Bar]
category: Front-end
draft: false
---
```

| 属性          | 描述                                                                                                                                                           |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`       | 文章的标题。                                                                                                                                                   |
| `published`   | 文章的发布日期。                                                                                                                                               |
| `description` | 文章的简短描述。显示在首页。                                                                                                                                   |
| `image`       | 文章的封面图片路径。<br/>1. 以 `http://` 或 `https://` 开头：使用网络图片<br/>2. 以 `/` 开头：使用 `public` 目录下的图片<br/>3. 不带前缀：相对于 markdown 文件 |
| `tags`        | 文章的标签。                                                                                                                                                   |
| `category`    | 文章的分类。                                                                                                                                                   |
| `draft`       | 如果这篇文章还是草稿，则不会显示。                                                                                                                             |

## 文章文件放置位置

您的文章文件应放置在 `src/content/posts/` 目录下。您也可以创建子目录来更好地组织您的文章和资源。

```
src/content/posts/
├── post-1.md
└── post-2/
    ├── cover.png
    └── index.md
```
