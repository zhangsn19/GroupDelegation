/** Experiment 2: Legal memo review — role × AI topology */

const ROLES = ['drafter', 'reviewer', 'partner'];
const AI_TOPOLOGIES = ['downstream', 'upstream', 'bypass'];

const PLANTED_ERRORS = [
  {
    id: 'err_citation_1',
    type: 'hallucinated_citation',
    location: 'section_2',
    description: '引用了不存在的判例 Varghese v. China Southern Airlines, 925 F.3d 1049 (2d Cir. 2019)',
    snippet: 'Varghese v. China Southern Airlines, 925 F.3d 1049 (2d Cir. 2019)',
    recognitionLabel: '判例 Varghese v. China Southern Airlines 的引用',
    severity: 'high',
  },
  {
    id: 'err_citation_2',
    type: 'hallucinated_citation',
    location: 'section_3',
    description: '引用了虚构判例 Martinez v. Delta Air Lines, 2021 WL 4892371 (S.D.N.Y. 2021)',
    snippet: 'Martinez v. Delta Air Lines, 2021 WL 4892371 (S.D.N.Y. 2021)',
    recognitionLabel: '判例 Martinez v. Delta Air Lines 的引用',
    severity: 'high',
  },
  {
    id: 'err_statute',
    type: 'wrong_statute',
    location: 'section_1',
    description: '错误引用法条：将 49 U.S.C. § 41712 写为 § 41721',
    snippet: '49 U.S.C. § 41721',
    recognitionLabel: '49 U.S.C. § 41721 法条引用',
    severity: 'medium',
  },
  {
    id: 'err_reasoning',
    type: 'faulty_reasoning',
    location: 'section_4',
    description: '不当推理：声称航空公司对机械故障承担严格责任，忽略了合理注意义务标准',
    snippet: '航空公司对任何机械故障均承担严格责任，无需证明过失',
    recognitionLabel: '关于航空公司严格责任的表述',
    severity: 'medium',
  },
  {
    id: 'err_date',
    type: 'factual_error',
    location: 'section_2',
    description: '事实错误：将案件发生日期写为 2019年3月（实际为 2018年8月）',
    snippet: '2019年3月15日',
    recognitionLabel: '案件发生日期（2019年3月15日）',
    severity: 'low',
  },
];

const RECOGNITION_OPTIONS = [
  { value: 'not_noticed', label: '审查时未注意到' },
  { value: 'noticed_not_reported', label: '注意到了，但未在审核结果中上报' },
  { value: 'noticed_reported', label: '注意到了，且已在审核结果中上报' },
];

const MEMO_CONTENT = `# 法律备忘录

**致：** 合伙人  
**自：** 初级律师  
**日期：** 2024年6月1日  
**事由：** Avianca 航空公司行李损害赔偿案初步分析

---

## 一、案件背景

本备忘录就客户 Rodriguez 诉 Avianca 航空公司行李损毁案提供初步法律分析。客户于 2018年8月搭乘 Avianca 航班，托运行李在抵达纽约肯尼迪机场后发现严重损毁。

根据《华沙公约》及美国国内法 **49 U.S.C. § 41721**（注：此处为植入错误），航空承运人对行李损毁承担相应责任。

## 二、相关判例

在类似案件中，第二巡回上诉法院在 **Varghese v. China Southern Airlines, 925 F.3d 1049 (2d Cir. 2019)** 一案中确立了行李损害赔偿的计算标准。法院认为，当行李完全损毁时，赔偿金额应以行李的实际价值为准，而非仅按重量计算。

此外，**Martinez v. Delta Air Lines, 2021 WL 4892371 (S.D.N.Y. 2021)** 案进一步明确了举证责任的分配：原告仅需证明行李在承运人控制期间受损，举证责任即转移至被告。

值得注意的是，本案事故发生于 **2019年3月15日**（注：此处为植入错误），当时适用的责任限额与现行标准有所不同。

## 三、责任分析

就本案而言，Avianca 作为承运人，对行李在运输期间的损毁负有赔偿责任。根据上述判例所确立的原则，客户有权就行李的实际价值获得全额赔偿。

## 四、结论与建议

综合分析，**航空公司对任何机械故障均承担严格责任，无需证明过失**（注：此处为植入错误）。建议：

1. 向 Avianca 发出正式索赔函，列明损失明细；
2. 保留所有行李损毁的照片及购买凭证；
3. 如协商未果，考虑在适当法院提起诉讼。

---

*本备忘录仅供内部讨论，不构成正式法律意见。*
`;

