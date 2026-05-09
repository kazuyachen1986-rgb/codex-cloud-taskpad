# 云端手机 App 部署

这个版本适合部署到 Render。部署后，你会得到一个固定的公网网址，手机用流量也能打开。

## 最省事步骤

1. 把这个文件夹上传到一个 GitHub 仓库。
2. 打开 Render，选择 New > Blueprint。
3. 连接这个仓库。
4. Render 会读取 `render.yaml`，自动创建 Web Service 和 1GB 持久磁盘。
5. 部署完成后，打开 Render 给你的 `https://...onrender.com` 地址。
6. 在 Render 的 Environment 里查看 `ACCESS_CODE`，手机首次打开时输入它。

## 它能做什么

- 手机随时打开固定网址。
- 输入一次访问码，之后手机会记住。
- 发送任务、查看任务、标记接收/进行中/完成。
- 任务存在 Render 的持久磁盘里，不依赖你电脑开机。

## 重要说明

这不是直接远程控制桌面 Codex。它是一个云端任务箱：你可以随时从手机投递任务，电脑端 Codex 回来后再读取任务并执行。

