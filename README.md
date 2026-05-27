# 像素绘图 MVP

极简像素绘图工具，纯 HTML + JS + Canvas，零依赖、零构建步骤。

## 功能

- 自定义颜色 + 字符的像素块，保存到素材库（浏览器本地持久化）
- 画布上单击 / 拖动作画
- 按住 `Shift` 拖动 = 矩形批量填充 / 擦除
- 顶栏自动统计已用像素块数
- 撤销 / 重做（栈深 50）
- JSON 保存 / 导入（含画布数据 + 素材库）
- 画布尺寸：16×16 / 32×32 / 48×48 / 64×64

## 本地使用

直接双击 `index.html`，浏览器即可打开（不需要服务器）。

## 快捷键

| 键 | 作用 |
|---|---|
| `B` | 画笔 |
| `E` | 橡皮擦 |
| `Ctrl/Cmd + Z` | 撤销 |
| `Ctrl/Cmd + Shift + Z` | 重做 |
| `Shift + 拖动` | 矩形批量操作 |

## 文件结构

```
pixel-art/
├── index.html
├── styles.css
├── app.js
└── README.md
```

## 部署

### Vercel

1. 把整个 `pixel-art/` 目录推到 GitHub 仓库
2. Vercel 仪表盘 → New Project → Import 该仓库
3. Framework Preset 选 **Other**，构建命令留空，输出目录留空
4. 部署完即得 URL

### GitHub Pages

1. 推到 GitHub 仓库（例：`username/pixel-art`）
2. Settings → Pages → Source = `Deploy from a branch`，分支选 `main`，目录选 `/ (root)`
3. 等几分钟，访问 `https://username.github.io/pixel-art/`

> 所有静态资源使用相对路径 (`./styles.css`, `./app.js`)，因此既支持顶级域名也支持子路径部署。

## 数据格式

保存的 JSON 结构：

```json
{
  "version": 1,
  "config": { "cols": 32, "rows": 32, "cellPx": 20 },
  "cells": {
    "5,7": { "color": "#ff5252", "char": "🚲" }
  },
  "palette": [
    { "id": "p1", "color": "#ff5252", "char": "🚲", "name": "自行车" }
  ]
}
```