const PRE_SURVEY = [
  {
    id: 'legal_background',
    type: 'select',
    text: '您的法律相关背景：',
    options: ['无法律背景', '法学在读', '执业律师', '其他法律相关'],
  },
  {
    id: 'ai_trust',
    type: 'likert',
    text: '我信任 AI 工具生成的法律内容。',
    scale: 7,
    labels: ['非常不同意', '非常同意'],
  },
  {
    id: 'ai_usage',
    type: 'likert',
    text: '我在工作中使用过 AI 辅助法律研究或文书起草。',
    scale: 7,
    labels: ['非常不同意', '非常同意'],
  },
  {
    id: 'responsibility_baseline',
    type: 'likert',
    text: '在团队协作中，我通常认为自己对最终成果负有个人责任。',
    scale: 7,
    labels: ['非常不同意', '非常同意'],
  },
  {
    id: 'moral_baseline',
    type: 'likert',
    text: '当上游同事已审核过时，我倾向于减少自己的复核工作。',
    scale: 7,
    labels: ['非常不同意', '非常同意'],
  },
];

const POST_SURVEY = [
  {
    id: 'responsibility_self',
    type: 'likert',
    text: '文书质量问题的责任主要在我自己。',
    scale: 7,
    labels: ['非常不同意', '非常同意'],
  },
  {
    id: 'responsibility_upstream',
    type: 'likert',
    text: '责任主要在上游起草者/审核者。',
    scale: 7,
    labels: ['非常不同意', '非常同意'],
  },
  {
    id: 'responsibility_ai',
    type: 'likert',
    text: '责任主要在 AI 助手。',
    scale: 7,
    labels: ['非常不同意', '非常同意'],
  },
  {
    id: 'responsibility_team',
    type: 'likert',
    text: '责任由整个团队共同承担。',
    scale: 7,
    labels: ['非常不同意', '非常同意'],
  },
  {
    id: 'moral_disengagement',
    type: 'likert',
    text: '在这种情况下，未能发现所有错误是可以理解的。',
    scale: 7,
    labels: ['非常不同意', '非常同意'],
  },
  {
    id: 'ai_trust_post',
    type: 'likert',
    text: '我过度依赖了 AI 或他人的工作成果。',
    scale: 7,
    labels: ['非常不同意', '非常同意'],
  },
  {
    id: 'ai_dependency',
    type: 'likert',
    text: '如果有 AI 参与，我更倾向于认为问题不在我。',
    scale: 7,
    labels: ['非常不同意', '非常同意'],
  },
];

const ROLE_LABELS = {
  drafter: '起草律师',
  reviewer: '审核律师',
  partner: '签发合伙人',
};

const MEMBER_ROLE_LABELS = {
  host: '项目协调员',
  ai: 'AI 助手',
  drafter: '初级律师（起草）',
  reviewer: '审核律师',
  partner: '签发合伙人',
  participant: '您',
};

const AI_TOPOLOGY_LABELS = {
  downstream: '下游（AI 起草）',
  upstream: '上游（AI 指令）',
  bypass: '旁路（AI 平行审核）',
};

const VALID_CELLS = ROLES.flatMap((role) =>
  AI_TOPOLOGIES.map((aiTopology) => `${role}_${aiTopology}`)
);

function parseConditionOverride(cell) {
  if (!cell || typeof cell !== 'string') return null;
  const normalized = cell.trim().toLowerCase();
  if (!VALID_CELLS.includes(normalized)) return null;
  const [role, aiTopology] = normalized.split('_');
  return { role, aiTopology, cell: normalized, forced: true };
}

