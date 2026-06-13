import { Difficulty } from '@/types';

export function generateScriptPrompt(text: string, level: Difficulty) {
  const levelDescriptions: Record<Difficulty, string> = {
    A2: '句子很短（3-8个单词），只用一般现在时，词汇为最常用的1000词',
    B1: '句子中等长度（5-15个单词），使用一般现在时和一般过去时，词汇为常用3000词',
    B2: '句子较长（8-20个单词），使用多种时态，包含一些较高级词汇',
  };

  return `你是一个英语对话剧本生成器。基于以下中文文本，生成一个${level}难度的英语对话剧本。

中文文本：
${text}

要求：
1. 生成8-15轮对话（一问一答算一轮）
2. 对话涉及2-4个角色
3. 难度要求：${levelDescriptions[level]}
4. 对话必须围绕中文文本的主题展开，可以是讨论、问答、角色扮演等形式
5. 每个角色都有合理的台词

输出JSON格式：
{
  "title": "对话标题（中文）",
  "roles": ["角色1", "角色2", ...],
  "lines": [
    {"role": "角色1", "content": "台词内容（中文）"},
    {"role": "角色2", "content": "台词内容（中文）"}
  ]
}`;
}

export function generateLinePrompt(
  aiRole: string,
  userRole: string,
  scriptContext: string,
  history: string,
  turnIndex: number,
  currentLine: string,
  nextUserLineHint: string,
  isUserLine: boolean = false,
  lineRoleName: string = ''
) {
  const effectiveSpeakerRole = isUserLine ? lineRoleName : aiRole;
  const speakerIntro = `当前你扮演的角色：${effectiveSpeakerRole}`;

  return `你是一个专业的英语对话教练。

${speakerIntro}
用户扮演的角色：${userRole}

完整剧本上下文：
${scriptContext}

对话历史：
${history}

你现在在第 ${turnIndex + 1} 轮对话。
本轮剧本台词：${currentLine}

=== 任务1：将台词转成英语 ===
将这句剧本台词转换为 B1 难度的英语口语表达。
要求：
1. 必须基于本轮剧本台词"${currentLine}"来生成英语句子，不能跳过或提前说后面的内容
2. B1 难度：5-15个单词，使用一般现在时或一般过去时
3. 自然的口语表达

=== 任务2：生成中文回答建议 ===
${
  nextUserLineHint
    ? `对话即将轮到用户发言，剧情方向：${nextUserLineHint}`
    : '根据剧情走向'
}
请为用户生成一个方向性建议，帮助用户自己组织语言回答。不要直接写出剧本原文。
要求：
1. 告诉用户当前需要表达哪方面的内容（方向性提示）
2. 提供 2-3 个关键英语词汇或短语帮助用户组织语言
3. 不要写出完整句子 —— 让用户自己思考和组句

同时为 AI 台词标注生词 (aiHardWords)，供听力辅助使用。

=== 任务3：生成用户预期回答的英文 ===
根据剧本上下文，生成用户当前轮次应该说的英文句子。
- 如果是 AI 台词（本轮 AI 说），翻译下一句用户台词作为 expectedUserEn
- 如果是用户台词（轮到用户说），expectedUserEn 就是 en 字段本身

输出JSON格式：
{
  "en": "你的英语台词",
  "zh": "对应的中文翻译",
  "aiHardWords": [
    {"word": "AI台词中的较难词汇", "chinese": "中文释义", "pos": "词性"}
  ],
  "expectedUserEn": "用户应该说的英文句子（用于后续对比）",
  "hint": {
    "zhHint": "方向性中文建议（不直接给句子，给出关键词引导用户自己组织）",
    "hardWords": [
      {"word": "用于回答的关键词汇", "chinese": "中文释义", "pos": "词性"}
    ]
  }
}`;
}

export function judgeAnswerPrompt(
  expectedHint: string,
  userAnswer: string,
  history: string,
  isUserLine: boolean = false
) {
  const promptBase = isUserLine
    ? `你是一个英语口语教练，判断学生的回答是否符合剧情中该角色应该说出的意思。

根据以下剧情中该角色的台词作为参考（允许同义表达）：
参考台词：${expectedHint}`
    : `你是一个英语口语教练，判断学生的回答是否符合预期的意思。

用户应该表达的意思：${expectedHint}`;

  return `${promptBase}

用户的英语回答：${userAnswer}

对话历史：
${history}

判断规则（重要——请严格遵守）：
1. 核心意思一致就算正确，不要求逐字背诵；同义词、换种说法都算正确
2. 语法错误可以接受，只要不影响对核心意思的理解
3. 【语音识别宽容】语音识别（ASR）可能把正确的单词识别成拼写相近的其他单词。例如用户说了"receive"但被识别成"relieve"——如果语境中明显是 receive 的意思，依然判为正确
4. 【核心意思不同才判错】只有完全不相关或意思相反才判为不正确。如果用户的句子与参考句子意思接近但用词不同，判为正确
5. 特别注意：一个句子即使语法完美，如果表达的核心意思与参考完全不同，也应判为 INCORRECT

请判断：用户的回答是否表达了正确的核心意思？
只输出一个单词：CORRECT 或 INCORRECT`;
}

export function reviewSentencePrompt(word: string, userSentence: string) {
  return `评估用户用单词"${word}"造的英语句子："${userSentence}"

从以下三个维度评分（1-10分）：
1. 语法正确性（grammarScore）
2. 用词准确性（wordUsageScore）- 单词"${word}"是否使用正确
3. 表达自然度（naturalnessScore）

输出JSON格式：
{
  "grammarScore": 1-10,
  "wordUsageScore": 1-10,
  "naturalnessScore": 1-10,
  "feedback": "用中文给出具体改进建议（1-3句话）。如果句子很好就说"非常好！继续保持！"",
  "betterExample": "一个更好的例句（使用相同的单词）"
}`;
}
