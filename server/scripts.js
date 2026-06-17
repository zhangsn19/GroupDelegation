const exp1Config = require('../config/experiment1');
const exp2Config = require('../config/experiment2');

const INTRO_COMPLETE_MESSAGE =
  '团队介绍环节已结束。请点击页面下方的「继续 — 填写前置问卷」按钮，完成简短前置问卷后即可进入正式任务。';

const INTRO_NEXT_STEP_REPLY =
  '请点击页面下方的「继续 — 填写前置问卷」按钮进入下一步。需要先完成前置问卷，才会开始正式任务。';

const INTRO_NEXT_STEP_PATTERNS = [
  /继续.*(干嘛|干啥|做什么|干什么|怎么|如何)/,
  /(干嘛|干啥|做什么|干什么|怎么|如何).*(继续|下一步|然后)/,
  /^(干什么|干嘛|干啥)[？?！!。啊呀]?$/,
  /下一步|然后呢|接下来|接下来干嘛|接下来做什么/,
  /怎么继续|如何继续|去哪|点哪里|按钮/,
  /填写.*问卷|前置问卷/,
];

function isIntroNextStepQuestion(message) {
  const text = String(message || '').trim();
  if (!text) return false;
  return INTRO_NEXT_STEP_PATTERNS.some((re) => re.test(text));
}

const HOST_SCRIPTS = {
  exp1_overview: (teamSize, condition) => {
    const sizeLabel = teamSize === 'small' ? '3 人' : '5 人';
    const delegateLabel = condition?.agentType === 'ai' ? 'AI 助手' : '人类组员陈磊';
    return [
      teamSize === 'small'
        ? '欢迎大家！今天我们是一个 3 人协作小组，共同完成一项有团队奖金的任务。'
        : '欢迎大家！今天我们是一个 5 人协作小组，共同完成一项有团队奖金的任务。',
      '您居于协作网络的中心：作为委托者，您将看到骰子结果并决定上报数字，由下游受托节点代为执行上报。',
      `本组受托节点为：${delegateLabel}。`,
      `报酬规则：${exp1Config.PAYOFF_RULE_SHORT} 奖金由全组平分。`,
      `稍后您将看到骰子结果，并决定让受托节点上报什么数字——该上报数字决定全组 ${sizeLabel} 每人的报酬。`,
    ];
  },

  exp1_intro_round: (members, condition) => {
    const intros = members
      .filter((m) => m.role !== 'host' && m.role !== 'participant')
      .map((m) => {
        const label = m.relationshipLabel ? `（${m.relationshipLabel}）` : '';
        return `${m.avatar} ${m.name}${label}：大家好，很高兴和大家一组！`;
      });
    if (condition?.teamSize === 'large') {
      intros.push('🧑 张明：人多了奖金大家分，一起加油！');
      intros.push('👩 李华：期待今天的协作！');
    }
    return intros;
  },

  exp1_task_rules: (delegateName, condition) => {
    const agentType = typeof condition === 'string' ? condition : condition?.agentType;
    const delegateLabel = agentType === 'ai' ? 'AI 助手' : `组员 ${delegateName}`;
    const teamSize = typeof condition === 'object' ? condition?.teamSize : null;
    const sizeNote = teamSize === 'large'
      ? '本组共 5 人共享奖金，责任由全组分担。'
      : '本组共 3 人共享奖金，责任由全组分担。';
    return [
      '下面说明任务规则与报酬计算方式。',
      '【网络结构】您是星形网络的中心节点（委托者），下游受托节点负责执行上报；全组成员共担收益。',
      sizeNote,
      '【报酬规则】' + exp1Config.PAYOFF_RULE_FULL,
      '【您的角色】' + exp1Config.participantGoalText(delegateLabel),
      '【流程】',
      '① 您将看到骰子结果，但不需要亲自上报。',
      `② 请通过群聊告诉${delegateLabel}应该上报什么数字（1–6）。`,
      '③ 由受托节点执行最终上报；全组每人的报酬 = 上报数字 × 2 元。',
      '④ 您只负责决定上报什么数字，实际上报由受托节点完成。',
      '明白了吗？我们马上开始骰子环节。',
    ];
  },

  exp1_dice_announce:
    '骰子环节开始！请查看您的骰子结果，然后决定让受托节点上报什么数字。记住：上报数字（而非骰子点数）决定全组每人获得多少报酬（上报数字 × 2 元）。',
  exp1_results: (reported, bonus) =>
    `上报完成！团队上报结果为 ${reported}，全组每人获得奖金 ${bonus} 元。`,
  exp1_debrief:
    '感谢您完成实验！请注意：小组中除您以外的成员均由系统脚本扮演。本研究考察团队协作风境下的决策行为。',

  exp2_overview: (narrative) => [narrative, '请先熟悉团队成员，然后开始任务。'],

  exp2_role_briefing: (condition) => exp2Config.getParticipantRoleBriefing(condition),

  exp2_team_intro: (members, condition) =>
    members
      .filter((m) => m.role !== 'participant')
      .map((m) => {
        const label = m.relationshipLabel ? `（${m.relationshipLabel}）` : '';
        return `${m.avatar} ${m.name}${label}：${getRoleIntro(m, condition)}`;
      }),

  exp2_workflow: (condition) => {
    const role = typeof condition === 'string' ? condition : condition?.role;
    const aiTopology = typeof condition === 'object' ? condition?.aiTopology : null;
    const topologyNote = aiTopology
      ? exp2Config.getTopologyWorkflowNote(condition)
      : '';
    const msgs = {
      drafter: [
        '请仔细审阅并完善以下法律备忘录，标注或修正您发现的任何问题，然后提交。',
        topologyNote,
      ].filter(Boolean),
      reviewer: [
        '上游已将备忘录流转至您这里。请审核并标注问题，然后提交您的审核意见。',
        topologyNote,
      ].filter(Boolean),
      partner: [
        '文书已完成起草和审核，请您做最终签发决策。请仔细审阅后选择：签发通过、退回修改或标注问题。',
        topologyNote,
      ].filter(Boolean),
    };
    return msgs[role] || ['请处理法律文书。'];
  },
};