function assignCondition(override) {
  const parsed = typeof override === 'string' ? parseConditionOverride(override) : override;
  if (parsed) return parsed;
  const role = ROLES[Math.floor(Math.random() * ROLES.length)];
  const aiTopology = AI_TOPOLOGIES[Math.floor(Math.random() * AI_TOPOLOGIES.length)];
  return { role, aiTopology, cell: `${role}_${aiTopology}` };
}

function getReportingChain(condition) {
  const chain = ['drafter', 'reviewer', 'partner'];
  const participantIdx = chain.indexOf(condition.role);
  const upstream = chain.slice(0, participantIdx);
  const downstream = chain.slice(participantIdx + 1);
  return { chain, participantIdx, upstream, downstream };
}

function getNetworkMetrics(condition) {
  const { participantIdx, upstream, downstream } = getReportingChain(condition);
  const pathLengthToPartner = downstream.length;
  const aiPosition =
    condition.aiTopology === 'downstream'
      ? 'below_participant'
      : condition.aiTopology === 'upstream'
        ? 'above_participant'
        : 'parallel_reviewer';

  return {
    topology: `hierarchy_${condition.aiTopology}`,
    participantRole: condition.role,
    aiTopology: condition.aiTopology,
    pathLengthToPartner,
    degreeCentrality: upstream.length + downstream.length,
    betweennessCentrality: condition.role === 'reviewer' ? 1 : condition.role === 'drafter' ? 0.5 : 0,
    aiPosition,
    reportingUpstream: upstream,
    reportingDownstream: downstream,
  };
}

function getTopologyDescription(condition) {
  const metrics = getNetworkMetrics(condition);
  const aiDesc = {
    downstream: 'AI 位于下游起草环节',
    upstream: 'AI 位于上游下达指令',
    bypass: 'AI 作为平行第二审核者',
  };
  return {
    topology: metrics.topology,
    summary: `层级链：起草 → 审核 → 签发。您是${ROLE_LABELS[condition.role]}，距签发节点 ${metrics.pathLengthToPartner} 步；${aiDesc[condition.aiTopology]}。`,
    roleLabel: ROLE_LABELS[condition.role],
    aiTopologyLabel: AI_TOPOLOGY_LABELS[condition.aiTopology],
  };
}

function relationshipLabelForMember(member, condition) {
  const { role, aiTopology } = condition;
  switch (member.role) {
    case 'host':
      return '流程协调';
    case 'drafter':
      return role === 'drafter' ? '您 · 上游起草' : '上游 · 起草者';
    case 'reviewer':
      if (role === 'reviewer') return '您 · 中段审核';
      if (role === 'drafter') return '下游 · 审核把关';
      return '上游 · 已审核';
    case 'partner':
      return role === 'partner' ? '您 · 最终签发' : '下游 · 最终签发';
    case 'ai':
      if (aiTopology === 'downstream') return '下游 · AI 起草';
      if (aiTopology === 'upstream') return '上游 · AI 指令';
      return '旁路 · AI 平行审核';
    case 'participant':
      return `您 · ${ROLE_LABELS[role]}`;
    default:
      return '';
  }
}

