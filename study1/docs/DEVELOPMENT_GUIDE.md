# Group Deception v2 Development Guide

## 当前目标

当前项目实现 Study 1。正式设计是每轮骰子任务中：

```text
共同骰子结果 -> 四位同事本轮提交 -> 参与者私密提交 -> AI 中性确认 -> 奖励反馈
```

每轮同伴先提交就是正式 factor 的呈现方式。

## 目录结构

```text
group-deception-v2/
  config/
    common.js          # 版本、study、condition、状态顺序、成员列表
    measures.js        # 4 题前测、Study 1 最终后测、人口学题
    peer-records.js    # 固定同伴脚本生成；按共同骰子和 condition 生成每轮记录
    study1-dice.js     # Study 1 规则、理解检查、固定共同骰子序列、奖励参数
    study2-income.js   # 预留 Study 2 配置；当前 Study 1 不使用
  public/
    index.html         # 参与者入口页面
    admin.html         # 管理端导出页面
    css/style.css      # 成员栏、群聊、卡片、私密提交、动画等样式
    js/app.js          # 前端流程状态机和 Study 1 页面切换
    js/chat.js         # 只读群聊、左侧成员栏、逐条消息和自动滚动
    js/comprehension.js# 理解检查组件
    js/study1-dice.js  # 骰子显示、私密提交卡、奖励反馈卡
    js/survey.js       # 问卷渲染和回答收集
  server/
    index.js           # Express API、session 创建/恢复、状态机、骰子任务、校验
    store.js           # JSON 文件读写和同 session 串行写锁
    export.js          # 管理端 JSON/CSV 导出
    smoke-test.js      # Study 1 自动测试
  data/
    sessions/          # 正式/本地 session JSON，真实数据不提交
    test-sessions/     # smoke test 临时数据
```

## 关键实现点

- `config/study1-dice.js`
  - `fixedDiceSequence` 是唯一 10 轮共同骰子序列。
  - 序列只使用 1-5。
  - 不通过 `/api/config` 暴露给前端。

- `config/peer-records.js`
  - `buildPeerRecordSequence(condition, diceSequence)` 创建固定同伴脚本。
  - hidden 保存 trueValue 但不显示 reportedValue。
  - honest 的 reportedValue 等于 trueValue。
  - dishonest 的 reportedValue 大于 trueValue。

- `server/index.js`
  - `DEBUG_LINKS` 只有显式 `true` 才开启。
  - `createSession()` 对同一 Prolific ID 返回原 session，包括已完成 session。
  - `prepareCurrentDiceRound()` 首次发放某轮时保存 `selection_started_at`。
  - `/dice/current` 恢复当前轮，不重置开始时间。
  - `/dice/round` 忽略前端传入的开始时间和时长，由服务器计算。
  - 重复提交同一轮会返回已有结果，不新增记录。
  - `/api/config` 只返回 UI 需要的规则、成员、问卷和理解检查，不返回未来骰子序列或同伴脚本。

- `public/js/app.js`
  - 根据 session status 恢复流程。
  - 理解检查通过后直接进入骰子任务。
  - 每轮先渲染共同骰子结果，再逐条渲染同伴提交，最后插入私密提交卡。
  - 提交按钮请求期间禁用，并在提交前弹出二次确认。

## 本地运行

```powershell
cd E:\group-deception-v2
npm install
npm run dev
```

调试链接：

```text
http://localhost:3000/?study=study1&condition=hidden
http://localhost:3000/?study=study1&condition=honest
http://localhost:3000/?study=study1&condition=dishonest
```

调试链接只有 `DEBUG_LINKS=true` 时有效。

## 自动测试

```powershell
npm run smoke
```

测试使用临时数据目录，不写入 `data/sessions/`。

## 修改原则

- 不删除左侧成员栏、群聊逐条出现、蓝白消息卡、私密锁定提交卡、自动滚动和动画效果。
- 不增加 AI 建议、评价、劝阻或自动修改。
- 不把同伴每轮提交改成非逐轮呈现。
- 修改题库时必须同步更新服务端校验和 smoke test。
- 修改状态顺序时必须同步更新前端恢复逻辑和 smoke test。