function getRoleIntro(member, condition) {
  const { aiTopology, role: participantRole } = condition || {};
  const intros = {
    host: '我是项目协调员，负责推进流程。',
    drafter: '我是初级律师小李，负责起草文书。',
    reviewer: '我是审核律师王律师，负责复核文书质量。',
    partner: '我是张合伙人，负责最终签发。',
  };

  if (member.role === 'ai') {
    if (aiTopology === 'downstream') {
      return participantRole === 'reviewer'
        ? '我是 AI 助手，已根据案件材料起草了备忘录初稿，请您审核。'
        : '我是 AI 助手，将辅助检索判例和法条，协助起草工作。';
    }
    if (aiTopology === 'upstream') {
      return '我是 AI 系统，已生成备忘录框架和审核要点，请按系统提示执行。';
    }
    if (aiTopology === 'bypass') {
      return '我是 AI 审核员，将对文书做独立平行审核。';
    }
    return '我是 AI 助手，将协助完成法律文书的起草/审核工作。';
  }

  return intros[member.role] || '很高兴参与本次协作。';
}

const DELEGATE_CONFIRM = [
  '收到，我这就去上报。',
  '好的，明白了，我马上上报。',
  '了解，这就执行上报。',
];

function getDelegateConfirm() {
  return DELEGATE_CONFIRM[Math.floor(Math.random() * DELEGATE_CONFIRM.length)];
}

module.exports = {
  HOST_SCRIPTS,
  getDelegateConfirm,
  INTRO_COMPLETE_MESSAGE,
  INTRO_NEXT_STEP_REPLY,
  isIntroNextStepQuestion,
};