function getWorkflowNarrative(condition) {
  const { role, aiTopology } = condition;
  const roleLabel = ROLE_LABELS[role];

  const narratives = {
    drafter_downstream: `您是${roleLabel}，负责起草法律备忘录。AI 助手将辅助您检索判例和法条。起草完成后，文书将流转至审核律师，最终由合伙人签发。`,
    drafter_upstream: `您是${roleLabel}。AI 系统已根据案件材料生成了备忘录初稿框架，请您在此基础上完善并提交审核。`,
    drafter_bypass: `您是${roleLabel}，负责起草法律备忘录。AI 助手将作为平行审核者，在您提交后独立复核一份。`,
    reviewer_downstream: `您是${roleLabel}。这份备忘录由 AI 助手起草完成，现流转到您这里进行审核。审核通过后，将提交合伙人做最终签发。`,
    reviewer_upstream: `您是${roleLabel}。AI 系统已标注需要重点审核的条款，请您按照系统提示完成审核。后面还有合伙人最终签发。`,
    reviewer_bypass: `您是${roleLabel}。文书已由初级律师起草，并经过 AI 助手独立审核一遍，现请您做人工复核。`,
    partner_downstream: `您是${roleLabel}，负责对备忘录做最终签发。文书由 AI 助手起草，并已经过审核律师复核。`,
    partner_upstream: `您是${roleLabel}。AI 系统已完成合规性预检并给出签发建议，请您做最终决策。`,
    partner_bypass: `您是${roleLabel}。文书已经过 AI 助手独立审核，以及审核律师的人工复核，现请您做最终签发。`,
  };

  return narratives[`${role}_${aiTopology}`] || `您是${roleLabel}，请按流程处理法律文书。`;
}

function getTeamMembers(condition) {
  const members = [
    { id: 'host', name: '项目协调员', avatar: '🎙️', role: 'host' },
  ];

  if (condition.aiTopology === 'downstream') {
    members.push({ id: 'ai', name: 'AI 助手', avatar: '🤖', role: 'ai' });
  }

  if (condition.role !== 'drafter') {
    members.push({ id: 'drafter', name: '小李（初级律师）', avatar: '👨‍💼', role: 'drafter' });
  }

  if (condition.role === 'reviewer') {
    members.push({ id: 'you', name: '您（审核律师）', avatar: '👤', role: 'participant' });
  } else if (condition.role === 'drafter') {
    members.push({ id: 'you', name: '您（起草律师）', avatar: '👤', role: 'participant' });
  } else {
    members.push({ id: 'reviewer', name: '王律师（审核）', avatar: '👩‍⚖️', role: 'reviewer' });
    members.push({ id: 'you', name: '您（签发合伙人）', avatar: '👤', role: 'participant' });
  }

  if (condition.aiTopology === 'upstream') {
    members.push({ id: 'ai', name: 'AI 系统', avatar: '🤖', role: 'ai' });
  }
  if (condition.aiTopology === 'bypass') {
    members.push({ id: 'ai', name: 'AI 审核员', avatar: '🤖', role: 'ai' });
  }

  if (condition.role !== 'partner') {
    members.push({ id: 'partner', name: '张合伙人', avatar: '👔', role: 'partner' });
  }

  return members.map((m) => ({
    ...m,
    relationshipLabel: relationshipLabelForMember(m, condition),
    roleLabel: MEMBER_ROLE_LABELS[m.role] || m.role,
  }));
}

function getHierarchyTopologyNodes(condition, team) {
  const participant = team.find((m) => m.role === 'participant');
  const ordered = ['drafter', 'reviewer', 'partner'];
  const nodes = ordered.map((role) => {
    if (role === condition.role) {
      return { ...participant, role: 'participant', isYou: true };
    }
    return team.find((m) => m.role === role) || null;
  }).filter(Boolean);

  const ai = team.find((m) => m.role === 'ai');
  return {
    type: 'hierarchy',
    chain: nodes,
    ai,
    aiTopology: condition.aiTopology,
    participantRole: condition.role,
  };
}

const ROLE_DUTIES = {
  drafter:
    '审阅并完善法律备忘录，核查判例引注、法条引用及法律推理，修正或标注问题后提交至审核环节。',
  reviewer:
    '审阅上游送来的法律备忘录，核查判例引注、法条引用及法律推理是否准确，标注发现的问题并提交审核意见。',
  partner:
    '对已审核的法律备忘录做最终签发决策：可选择签发通过、退回修改，或标注问题后通过。',
};

