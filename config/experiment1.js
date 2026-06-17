/** Experiment 1: Group chat dice delegation — 2×2 design */

const SMALL_TEAM_MEMBERS = [
  { id: 'host', name: '主持人', role: 'host', avatar: '🎙️', isBot: true },
  { id: 'you', name: '您', role: 'participant', avatar: '👤', isBot: false },
  { id: 'm1', name: '张明', role: 'member', avatar: '🧑', isBot: true },
  { id: 'delegate', name: '受托节点', role: 'delegate', avatar: '🤝', isBot: true },
];

const LARGE_TEAM_MEMBERS = [
  { id: 'host', name: '主持人', role: 'host', avatar: '🎙️', isBot: true },
  { id: 'you', name: '您', role: 'participant', avatar: '👤', isBot: false },
  { id: 'm1', name: '张明', role: 'member', avatar: '🧑', isBot: true },
  { id: 'm2', name: '李华', role: 'member', avatar: '👩', isBot: true },
  { id: 'm3', name: '王芳', role: 'member', avatar: '🧒', isBot: true },
  { id: 'delegate', name: '受托节点', role: 'delegate', avatar: '🤝', isBot: true },
];

const PRE_SURVEY = [
  {
    id: 'ai_trust',
    type: 'likert',
    text: '总体而言，我信任 AI 系统能做出可靠判断。',
    scale: 7,
    labels: ['非常不同意', '非常同意'],
  },
  {
    id: 'ai_usage',
    type: 'likert',
    text: '我经常使用 AI 工具（如 ChatGPT）辅助工作或学习。',
    scale: 7,
    labels: ['非常不同意', '非常同意'],
  },
  {
    id: 'compliance',
    type: 'likert',
    text: '在群体中，我倾向于遵从多数人的意见。',
    scale: 7,
    labels: ['非常不同意', '非常同意'],
  },
  {
    id: 'moral_baseline_1',
    type: 'likert',
    text: '为了团队利益，偶尔夸大事实是可以接受的。',
    scale: 7,
    labels: ['非常不同意', '非常同意'],
  },
  {
    id: 'moral_baseline_2',
    type: 'likert',
    text: '当责任由他人承担时，我更容易做出对自己有利的决定。',
    scale: 7,
    labels: ['非常不同意', '非常同意'],
  },
];

const POST_SURVEY = [
  {
    id: 'responsibility_self',
    type: 'likert',
    text: '上报结果的责任主要在我自己。',
    scale: 7,
    labels: ['非常不同意', '非常同意'],
  },
  {
    id: 'responsibility_delegate',
    type: 'likert',
    text: '上报结果的责任主要在受托节点。',
    scale: 7,
    labels: ['非常不同意', '非常同意'],
  },
  {
    id: 'responsibility_group',
    type: 'likert',
    text: '上报结果的责任由全组共同承担。',
    scale: 7,
    labels: ['非常不同意', '非常同意'],
  },
  {
    id: 'guilt',
    type: 'likert',
    text: '我对刚才的决策感到愧疚。',
    scale: 7,
    labels: ['非常不同意', '非常同意'],
  },
  {
    id: 'moral_disengagement_1',
    type: 'likert',
    text: '在这种情况下，夸大上报结果是合理的。',
    scale: 7,
    labels: ['非常不同意', '非常同意'],
  },
  {
    id: 'moral_disengagement_2',
    type: 'likert',
    text: '团队奖金比个人诚实更重要。',
    scale: 7,
    labels: ['非常不同意', '非常同意'],
  },
  {
    id: 'delegate_perception',
    type: 'likert',
    text: '我将受托节点视为工具，而非同伴。',
    scale: 7,
    labels: ['非常不同意', '非常同意'],
  },
  {
    id: 'group_size_perception',
    type: 'likert',
    text: '我感觉小组里有很多活跃成员。',
    scale: 7,
    labels: ['非常不同意', '非常同意'],
  },
  {
    id: 'group_activity_perception',
    type: 'likert',
    text: '群聊中发言的人很多、很活跃。',
    scale: 7,
    labels: ['非常不同意', '非常同意'],
  },
  {
    id: 'inflate_awareness',
    type: 'likert',
    text: '在任务过程中，我意识到可以要求受托节点上报与骰子点数不同的数字。',
    scale: 7,
    labels: ['非常不同意', '非常同意'],
  },
  {
    id: 'inflate_considered',
    type: 'likert',
    text: '我曾考虑过要求上报比骰子真实结果更高的数字。',
    scale: 7,
    labels: ['非常不同意', '非常同意'],
  },
];

function assignCondition() {
  const agentType = Math.random() < 0.5 ? 'human' : 'ai';
  const teamSize = Math.random() < 0.5 ? 'small' : 'large';
  return { agentType, teamSize, cell: `${agentType}_${teamSize}` };
}

function buildTeam(condition) {
  const base = condition.teamSize === 'small' ? SMALL_TEAM_MEMBERS : LARGE_TEAM_MEMBERS;
  return base.map((m) => {
    if (m.role === 'delegate') {
      const isAi = condition.agentType === 'ai';
      return {
        ...m,
        name: isAi ? 'AI 助手' : '陈磊',
        avatar: isAi ? '🤖' : '🧑‍💼',
        agentType: condition.agentType,
      };
    }
    return { ...m };
  });
}

function dicePayout(value) {
  return value * 2;
}

const PAYOFF_MULTIPLIER = 2;

const PAYOFF_RULE_SHORT = `每位组员报酬 = 上报数字 × ${PAYOFF_MULTIPLIER} 元（上报数字越高，全组每人奖金越多）`;

const PAYOFF_RULE_FULL = [
  `报酬由受托节点最终上报的数字（1–6）决定，与骰子真实点数无关。`,
  `计算公式：每位组员获得 ${PAYOFF_MULTIPLIER} 元 × 上报数字。例如上报 4，则每人得 8 元；上报 6，则每人得 12 元。`,
  `上报数字越高，全组每人获得的奖金越多。`,
].join('');

function participantGoalText(delegateLabel) {
  return `您的任务：看到骰子结果后，告诉${delegateLabel}应上报什么数字（1–6）。由${delegateLabel}代为上报，该数字决定全组每人的实际报酬。`;
}

module.exports = {
  PRE_SURVEY,
  POST_SURVEY,
  assignCondition,
  buildTeam,
  dicePayout,
  PAYOFF_MULTIPLIER,
  PAYOFF_RULE_SHORT,
  PAYOFF_RULE_FULL,
  participantGoalText,
  SMALL_TEAM_MEMBERS,
  LARGE_TEAM_MEMBERS,
};
