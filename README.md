# 英语口语练习 v1.4

AI 驱动的英语口语角色扮演练习应用。输入中文文本 → AI 自动生成英语对话剧本 → 选择角色进行口语练习 → AI 智能评判 + 生词复习。

## 整体架构

### 技术栈

| 层 | 技术 |
|---|---|
| **前端框架** | Next.js 14 (App Router) |
| **样式** | Tailwind CSS |
| **AI 引擎** | DeepSeek Chat API (deepseek-chat) |
| **语音合成 (TTS)** | 阿里云 DashScope CosyVoice API |
| **语音识别 (ASR)** | 浏览器原生 Web Speech API |
| **存储** | 浏览器 localStorage (词库、剧本历史) |
| **部署** | Railway (Node.js 持久化运行) |

### 项目结构

```
english-speaking-app/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── deepseek/
│   │   │       ├── generate-script/route.ts   # AI 生成剧本
│   │   │       ├── generate-line/route.ts      # AI 生成台词（含角色切换）
│   │   │       ├── judge-answer/route.ts        # AI 评判用户回答
│   │   │       └── review-answer/route.ts       # AI 评估造句
│   │   │   └── tts/
│   │   │       └── synthesize/route.ts          # 文本转语音
│   │   ├── page.tsx            # 首页：输入文本 → 生成剧本 → 编辑 → 选角色
│   │   ├── practice/page.tsx   # 核心：对话练习页面（6 区域布局）
│   │   ├── review/page.tsx     # 造句复习页面
│   │   ├── word-bank/page.tsx  # 词库管理页面
│   │   ├── layout.tsx          # 全局布局 (WordBankProvider + NavBar)
│   │   └── globals.css         # 全局样式
│   ├── components/
│   │   └── layout/NavBar.tsx   # 底部导航栏
│   ├── context/
│   │   └── WordBankContext.tsx  # 词库状态管理 (React Context)
│   ├── hooks/
│   │   ├── useConversation.ts   # 对话状态机（核心业务逻辑）
│   │   ├── useAudio.ts          # 音频播放 + TTS + 降级到浏览器语音
│   │   ├── useSpeechRecognition.ts  # 语音识别封装
│   │   └── useLocalStorage.ts   # localStorage 持久化 Hook
│   ├── lib/
│   │   ├── deepseek.ts          # DeepSeek API 客户端（懒加载）
│   │   ├── prompts.ts           # 所有 AI 提示词模板
│   │   ├── cosyvoice-tts.ts     # TTS 工具函数（预留接口）
│   │   ├── script-parser.ts     # 剧本文本解析
│   │   └── storage.ts           # 词库导入/导出
│   └── types/
│       └── index.ts             # TypeScript 类型定义
├── zeabur.json         # Zeabur 部署配置（兼容）
├── next.config.mjs     # Next.js 配置
└── package.json
```

### 核心类型系统

```
Script → lines[ScriptLine] + roles[] + difficulty
  ↓ 解析
PracticeRound[]         # 预生成的每一轮对话
  ├── userLine          # 用户台词 (en + zh)
  ├── aiContext         # AI 前文台词 (可选)
  ├── hint              # 回答建议 (zhHint + hardWords)
  ├── aiHardWords       # AI 台词中的生词
  └── expectedUserEn    # 预期回答

ConversationState       # 对话状态机
  ├── rounds[]          # 所有预生成轮次
  ├── currentRoundIndex # 当前轮次
  ├── phase             # 当前阶段
  ├── retryCount        # 当前轮重试次数
  └── generatingProgress # 预生成进度
```

## 界面交互逻辑

### 导航结构

底部 4 个 Tab：**首页 🏠 → 练习 💬 → 词库 📖 → 复习 📝**

### 首页流程 (page.tsx)

四个步骤（Step Indicator 可视化）：

```
[输入文本] → [生成剧本] → [编辑确认] → [选择角色] → 进入练习
```

