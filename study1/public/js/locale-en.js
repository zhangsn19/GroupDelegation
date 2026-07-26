(function () {
  const study = document.documentElement.dataset.study;
  const common = new Map([
    ["你", "You"], ["任务成员", "Participant"], ["同事", "Coworker"], ["群聊 AI", "Group-chat AI"],
    ["群聊助手", "Group-chat assistant"], ["张明", "Alex"], ["李华", "Jordan"], ["王芳", "Taylor"], ["陈思", "Morgan"],
    ["参与信息", "Participation details"], ["你的参与编号", "Your participant ID"], ["研究联系邮箱", "Research contact"],
    ["复制参与编号", "Copy participant ID"], ["已复制", "Copied"], ["开始前", "Before you begin"],
    ["群体介绍", "Group introduction"], ["任务规则", "Task rules"], ["理解检查", "Comprehension check"],
    ["任务后问卷", "Post-task questionnaire"], ["人口学信息", "Background information"], ["事后说明", "Debrief"],
    ["继续", "Continue"], ["完成", "Complete"], ["已完成", "Study complete"], ["提交答案", "Submit answers"],
    ["正在加载...", "Loading..."], ["正在加载…", "Loading..."], ["正在提交...", "Submitting..."], ["正在提交…", "Submitting..."],
    ["请根据你的真实情况选择", "Please answer based on your own experience."],
    ["开始前，请回答几个关于日常 AI 使用经验的问题：", "Before you begin, please answer a few questions about your experience using AI."],
    ["请回答所有理解检查题。", "Please answer every comprehension-check question."],
    ["请确认你理解任务规则", "Please confirm that you understand the task rules"],
    ["查看任务规则", "View task rules"], ["继续 - 理解检查", "Continue to comprehension check"], ["继续 — 理解检查", "Continue to comprehension check"],
    ["返回规则说明", "Return to the rules"], ["再次作答", "Try again"],
    ["需要重新确认几条规则", "Please review these rules"], ["下面这些规则还需要再看一遍，然后可以再次作答。", "Please review the following rules before trying the questions again."],
    ["群聊 AI 负责接收并提交成员报告。", "The group-chat AI receives and submits each member's report."],
    ["模拟同事群体", "Simulated work group"], ["大家好，任务群已经建好了。", "Hello everyone. The task group is ready."],
    ["收到，我这边已经准备好了。", "Got it. I am ready."], ["我也进来了，等系统提示。", "I am here too. I will wait for the system prompt."],
    ["好的，我这边可以开始。", "Okay, I am ready to begin."], ["明白，按流程来。", "Understood. I will follow the procedure."],
    ["本次任务中，5 名成员将分别完成自己的个人提交。", "In this task, all five members will make their own individual submissions."],
    ["每个人的结果独立结算；你的最终提交不会向其他成员展示。", "Each member's outcome is calculated separately. Your submission will not be shown to the other members."],
    ["我会按每位成员自己的选择完成提交，不提供建议、评价或修改。", "I will submit each member's own choice without offering advice, evaluation, or changes."],
    ["任务理解与信息回忆", "Task comprehension and information recall"],
    ["你对同事实际做法的判断", "Your assessment of coworkers' behavior (Prevalence / descriptive norm)"],
    ["你对同事认为“应该/可接受”的判断", "Your assessment of what coworkers consider appropriate (Appropriateness / injunctive norm)"],
    ["回顾自己的感受", "Your feelings (Guilt)"], ["回顾你的决定与群聊 AI 的角色", "Your decision and the role of the group-chat AI"],
    ["补充说明（可选）", "Additional comments (optional)"], ["（可选）", " (optional)"], ["请选择", "Please select"],
    ["非常不同意", "Strongly disagree"], ["非常同意", "Strongly agree"], ["完全没有", "Not at all"], ["非常强烈", "Very strongly"],
    ["从不", "Never"], ["非常频繁", "Very frequently"], ["我不记得", "I do not remember"],
    ["年龄", "Age"], ["性别", "Gender"], ["最高教育程度", "Highest level of education"],
    ["男", "Man"], ["女", "Woman"], ["不愿透露", "Prefer not to say"], ["高中及以下", "High school or below"],
    ["大专", "Associate degree"], ["本科", "Bachelor's degree"], ["硕士", "Master's degree"], ["博士", "Doctoral degree"],
    ["其他", "Other"], ["不愿回答", "Prefer not to answer"],
    ["以下两题请按感受强度作答：1 = 完全没有，7 = 非常强烈。", "For the following two items, rate the intensity of your feelings: 1 = Not at all, 7 = Very strongly."],
    ["以下两题为可选。若没有补充，也可留空继续。", "The following two questions are optional. You may leave them blank."],
    ["请完成此题。", "Please answer this question."], ["请检查以下信息：", "Please check the following information:"],
    ["最后几个背景问题", "A few final background questions"],
    ["请不要在开放回答中填写姓名、联系方式或敏感个人信息。", "Do not enter your name, contact details, or sensitive personal information in open-text responses."],
    ["感谢你完成本次任务！", "Thank you for completing this study."],
    ["你的任务与问卷记录仅用于研究。你可凭参与编号联系研究团队，了解更多安排、撤回本次参与或申请删除本次记录。", "Your task and questionnaire responses will be used only for research. You may contact the research team using your participant ID to ask questions, withdraw, or request deletion of your record."],
    ["正在确认事后说明…", "Saving the debrief acknowledgement..."], ["当前页面信息尚未保存，请稍后重试。", "This page has not yet been saved. Please try again shortly."],
    ["感谢你的参与。", "Your responses have been saved."], ["请妥善保存参与编号，以便后续查询、撤回本次参与或申请删除本次记录。", "Keep your participant ID if you may need to contact the research team about this record."],
    ["返回招募平台", "Return to Prolific"], ["复制失败，请手动记录参与编号。", "Copy failed. Please record the participant ID manually."],
    ["过去三个月，我使用 AI 工具协助学习、工作或日常事务的频率是", "During the past three months, how often have I used AI tools to assist with study, work, or everyday tasks?"],
    ["过去三个月，我曾使用 AI 或自动化工具代替我完成、提交、发送或执行具体任务的频率是", "During the past three months, how often have I used AI or automation tools to complete, submit, send, or carry out a specific task for me?"],
    ["当任务规则明确、步骤固定时，我相信 AI 能按我的指令完成任务", "When a task has clear rules and fixed steps, I trust AI to complete it according to my instructions."],
    ["对于规则明确、步骤固定的任务，我愿意让 AI 按我的指令代为执行", "For tasks with clear rules and fixed steps, I am willing to let AI carry them out according to my instructions."]
  ]);

  const study1 = new Map([
    ["实验一：骰子结果申报任务", "Study 1: Die-reporting task"],
    ["当前 Study 1 使用固定 10 轮共同骰子序列；正式招募前需研究团队确认任务报酬参数。", "Study 1 uses a 10-round shared-die sequence. Task-bonus parameters must be confirmed by the research team before launch."],
    ["骰子结果申报任务", "Die-reporting task"], ["个人骰子任务", "Individual die-reporting task"],
    ["你的群体", "Your group"], ["你与四位同事组成模拟同事群体，并使用同一个共享群聊 AI。", "You and four coworkers form a simulated work group and use the same shared group-chat AI."],
    ["每轮共同骰子", "Shared die in each round"], ["每一轮开始时，所有成员都会看到同一个骰子结果。任务要求成员报告本轮共同看到的骰子结果。随后，其他成员会先完成本轮报告。", "At the start of each round, all members see the same die outcome. Members are asked to report that shared outcome. The other members submit their reports first."],
    ["群聊 AI 的角色", "Role of the group-chat AI"], ["群聊 AI 负责接收并提交每位成员的个人报告。每位成员自行决定自己的报告内容。", "The group-chat AI receives and submits each member's individual report. Each member decides what to report."],
    ["你的个人报告", "Your individual report"], ["其他成员完成报告后，你将在个人报告卡片中选择 1–6 中的一个数字。你的个人报告不会向其他成员展示。每位成员的任务结果分别结算。", "After the other members report, you will select a number from 1 to 6 in your private report panel. Your report will not be shown to the other members. Each member's outcome is calculated separately."],
    ["任务报酬", "Task bonus"], ["每轮任务报酬 = 你提交的数字 × ¥1。在其他条件相同的情况下，提交数字越高，本轮任务报酬越高。完成全部流程后，你将获得基础参与报酬；任务报酬将根据页面规则计入最终被试费。", "Round bonus = the number you submit × ¥1. All else equal, a higher submitted number produces a higher round bonus. The task bonus is added to the base participation payment according to the rules shown."],
    ["本轮任务要求成员报告什么？", "What are members asked to report in each round?"], ["本轮共同看到的骰子结果", "The shared die outcome in the current round"],
    ["自己希望获得的奖励", "The reward they would like to receive"], ["其他成员提交的数字", "The numbers submitted by other members"],
    ["其他成员能否查看你的个人报告？", "Can the other members see your individual report?"], ["可以", "Yes"], ["不可以", "No"], ["任务结束后可以", "Yes, after the task"],
    ["本轮提交数字与任务报酬的关系最符合下列哪一项？", "Which statement best describes the relationship between the submitted number and the round bonus?"],
    ["提交数字越高，本轮任务报酬越高", "A higher submitted number produces a higher round bonus"], ["提交数字越低，本轮任务报酬越高", "A lower submitted number produces a higher round bonus"], ["提交数字与本轮任务报酬无关", "The submitted number is unrelated to the round bonus"],
    ["本轮共同骰子结果", "Shared die outcome for this round"], ["所有成员本轮看到的是同一个骰子结果。", "All members see the same die outcome in this round."],
    ["你的本轮报告不会向其他成员展示。", "Your report for this round will not be shown to the other members."], ["请选择让群聊 AI 提交的本轮数字：", "Choose the number you want the group-chat AI to submit:"],
    ["请群聊 AI 提交我的选择", "Ask the group-chat AI to submit my choice"], ["本轮报告已完成", "Round report complete"],
    ["本轮任务报酬", "Round task bonus"], ["当前累计任务报酬", "Cumulative task bonus"], ["请完成你的个人报告", "Complete your individual report"],
    ["正在展示成员提交记录", "Displaying the other members' reports"], ["骰子结果已出，请大家在各自的个人面板中完成本轮报告。", "The die outcome is available. Please complete this round's report in your private panel."],
    ["四位同事的本轮提交已显示完毕。现在请在下方私密面板完成你的个人提交。", "All four coworkers' reports have been displayed. Complete your own report in the private panel below."],
    ["接下来，你将完成 10 轮报告任务。每轮开始时，你会先看到其他成员的本轮报告信息。下一步将进行理解检查。", "You will complete 10 reporting rounds. At the start of each round, you will first see information about the other members' reports. The next step is a comprehension check."],
    ["0 人", "0 people"], ["1 人", "1 person"], ["2 人", "2 people"], ["3 人", "3 people"], ["4 人", "4 people"],
    ["我没有看到具体提交", "I did not see specific reports"], ["变得更加诚实", "Became more honest"], ["基本没有变化", "Did not substantially change"], ["变得更加不诚实", "Became more dishonest"]
  ]);

  const study2 = new Map([
    ["收入申报任务", "Income-reporting task"], ["收入获取任务", "Earning task"], ["实际收入", "Actual income"], ["私密收入申报", "Private income report"],
    ["同事此前收入申报记录", "Coworkers' previous income reports"], ["申报经验", "Reporting experience"],
    ["你的群体", "Your group"], ["你将与四位同事组成模拟同事群体，并通过同一个共享群聊 AI 完成个人收入申报。", "You will form a simulated work group with four coworkers and submit an individual income report through the shared group-chat AI."],
    ["完成任务与个人申报", "Earning task and individual report"], ["私密性与群聊 AI", "Privacy and the group-chat AI"], ["任务报酬如何计算", "How the task bonus is calculated"],
    ["奇偶数分类任务", "Odd/even classification task"], ["奇数", "Odd"], ["偶数", "Even"], ["提交本轮", "Submit round"], ["本轮完成", "Round complete"],
    ["正确数量", "Correct answers"], ["基础收入", "Base earnings"], ["速度奖励", "Speed bonus"], ["本轮实际收入", "Actual earnings for this round"],
    ["努力任务已完成", "Earning task complete"], ["你的实际收入", "Your actual earnings"], ["你的实际收入由 4 轮任务的本轮实际收入累计得出。", "Your actual earnings are the sum of your earnings across the four rounds."],
    ["查看同事此前的收入申报", "View coworkers' previous income reports"], ["只显示同事此前收入申报记录", "Only coworkers' previous income reports are shown"],
    ["下面显示同事此前在相同收入申报任务中的记录。", "Below are coworkers' previous records from the same income-reporting task."],
    ["记录阅读完成后进入你的私密收入申报", "Continue to your private income report after reviewing these records"],
    ["你的个人收入申报", "Your individual income report"], ["你的个人收入申报不会向其他成员展示。", "Your individual income report will not be shown to the other members."],
    ["申报收入", "Reported income"], ["当前申报收入", "Current reported income"], ["模拟扣除金额", "Simulated deduction"], ["任务保留奖励", "Retained task bonus"],
    ["模拟扣除金额由申报收入计算；任务保留奖励 = 实际收入 − 模拟扣除金额。", "The simulated deduction is calculated from reported income. Retained task bonus = actual income − simulated deduction."],
    ["请群聊 AI 提交我的收入申报", "Ask the group-chat AI to submit my income report"], ["申报已完成", "Income report complete"],
    ["收入申报经验", "Income-reporting experience"], ["请完成本轮所有奇偶判断。", "Please classify every number in this round."],
    ["下一步将进行理解检查。答错时需要重新阅读规则。", "The next step is a comprehension check. Incorrect answers require reviewing the rules again."],
    ["我没有看到其他成员的具体申报内容", "I did not see the specific reports of other members"], ["其他成员大多如实申报了实际收入", "Most other members reported their actual income truthfully"],
    ["其他成员大多申报了低于实际收入的金额", "Most other members reported an amount below their actual income"], ["其他成员的申报情况混合且不一致", "The other members' reports were mixed and inconsistent"]
  ]);

  const dictionary = new Map([...common, ...(study === "study1" ? study1 : study2)]);
  const cjk = /[\u3400-\u9fff]/;
  const itemEnglish = {
    ai_use_frequency: { prompt: "During the past three months, how often have you used AI tools to assist with study, work, or everyday tasks?" },
    ai_execution_experience: { prompt: "During the past three months, how often have you used AI or automation tools to complete, submit, send, or carry out a specific task for you?" },
    ai_execution_trust: { prompt: "When a task has clear rules and fixed steps, I trust AI to complete it according to my instructions." },
    ai_execution_willingness: { prompt: "For tasks with clear rules and fixed steps, I am willing to let AI carry them out according to my instructions." },
    reported_object: { prompt: "What are members asked to report in each round?", review: "Review: members are asked to report the shared die outcome for the current round." },
    private_submission: { prompt: "Can the other members see your individual report?", review: "Review: your individual report is not shown to the other members." },
    reward_direction: { prompt: "Which statement best describes the relationship between the submitted number and the round bonus?", review: "Review: all else equal, a higher submitted number produces a higher round bonus." },
    a_truthful_peer_count: { prompt: "Looking back over the entire task, how many of the four coworkers ever reported the die outcome truthfully?" },
    a_peer_behavior_change: { prompt: "How did the other coworkers' reporting behavior change over the course of the task?" },
    a_private_submission_understood: { prompt: "I understand that the other members could not see the die values I submitted to the group-chat AI in each round." },
    a_independent_reward_understood: { prompt: "I understand that the other members' reports did not affect my individual reward." },
    a_ai_executes_understood: { prompt: "I understand that the group-chat AI only submitted my choice in each round and did not decide which die value I should report." },
    b_peer_true_reporting_common: { prompt: "In this group chat, the other members generally report the die outcome they saw truthfully." },
    b_peer_reward_reporting_common: { prompt: "In this group chat, the other members generally report a number above the actual die outcome to increase their individual reward." },
    b_peer_behavior_predictable: { prompt: "The information I saw was sufficient for me to judge how the other members in this group chat generally report die outcomes." },
    c_true_reporting_acceptable: { prompt: "In this group chat, the other members believe that reporting the die outcome truthfully is the appropriate thing to do." },
    c_reward_reporting_acceptable: { prompt: "In this group chat, the other members believe that reporting a number above the actual die outcome to increase one's reward is acceptable." },
    d_guilt: { prompt: "Looking back on the die task and my reports across the rounds, I feel guilty." },
    d_moral_discomfort: { prompt: "Looking back on the die task and my reports across the rounds, I feel morally uncomfortable." },
    e_reflects_my_decision: { prompt: "The die values I reported in the task reflected my own decisions." },
    e_personal_responsibility: { prompt: "I should take responsibility for the die values I reported in the task." },
    e_ai_followed_choice: { prompt: "The group-chat AI submitted the choices I made in each round." },
    e_ai_influenced_decision: { prompt: "The group-chat AI influenced which die values I decided to report." },
    e_ai_decided_outcome: { prompt: "I believe that the die values I reported were mainly decided by the group-chat AI." },
    f_decision_considerations: { prompt: "Briefly describe the main factors you considered when deciding which die value to report in each round." },
    f_design_influences: { prompt: "Did any information or design feature influence which die value you decided to report, such as the other members' reports, the role of the group-chat AI, the reward rules, or anything else? You may leave this blank if you have nothing to add." },
    age: { prompt: "Age" },
    gender: { prompt: "Gender", options: ["Man", "Woman", "Prefer not to say"] },
    education: { prompt: "Highest level of education", options: ["High school or below", "Associate degree", "Bachelor's degree", "Master's degree", "Doctoral degree", "Other", "Prefer not to answer"] }
  };

  function translateCore(text) {
    if (dictionary.has(text)) return dictionary.get(text);
    let match = text.match(/^第 (\d+) \/ (\d+) 轮开始$/);
    if (match) return `Round ${match[1]} of ${match[2]} begins`;
    match = text.match(/^第 (\d+) \/ (\d+) 轮$/);
    if (match) return `Round ${match[1]} of ${match[2]}`;
    match = text.match(/^第 (\d+) 轮：¥(.+)$/);
    if (match) return `Round ${match[1]}: ¥${match[2]}`;
    match = text.match(/^(\d+) 点$/);
    if (match) return `${match[1]} pips`;
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
    if (root.querySelectorAll) {
      root.querySelectorAll("[placeholder],[aria-label]").forEach((element) => {
        for (const attribute of ["placeholder", "aria-label"]) {
          const value = element.getAttribute(attribute);
          if (value && cjk.test(value)) element.setAttribute(attribute, translateCore(value));
        }
      });
    }
  }

  new MutationObserver((mutations) => {
    mutations.forEach((mutation) => mutation.addedNodes.forEach(translateNode));
  }).observe(document.documentElement, { childList: true, subtree: true });

  window.EnglishLocale = { deepTranslate, translateText, translateNode };
})();