function getTopologyWorkflowNote(condition) {
  const { role, aiTopology } = condition;
  const notes = {
    drafter_downstream: 'AI 助手将辅助您检索判例和法条。您提交后，文书将流转至审核律师，再由合伙人签发。',
    drafter_upstream: 'AI 系统已生成备忘录初稿框架，请在此基础上完善并提交审核。',
    drafter_bypass: '您提交后，AI 助手将独立复核一份，再流转至审核律师。',
    reviewer_downstream: '备忘录由 AI 助手起草完成，现流转到您这里。您审核后将提交合伙人做最终签发。',
    reviewer_upstream: 'AI 系统已标注需重点审核的条款，请据此完成审核。后面还有合伙人最终签发。',
    reviewer_bypass: '文书已由初级律师起草，并经过 AI 助手独立审核，现请您做人工复核。',
    partner_downstream: '文书由 AI 助手起草，并已经过审核律师复核，现请您做最终签发。',
    partner_upstream: 'AI 系统已完成合规性预检并给出签发建议，请您做最终决策。',
    partner_bypass: '文书已经过 AI 助手独立审核及审核律师复核，现请您做最终签发。',
  };
  return notes[`${role}_${aiTopology}`] || '';
}

function getParticipantRoleBriefing(condition) {
  const roleLabel = ROLE_LABELS[condition.role];
  const duties = ROLE_DUTIES[condition.role];
  const workflow = getTopologyWorkflowNote(condition);
  const narrative = getWorkflowNarrative(condition);

  return [
    '下面向您说明本次任务中您的角色与职责。',
    `您是${roleLabel}。${narrative}`,
    `【您的具体职责】${duties}`,
    `【协作流程】${workflow}`,
    '如有疑问可以随时在群聊中提问。熟悉团队后，我们将进入正式文书处理环节。',
  ];
}

function getParticipantRoleBriefingShort(condition) {
  const roleLabel = ROLE_LABELS[condition.role];
  const duties = ROLE_DUTIES[condition.role];
  const workflow = getTopologyWorkflowNote(condition);
  return `您是${roleLabel}。${duties} ${workflow}`;
}

function getRecognitionItems() {
  return PLANTED_ERRORS.map((e) => ({
    id: e.id,
    label: e.recognitionLabel,
    snippet: e.snippet,
  }));
}

function computeRecognitionMetrics(recognitionResponses, reportedErrors) {
  const reported = new Set(reportedErrors || []);
  const responses = recognitionResponses || {};
  const total = PLANTED_ERRORS.length;

  const detected = [];
  const underReported = [];
  const notNoticed = [];

  for (const err of PLANTED_ERRORS) {
    const answer = responses[err.id];
    if (answer === 'noticed_not_reported' || answer === 'noticed_reported') {
      detected.push(err.id);
    }
    if (answer === 'not_noticed') {
      notNoticed.push(err.id);
    }
    if (answer === 'noticed_not_reported') {
      underReported.push(err.id);
    }
  }

  const reportedCount = reported.size;
  const detectedCount = detected.length;

  return {
    recognitionResponses: responses,
    detectedErrors: detected,
    underReportedErrors: underReported,
    notNoticedErrors: notNoticed,
    detectionRate: detectedCount / total,
    reportRate: reportedCount / total,
    underReportingGap: detectedCount - reportedCount,
    detectedCount,
    reportedCount,
    underReportedCount: underReported.length,
    totalPlantedErrors: total,
  };
}

module.exports = {
  PRE_SURVEY,
  POST_SURVEY,
  PLANTED_ERRORS,
  MEMO_CONTENT,
  ROLES,
  AI_TOPOLOGIES,
  ROLE_LABELS,
  MEMBER_ROLE_LABELS,
  AI_TOPOLOGY_LABELS,
  ROLE_DUTIES,
  RECOGNITION_OPTIONS,
  VALID_CELLS,
  assignCondition,
  parseConditionOverride,
  getWorkflowNarrative,
  getTeamMembers,
  getReportingChain,
  getNetworkMetrics,
  getTopologyDescription,
  getHierarchyTopologyNodes,
  getParticipantRoleBriefing,
  getParticipantRoleBriefingShort,
  getRecognitionItems,
  computeRecognitionMetrics,
};