1. **输入文本** — 粘贴中文文本（如"小明和小红在公园相遇..."），选择难度（A2/B1/B2）
2. **生成剧本** — 调用 DeepSeek 生成 JSON 格式剧本（title + roles + lines），带旋转加载动画
3. **编辑确认** — 用户可修改角色名和台词，格式校验（至少 2 句、2 个角色）
4. **选择角色** — 展示每个角色的台词数量，选择后自动保存到 localStorage

已保存的剧本展示在页面顶部，支持一键继续练习和删除。

### 练习页面 (practice/page.tsx) — 6 区域布局

```
┌──────────────────────────────────┐
│  Part 1: Header                  │
│  [← 返回] 语速 0.8x/1x  [3/8轮]  │
├──────────────────────────────────┤
│  Part 2: Progress Bar            │
│  ████████░░░░░░░░░░  第2轮 — 扮演朋友│
├──────────────────────────────────┤
│  Part 3: AI Context              │
│  [AI角色名]              [🔈播放] │
│  "English sentence..."           │
│  📖 显示/隐藏原文                  │
│  生词: [word⁺] [word⁺]           │
├──────────────────────────────────┤
│  Part 4: Hint (黄底)              │
│  💡 回答建议：方向性中文提示         │
│  建议词汇: [word⁺] [word⁺]        │
├──────────────────────────────────┤
│  Part 5: User Input (白底)        │
│  ┌──────────────────────────┐    │
│  │ 输入你的英语回答...         │    │
│  └──────────────────────────┘    │
│  [🎤 语音输入]  [提交回答]        │
├──────────────────────────────────┤
│  Part 6: Comparison              │
│  ✓ 回答正确！或 再试一次          │
│  你的回答 / 参考英文 / 中文参考    │
│  [下一句 →] 或 [再说一遍/跳过]     │
└──────────────────────────────────┘
```

**渐进式提示（回答错误时）：**
- **第 1 次错误**：仅显示"你的回答"（用户可自行对比）
- **第 2 次错误**：增加显示"中文参考"
- **第 3 次错误**：增加显示"英文参考" + "跳过"按钮

**语音功能：**
- **播放**：点击🔈播放 AI 台词（TTS 优先 → 降级到浏览器 SpeechSynthesis）
- **输入**：🎤 开始录音/⏹ 停止录音，语音实时转文字填入输入框
- 语速切换：0.8x（慢速）/ 1.0x（常速）

**生词系统：**
- 橙色背景 = 未收入词库，绿色背景 = 已掌握（mastery ≥ 3）
- 点击生词：已收入显示掌握度，未收入可点 `+` 加入词库
- 加入提示：底部 Toast 自动 2 秒消失

### 词库页面 (word-bank/page.tsx)

- **筛选**：全部 / 新词 (mastery=0) / 学习中 (1-3) / 已掌握 (≥4)
- **底部弹出详情**（Bottom Sheet）：点击单词弹出
  - 掌握度编辑（0-5 一键设定）
  - 复习次数 / 添加时间 / 来源
  - 删除单词
- **导入/导出**：JSON 格式全量备份和恢复

### 造句复习页面 (review/page.tsx)

- 展示 mastery ≤ 3 的生词列表
- 选中单词 → 输入或用语音造一个英语句子
- AI 从三方面评分（1-10）：语法、用词、自然度
- 评分结果更新该单词的掌握度
- 支持语音输入（同练习页面的停止录音逻辑）

## 数据流

### 对话练习完整流程

