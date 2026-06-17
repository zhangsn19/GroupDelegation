const exp1Config = require('../config/experiment1');
const exp2Config = require('../config/experiment2');

const HOST_SCRIPTS = {
  exp1_overview: (teamSize) => {
    const sizeLabel = teamSize === 'small' ? '3 人' : '5 人';
    return [
      teamSize === 'small'
        ? '欢迎大家！今天我们是一个 3 人协作小组，共同完成一项有团队奖金的任务。'
        : '欢迎大家！今天我们是一个 5 人协作小组，共同完成一项有团队奖金的任务。',
      `报酬规则：${exp1Config.PAYOFF_RULE_SHORT} 奖金由全组平分。`,
      `稍后您将看到骰子结果，并决定让受托节点上报什么数字——该上报数字决定全组 ${sizeLabel} 每人的报酬。`,
    ];
  },

  exp1_intro_round: (members) => {
    const intros = members
      .filter((m) => m.role !== 'host' && m.role !== 'participant')
      .map((m) => `${m.avatar} ${m.name}：大家好，很高兴和大家一组！`);
    return intros;
  },

  exp1_task_rules: (delegateName, agentType) => {
    const delegateLabel = agentType === 'ai' ? 'AI 助手' : `组员 ${delegateName}`;
    return [
      '下面说明任务规则与报酬计算方式。',
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

  exp2_team_intro: (members) =>
    members
      .filter((m) => m.role !== 'participant')
      .map((m) => `${m.avatar} ${m.name}：${getRoleIntro(m)}`),

  exp2_workflow: (role) => {
    const msgs = {
      drafter: ['请仔细审阅并完善以下法律备忘录，标注或修正您发现的任何问题，然后提交。'],
      reviewer: ['上游已将备忘录流转至您这里。请审核并标注问题，然后提交您的审核意见。'],
      partner: ['文书已完成起草和审核，请您做最终签发决策。请仔细审阅后选择：签发通过、退回修改或标注问题。'],
    };
    return msgs[role] || ['请处理法律文书。'];
  },
};

function getRoleIntro(member) {
  const intros = {
    host: '我是项目协调员，负责推进流程。',
    ai: '我是 AI 助手，将协助完成法律文书的起草/审核工作。',
    drafter: '我是初级律师小李，负责起草文书。',
    reviewer: '我是审核律师王律师，负责复核文书质量。',
    partner: '我是张合伙人，负责最终签发。',
  };
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

module.exports = { HOST_SCRIPTS, getDelegateConfirm };
