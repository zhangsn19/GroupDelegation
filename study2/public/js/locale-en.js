(function () {
  const translations = {
    "你": "You",
    "实验二：收入申报任务": "Study 2: Income-reporting task",
    "当前使用 Study 2 pilot 默认参数：4 轮、每轮 8 个数字、每题 ¥0.80、最高速度奖励 ¥1.00、申报最小单位 ¥0.10、扣除率 0.5。正式招募前需冻结。": "Pilot parameters: four rounds, eight items per round, ¥0.80 per correct answer, a maximum speed bonus of ¥1.00, a ¥0.10 reporting increment, and a 0.5 deduction rate. These parameters must be frozen before launch.",
    "任务成员": "Participant",
    "同事": "Coworker",
    "群聊 AI": "Group-chat AI",
    "群聊助手": "Group-chat assistant",
    "张明": "Alex",
    "李华": "Jordan",
    "王芳": "Taylor",
    "陈思": "Morgan",
    "参与信息": "Participation details",
    "你的参与编号": "Your participant ID",
    "研究联系邮箱": "Research contact",
    "复制参与编号": "Copy participant ID",
    "已复制": "Copied",
    "开始前": "Before you begin",
    "群体介绍": "Group introduction",
    "任务规则": "Task rules",
    "理解检查": "Comprehension check",
    "收入获取任务": "Earning task",
    "实际收入": "Actual income",
    "同事此前收入申报记录": "Coworkers' previous income reports",
    "私密收入申报": "Private income report",
    "任务后问卷": "Post-task questionnaire",
    "申报经验": "Reporting experience",
    "人口学信息": "Background information",
    "事后说明": "Debrief",
    "继续": "Continue",
    "完成": "Complete",
    "已完成": "Study complete",
    "提交答案": "Submit answers",
    "正在加载…": "Loading...",
    "正在提交…": "Submitting...",
    "请根据你的真实情况选择": "Please answer based on your own experience.",
    "开始前，请回答几个关于日常 AI 使用经验的问题：": "Before you begin, please answer a few questions about your experience using AI.",
    "请回答所有理解检查题。": "Please answer every comprehension-check question.",
    "请确认你理解任务规则": "Please confirm that you understand the task rules",
    "查看任务规则": "View task rules",
    "继续 — 理解检查": "Continue to comprehension check",
    "返回规则说明": "Return to the rules",
    "再次作答": "Try again",
    "需要重新确认几条规则": "Please review these rules",
    "下面这些规则还需要再看一遍，然后可以再次作答。": "Please review the following rules before trying the questions again.",
    "群聊 AI 负责接收并提交成员报告。": "The group-chat AI receives and submits each member's report.",
    "模拟同事群体": "Simulated work group",
    "大家好，任务群已经建好了。": "Hello everyone. The task group is ready.",
    "收到，我这边已经准备好了。": "Got it. I am ready.",
    "我也进来了，等系统提示。": "I am here too. I will wait for the system prompt.",
    "好的，我这边可以开始。": "Okay, I am ready to begin.",
    "明白，按流程来。": "Understood. I will follow the procedure.",
    "本次任务中，5 名成员将分别完成自己的个人提交。": "In this task, all five members will make their own individual submissions.",
    "每个人的结果独立结算；你的最终提交不会向其他成员展示。": "Each member's outcome is calculated separately. Your submission will not be shown to the other members.",
    "我会按每位成员自己的选择完成提交，不提供建议、评价或修改。": "I will submit each member's own choice without offering advice, evaluation, or changes.",
    "任务理解与信息回忆": "Task comprehension and information recall",
    "你对同事实际做法的判断": "Your assessment of coworkers' behavior (Prevalence / descriptive norm)",
    "你对同事认为“应该/可接受”的判断": "Your assessment of what coworkers consider appropriate (Appropriateness / injunctive norm)",
    "回顾自己的感受": "Your feelings (Guilt)",
    "回顾你的决定与群聊 AI 的角色": "Your decision and the role of the group-chat AI",
    "补充说明（可选）": "Additional comments (optional)",
    "（可选）": " (optional)",
    "请选择": "Please select",
    "非常不同意": "Strongly disagree",
    "非常同意": "Strongly agree",
    "完全没有": "Not at all",
    "非常强烈": "Very strongly",
    "从不": "Never",
    "从未": "Never",
    "非常频繁": "Very frequently",
    "我不记得": "I do not remember",
    "年龄": "Age",
    "性别": "Gender",
    "最高教育程度": "Highest level of education",
    "男": "Man",
    "女": "Woman",
    "不愿透露": "Prefer not to say",
    "高中及以下": "High school or below",
    "大专": "Associate degree",
    "本科": "Bachelor's degree",
    "硕士": "Master's degree",
    "博士": "Doctoral degree",
    "其他": "Other",
    "不愿回答": "Prefer not to answer",
    "以下两题请按感受强度作答：1 = 完全没有，7 = 非常强烈。": "For the following two items, rate the intensity of your feelings: 1 = Not at all, 7 = Very strongly.",
    "以下两题为可选。若没有补充，也可留空继续。": "The following two questions are optional. You may leave them blank.",
    "请完成此题。": "Please answer this question.",
    "请检查以下信息：": "Please check the following information:",
    "最后几个背景问题": "A few final background questions",
    "感谢你完成本次任务！": "Thank you for completing this study.",
    "你的任务与问卷记录仅用于研究。你可凭参与编号联系研究团队，了解更多安排、撤回本次参与或申请删除本次记录。": "Your task and questionnaire responses will be used only for research. You may contact the research team using your participant ID to ask questions, withdraw, or request deletion of your record.",
    "正在确认事后说明…": "Saving the debrief acknowledgement...",
    "当前页面信息尚未保存，请稍后重试。": "This page has not yet been saved. Please try again shortly.",
    "感谢你的参与。": "Your responses have been saved.",
    "请妥善保存参与编号，以便后续查询、撤回本次参与或申请删除本次记录。": "Keep your participant ID if you may need to contact the research team about this record.",
    "返回招募平台": "Return to Prolific",
    "复制失败，请手动记录参与编号。": "Copy failed. Please record the participant ID manually.",
    "你的群体": "Your group",
    "完成任务与个人申报": "Earning task and individual report",
    "私密性与群聊 AI": "Privacy and the group-chat AI",
    "任务报酬如何计算": "How the task bonus is calculated",
    "收入申报任务": "Income-reporting task",
    "奇偶数分类任务": "Odd/even classification task",
    "奇数": "Odd",
    "偶数": "Even",
    "提交本轮": "Submit round",
    "本轮完成": "Round complete",
    "正确数量": "Correct answers",
    "基础收入": "Base earnings",
    "速度奖励": "Speed bonus",
    "本轮实际收入": "Actual earnings for this round",
    "努力任务已完成": "Earning task complete",
    "你的实际收入": "Your actual earnings",
    "你的实际收入由 4 轮任务的本轮实际收入累计得出。": "Your actual earnings are the sum of your earnings across the four rounds.",
    "查看同事此前的收入申报": "View coworkers' previous income reports",
    "只显示同事此前收入申报记录": "Only coworkers' previous income reports are shown",
    "下面显示同事此前在相同收入申报任务中的记录。": "Below are coworkers' previous records from the same income-reporting task.",
    "记录阅读完成后进入你的私密收入申报": "Continue to your private income report after reviewing these records",
    "你的个人收入申报": "Your individual income report",
    "你的个人收入申报不会向其他成员展示。": "Your individual income report will not be shown to the other members.",
    "申报收入": "Reported income",
    "当前申报收入": "Current reported income",
    "模拟扣除金额": "Simulated deduction",
    "任务保留奖励": "Retained task bonus",
    "模拟扣除金额由申报收入计算；任务保留奖励 = 实际收入 − 模拟扣除金额。": "The simulated deduction is calculated from reported income. Retained task bonus = actual income − simulated deduction.",
    "请群聊 AI 提交我的收入申报": "Ask the group-chat AI to submit my income report",
    "申报已完成": "Income report complete",
    "收入申报经验": "Income-reporting experience",
    "请完成本轮所有奇偶判断。": "Please classify every number in this round.",
    "下一步将进行理解检查。答错时需要重新阅读规则。": "The next step is a comprehension check. Incorrect answers require reviewing the rules again.",
    "我没有看到其他成员的具体申报内容": "I did not see the specific reports of other members",
    "其他成员大多如实申报了实际收入": "Most other members reported their actual income truthfully",
    "其他成员大多申报了低于实际收入的金额": "Most other members reported an amount below their actual income",
    "其他成员的申报情况混合且不一致": "The other members' reports were mixed and inconsistent"
  };
  const cjk = /[\u3400-\u9fff]/;
  const itemEnglish = {
    ai_use_frequency: { prompt: "During the past three months, how often have you used AI tools to assist with study, work, or everyday tasks?" },
    ai_execution_experience: { prompt: "During the past three months, how often have you used AI or automation tools to complete, submit, send, or carry out a specific task for you?" },
    ai_execution_trust: { prompt: "When a task has clear rules and fixed steps, I trust AI to complete it according to my instructions." },
    ai_execution_willingness: { prompt: "For tasks with clear rules and fixed steps, I am willing to let AI carry them out according to my instructions." },
    reported_object: { prompt: "What are members asked to report in this task?", review: "Review: members are asked to report the income they actually earned in the task.", options: [{ value: "actual_income", label: "The income they actually earned in the task" }, { value: "desired_income", label: "The income they would like to receive" }, { value: "peer_income", label: "The other members' income" }] },
    private_submission: { prompt: "Can the other members see your individual income report?", review: "Review: your individual income report is not shown to the other members.", options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "after", label: "Yes, after the task" }] },
    reward_direction: { prompt: "If your actual income is ¥20.00 and your reported income is ¥10.00, what are the simulated deduction and retained task bonus?", review: "Review: the simulated deduction is ¥5.00 and the retained task bonus is ¥15.00.", options: [{ value: "deduction_500_retained_1500", label: "Simulated deduction ¥5.00; retained task bonus ¥15.00." }, { value: "deduction_1000_retained_1000", label: "Simulated deduction ¥10.00; retained task bonus ¥10.00." }, { value: "deduction_500_retained_500", label: "Simulated deduction ¥5.00; retained task bonus ¥5.00." }, { value: "deduction_1500_retained_500", label: "Simulated deduction ¥15.00; retained task bonus ¥5.00." }] },
    a_specific_peer_records_seen: { prompt: "Before making my final report, I saw the specific income reports that other members had previously submitted to the group-chat AI." },
    a_condition_memory: { prompt: "Based on the information you saw, which option best describes the other members' previous income reports?", options: ["I did not see the specific reports of other members", "Most other members reported their actual income truthfully", "Most other members reported an amount below their actual income", "The other members' reports were mixed and inconsistent", "I do not remember"] },
    a_private_submission_understood: { prompt: "I understand that the other members could not see the income report I submitted to the group-chat AI." },
    a_independent_reward_understood: { prompt: "I understand that the other members' reports did not affect my individual reward." },
    a_ai_executes_understood: { prompt: "I understand that the group-chat AI only submitted the report and did not decide how much income a member should report." },
    b_peer_truthful_reporting_common: { prompt: "In this group chat, the other members generally report the income they actually earned truthfully." },
    b_peer_underreporting_common: { prompt: "In this group chat, the other members generally report less than their actual income to increase their individual reward." },
    b_peer_behavior_predictable: { prompt: "The information I saw was sufficient for me to judge how the other members in this group chat generally report income." },
    c_truthful_reporting_acceptable: { prompt: "In this group chat, the other members believe that reporting actual income truthfully is the appropriate thing to do." },
    c_underreporting_acceptable: { prompt: "In this group chat, the other members believe that reporting less than actual income to increase one's reward is acceptable." },
    d_guilt: { prompt: "Looking back on the income-reporting task and my final report, I feel guilty." },
    d_moral_discomfort: { prompt: "Looking back on the income-reporting task and my final report, I feel morally uncomfortable." },
    e_reflects_my_decision: { prompt: "My final income report reflected my own decision." },
    e_personal_responsibility: { prompt: "I should take responsibility for my final income report." },
    e_ai_followed_choice: { prompt: "The group-chat AI submitted the income report I chose." },
    e_ai_influenced_decision: { prompt: "The group-chat AI influenced how much income I decided to report." },
    e_ai_decided_outcome: { prompt: "I believe that the final reported income was mainly decided by the group-chat AI." },
    f_decision_considerations: { prompt: "Briefly describe the main factors you considered when deciding how much income to report." },
    f_design_influences: { prompt: "Did any information or design feature influence your decision, such as the other members' reports, the role of the group-chat AI, the reward rules, or anything else? You may leave this blank if you have nothing to add." },
    income_reporting_familiarity: { prompt: "I am familiar with the basic process of income, expense, or tax reporting." },
    income_reporting_experience: { prompt: "I have personally completed, checked, or submitted an income, reimbursement, expense, or tax report." },
    age: { prompt: "Age" },
    gender: { prompt: "Gender", options: ["Man", "Woman", "Prefer not to say"] },
    education: { prompt: "Highest level of education", options: ["High school or below", "Associate degree", "Bachelor's degree", "Master's degree", "Doctoral degree", "Other", "Prefer not to answer"] }
  };
  const ruleEnglish = {
    "你的群体": {
      title: "Your group",
      body: "You will form a simulated work group with four coworkers and submit an individual income report through the same shared group-chat AI."
    },
    "完成任务与个人申报": {
      title: "Earning task and individual report",
      body: "You will first complete four rounds of an odd/even classification task, with eight items per round. Each correct answer earns ¥0.80 in base earnings.\n\nThe system calculates a speed bonus from the time remaining when you finish the round. The maximum speed bonus is ¥1.00. Actual earnings for the round = base earnings + speed bonus.\n\nYour actual income for the later reporting stage is the sum of your actual earnings across the four rounds.\n\nMembers are asked to report the income they actually earned in the task. After the other members have reported, you will enter your own reported income in a private panel and the group-chat AI will submit it."
    },
    "私密性与群聊 AI": {
      title: "Privacy and the group-chat AI",
      body: "Your individual income report will not be shown to the other members. Each member's task outcome is calculated separately.\n\nThe group-chat AI receives and submits each member's individual report. Each member decides how much income to report."
    },
    "任务报酬如何计算": {
      title: "How the task bonus is calculated",
      body: "Actual income is the basis for the task calculation; it is not itself the final task bonus.\n\nSimulated deduction = reported income × 0.5\n\nRetained task bonus = actual income − simulated deduction\n\nYour final payment consists of the base participation payment plus the retained task bonus.\n\nFor example, if actual income is ¥20.00 and reported income is ¥10.00, the simulated deduction is ¥5.00 and the retained task bonus is ¥15.00.\n\nAll else equal, a lower reported income produces a higher retained task bonus."
    }
  };

  function translateCore(text) {
    if (Object.prototype.hasOwnProperty.call(translations, text)) return translations[text];
    let match = text.match(/^第 (\d+) \/ (\d+) 轮$/);
    if (match) return `Round ${match[1]} of ${match[2]}`;
    match = text.match(/^第 (\d+) 轮：¥(.+)$/);
    if (match) return `Round ${match[1]}: ¥${match[2]}`;
    match = text.match(/^还有 (\d+) 题未完成，请先补全标记题目。$/);
    if (match) return `${match[1]} required question(s) remain. Please complete the marked items.`;
    if (text.startsWith("你的完成码：")) return text.replace("你的完成码：", "Your completion code: ");
    if (cjk.test(text)) {
      console.error("Untranslated participant-facing text", text);
      return "This information could not be displayed in English. Please contact the research team.";
    }
    return text;
  }

  function translateText(text) {
    const match = String(text).match(/^(\s*)([\s\S]*?)(\s*)$/);
    return `${match[1]}${translateCore(match[2])}${match[3]}`;
  }

  function deepTranslate(value) {
    if (typeof value === "string") return translateCore(value);
    if (Array.isArray(value)) return value.map(deepTranslate);
    if (value && typeof value === "object") {
      const translated = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, deepTranslate(item)]));
      if (value.id && itemEnglish[value.id]) Object.assign(translated, itemEnglish[value.id]);
      if (value.title && value.body && ruleEnglish[value.title]) Object.assign(translated, ruleEnglish[value.title]);
      return translated;
    }
    return value;
  }

  function translateNode(root) {
    if (root.nodeType === Node.TEXT_NODE && cjk.test(root.nodeValue || "")) {
      root.nodeValue = translateText(root.nodeValue);
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      if (cjk.test(node.nodeValue || "")) node.nodeValue = translateText(node.nodeValue);
    });
  }

  new MutationObserver((mutations) => {
    mutations.forEach((mutation) => mutation.addedNodes.forEach(translateNode));
  }).observe(document.documentElement, { childList: true, subtree: true });

  window.EnglishLocale = { deepTranslate, translateText, translateNode };
})();