```
用户点击开始练习
  ↓
initConversation()
  ├── 初始化状态 (phase = 'pre-generating')
  ├── 计算 AI roles (排除用户角色)
  └── preGenerateRounds()
        ├── 遍历每个用户台词位置
        ├── 并行调用 2 次 API（用户台词 + AI 前文）
        │   └── /api/deepseek/generate-line
        │         └── DeepSeek: 中→英翻译 + 生词标注 + 回答建议
        ├── 更新 generatingProgress
        └── phase → 'user-responding'

用户输入回答 → 提交
  ↓
submitAnswer()
  ├── phase → 'judging'
  └── /api/deepseek/judge-answer
        └── DeepSeek: CORRECT/INCORRECT + 评价
              ↓
        正确: phase → 'correct', retryCount = 0
        错误: phase → 'incorrect', retryCount++
        网络错误: phase → 'user-responding' (可重试)

用户点击"下一句"
  ↓
nextRound()
  ├── currentRoundIndex++
  ├── retryCount = 0
  └── phase → 'user-responding' (或 'completed')
```

### 预生成并行化

每轮对话中，用户台词和 AI 前文台词通过 `Promise.all` 并行请求，加载时间从 `T_user + T_ai` 降为 `max(T_user, T_ai)`。

### 语音播放降级策略

```
DashScope TTS API → 成功 → Audio 播放
         ↓ 失败
    浏览器 SpeechSynthesis → 成功 → utterance 播放
         ↓ 失败
    显示错误提示（黄色 Banner）
```

## API 接口

| 端点 | 方法 | 输入 | 输出 |
|---|---|---|---|
| `/api/deepseek/generate-script` | POST | `{ text, level }` | `{ title, roles, lines[] }` |
| `/api/deepseek/generate-line` | POST | `{ scriptContext, userRole, aiRoles, history, turnIndex, scriptLine, nextUserLineHint, isUserLine }` | `{ en, zh, aiHardWords[], expectedUserEn, hint }` |
| `/api/deepseek/judge-answer` | POST | `{ expectedHint, userAnswer, conversationHistory, isUserLine }` | `{ isCorrect, feedback }` |
| `/api/deepseek/review-answer` | POST | `{ word, userSentence }` | `{ grammarScore, wordUsageScore, naturalnessScore, feedback, betterExample }` |
| `/api/tts/synthesize` | POST | `{ text, voice, speed }` | `audio/mpeg` (binary) |

## 状态机 (phase 流转)

```
pre-generating ──(预生成完毕)──→ user-responding
                                   │
                              [用户提交回答]
                                   │
                               judging
                                   │
                        ┌──────────┴──────────┐
                        │                     │
                    correct              incorrect
                        │                     │
                    [下一句]         ┌─────────┴─────────┐
                        │         retry < 3        retry >= 3
                        ↓      [再说一遍]           [跳过]
                   user-responding  │                 │
                        │           ↓                 ↓
                        │      user-responding   user-responding
                        │           (retry++)     (next round)
                        ↓
                   completed
```

## 环境变量

| 变量 | 必需 | 说明 |
|---|---|---|
| `DEEPSEEK_API_KEY` | 是 | DeepSeek Chat API key |
| `DASHSCOPE_API_KEY` | 否（TTS） | 阿里云 DashScope API key（语音合成） |

## 本地开发

```bash
# 安装依赖
npm install

# 配置环境变量
cp .env.example .env.local
# 编辑 .env.local 填入 DEEPSEEK_API_KEY

# 启动开发服务器
npm run dev

# 类型检查
npx tsc --noEmit

# 构建
npm run build
```

## 版本历史

| 版本 | 变更 |
|---|---|
| v1.0 | 初始版本：基础剧本生成 + 对话练习 + 词库 |
| v1.1 | 渐进式提示（Part 4 + Part 6）；修复 user-line 角色错误；AI 生词可点击加入词库 |
| v1.2 | 预生成 API 并行化 + 进度条；移除 Part 4 关键词汇；评判规则优化（ASR 感知）；移除过于严格的前缀逻辑 |
| v1.3 | Part 4 去除逐级显示；预生成失败可见 + 返回按钮；API 失败不再误判为答错；alert() 全替换为 Toast；Review 页添加停止录音 |
| **v1.4** | 懒加载 OpenAI 客户端修复构建失败；全面文档化；部署到 Railway 生产环境 |
