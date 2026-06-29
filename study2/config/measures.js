const baselineItems = [
  {
    id: "ai_use_frequency",
    prompt: "过去三个月，我使用 AI 工具协助学习、工作或日常事务的频率是。",
    minLabel: "从不",
    maxLabel: "非常频繁"
  },
  {
    id: "ai_execution_experience",
    prompt: "过去三个月，我曾使用 AI 或自动化工具代替我完成、提交、发送或执行具体任务的频率是。",
    minLabel: "从不",
    maxLabel: "非常频繁"
  },
  {
    id: "ai_execution_trust",
    prompt: "当任务规则明确、步骤固定时，我相信 AI 能按我的指令完成任务。",
    minLabel: "非常不同意",
    maxLabel: "非常同意"
  },
  {
    id: "ai_execution_willingness",
    prompt: "对于规则明确、步骤固定的任务，我愿意让 AI 按我的指令代为执行。",
    minLabel: "非常不同意",
    maxLabel: "非常同意"
  }
];

const demographicsItems = [
  { id: "age", prompt: "年龄", type: "number", min: 18, max: 100 },
  { id: "gender", prompt: "性别", type: "select", options: ["女性", "男性", "非二元/其他", "不愿回答"] },
  { id: "education", prompt: "最高教育程度", type: "select", options: ["高中及以下", "大专", "本科", "硕士", "博士", "其他", "不愿回答"] }
];

module.exports = {
  baselineItems,
  demographicsItems
};
