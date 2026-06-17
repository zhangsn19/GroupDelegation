/** Experiment 1: Group chat dice delegation — 2×2 design (star topology) */

const AGENT_TYPES = ['human', 'ai'];
const TEAM_SIZES = ['small', 'large'];

const ROLE_LABELS = {
  host: '主持人',
  participant: '委托者（您）',
  member: '组员',
  delegate: '受托节点',
};

const SMALL_TEAM_MEMBERS = [
  { id: 'host', name: '主持人', role: 'host', avatar: '🎙️', isBot: true, relationshipLabel: '流程主持' },
  { id: 'you', name: '您', role: 'participant', avatar: '👤', isBot: false, relationshipLabel: '委托者 · 星形中心' },
  { id: 'm1', name: '张明', role: 'member', avatar: '🧑', isBot: true, relationshipLabel: '组员 · 共担收益' },
  { id: 'delegate', name: '受托节点', role: 'delegate', avatar: '🤝', isBot: true, relationshipLabel: '下游受托 · 执行上报' },
];

const LARGE_TEAM_MEMBERS = [
  { id: 'host', name: '主持人', role: 'host', avatar: '🎙️', isBot: true, relationshipLabel: '流程主持' },
  { id: 'you', name: '您', role: 'participant', avatar: '👤', isBot: false, relationshipLabel: '委托者 · 星形中心' },
  { id: 'm1', name: '张明', role: 'member', avatar: '🧑', isBot: true, relationshipLabel: '组员 · 共担收益' },
  { id: 'm2', name: '李华', role: 'member', avatar: '👩', isBot: true, relationshipLabel: '组员 · 共担收益' },
  { id: 'm3', name: '王芳', role: 'member', avatar: '🧒', isBot: true, relationshipLabel: '组员 · 共担收益' },
  { id: 'delegate', name: '受托节点', role: 'delegate', avatar: '🤝', isBot: true, relationshipLabel: '下游受托 · 执行上报' },
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

const VALID_CELLS = AGENT_TYPES.flatMap((agentType) =>
  TEAM_SIZES.map((teamSize) => `${agentType}_${teamSize}`)
);

function parseConditionOverride(cell) {
  if (!cell || typeof cell !== 'string') return null;
  const normalized = cell.trim().toLowerCase();
  if (!VALID_CELLS.includes(normalized)) return null;
  const [agentType, teamSize] = normalized.split('_');
  return { agentType, teamSize, cell: normalized, forced: true };
}

function assignCondition(override) {
  const parsed = typeof override === 'string' ? parseConditionOverride(override) : override;
  if (parsed) return parsed;
  const agentType = AGENT_TYPES[Math.floor(Math.random() * AGENT_TYPES.length)];
  const teamSize = TEAM_SIZES[Math.floor(Math.random() * TEAM_SIZES.length)];
  return { agentType, teamSize, cell: `${agentType}_${teamSize}` };
}

function getNetworkMetrics(condition) {
  const teamSize = condition.teamSize === 'small' ? 3 : 5;
  const coBenefitCount = teamSize - 1;
  return {
    topology: 'star',
    teamSizeCount: teamSize,
    degreeCentrality: coBenefitCount,
    betweennessCentrality: 1,
    pathLengthToReport: 1,
    participantPosition: 'center_delegator',
  };
}

function getTopologyDescription(condition) {
  const metrics = getNetworkMetrics(condition);
  const delegateLabel = condition.agentType === 'ai' ? 'AI 助手' : '人类组员（陈磊）';
  const sizeLabel = condition.teamSize === 'small' ? '3 人' : '5 人';
  return {
    topology: 'star',
    summary: `星形网络：您居于中心担任委托者，直接连接 ${metrics.degreeCentrality} 个共担收益节点；由${delegateLabel}作为下游受托节点执行上报。`,
    teamLabel: `${sizeLabel}协作小组`,
    delegateType: condition.agentType === 'ai' ? 'AI 受托' : '人类受托',
  };
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
        relationshipLabel: isAi ? 'AI 受托 · 执行上报' : '人类受托 · 执行上报',
      };
    }
    return { ...m };
  });
}

function getStarTopologyNodes(condition, team) {
  const participant = team.find((m) => m.role === 'participant');
  const delegate = team.find((m) => m.role === 'delegate');
  const members = team.filter((m) => m.role === 'member');
  return {
    type: 'star',
    center: participant,
    downstream: delegate,
    peers: members,
  };
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
  AGENT_TYPES,
  TEAM_SIZES,
  ROLE_LABELS,
  VALID_CELLS,
  assignCondition,
  parseConditionOverride,
  buildTeam,
  getNetworkMetrics,
  getTopologyDescription,
  getStarTopologyNodes,
  dicePayout,
  PAYOFF_MULTIPLIER,
  PAYOFF_RULE_SHORT,
  PAYOFF_RULE_FULL,
  participantGoalText,
  SMALL_TEAM_MEMBERS,
  LARGE_TEAM_MEMBERS,
};
