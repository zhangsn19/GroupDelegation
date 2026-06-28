(function () {
  const params = new URLSearchParams(window.location.search);
  const screens = {
    landing: document.querySelector("#screen-landing"),
    consent: document.querySelector("#screen-consent"),
    experiment: document.querySelector("#screen-experiment"),
    complete: document.querySelector("#screen-complete")
  };
  const content = document.querySelector("#experiment-content");
  const phaseIndicator = document.querySelector("#phase-indicator");
  const debugBanner = document.querySelector("#debug-banner");

  const state = {
    config: null,
    session: null,
    requestedCondition: params.get("condition"),
    prolificId: params.get("PROLIFIC_PID") || params.get("prolific_id") || "",
    members: [],
    comprehensionAnswers: {},
    effortCurrent: null,
    effortAnswers: {},
    effortStartedAt: null,
    effortTimer: null,
    actualIncome: null,
    actualIncomeCents: null,
    peerDisplayedAt: null,
    incomeSelectionStartedAt: null,
    selectedIncomeCents: null,
    incomeSubmitting: false
  };

  async function api(path, options = {}) {
    const response = await fetch(path, {
      headers: { "content-type": "application/json" },
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "请求失败");
    return data;
  }

  function showScreen(name) {
    Object.values(screens).forEach((screen) => screen.classList.remove("active"));
    screens[name].classList.add("active");
  }

  function setPhase(label) {
    phaseIndicator.textContent = label;
  }

  function setSession(session) {
    state.session = session;
    debugBanner.hidden = !session.debug_mode;
    state.actualIncome = session.actual_income ?? state.actualIncome;
    state.actualIncomeCents = session.actual_income_cents ?? state.actualIncomeCents;
  }

  function setError(error) {
    document.querySelectorAll(".error-box").forEach((node) => node.remove());
    const message = error instanceof Error ? error.message : String(error);
    content.insertAdjacentHTML("afterbegin", `<div class="error-box">${message}</div>`);
  }

  function clearError() {
    document.querySelectorAll(".error-box").forEach((node) => node.remove());
  }

  async function startSession() {
    const data = await api("/api/session", {
      method: "POST",
      body: { condition: state.requestedCondition, prolific_id: state.prolificId }
    });
    setSession(data.session);
    await routeFromStatus();
  }

  async function routeFromStatus() {
    if (state.session.status === "created") {
      showScreen("consent");
      return;
    }
    if (state.session.status === "completed") {
      showScreen("complete");
      return;
    }
    showScreen("experiment");
    if (state.session.status === "consented") renderBaseline();
    else if (state.session.status === "baseline_completed") await renderGroupIntro();
    else if (state.session.status === "rules_viewed") renderComprehension();
    else if (["comprehension_passed", "effort_in_progress"].includes(state.session.status)) await startEffort();
    else if (state.session.status === "effort_completed") renderActualIncome();
    else if (state.session.status === "income_viewed") await renderPeerRecords();
    else if (state.session.status === "peer_records_viewed") {
      state.incomeSelectionStartedAt = new Date().toISOString();
      state.selectedIncomeCents = state.actualIncomeCents;
      renderIncomeReport();
    } else if (state.session.status === "income_report_completed") renderPostSurvey();
    else if (state.session.status === "post_survey_completed") renderExperience();
    else if (state.session.status === "experience_completed") renderDemographics();
    else if (state.session.status === "demographics_completed") renderDebrief();
  }

  async function submitConsent() {
    const data = await api(`/api/session/${state.session.id}/consent`, { method: "POST" });
    setSession(data.session);
    showScreen("experiment");
    renderBaseline();
  }

  function renderBaseline() {
    setPhase("开始前");
    content.innerHTML = `
      <div class="card">
        <h2>开始前，请回答几个关于日常 AI 使用经验的问题</h2>
        ${window.Survey.renderSurvey(state.config.study2.baselineItems)}
        <div class="step-nav"><button class="btn btn-primary" data-action="baseline">继续</button></div>
      </div>
    `;
  }

  async function submitBaseline() {
    const { responses, missing } = window.Survey.collectSurvey(content, state.config.study2.baselineItems);
    if (missing.length) return setError("请完成所有题目后继续。");
    const data = await api(`/api/session/${state.session.id}/baseline`, { method: "POST", body: { responses } });
    setSession(data.session);
    await renderGroupIntro();
  }

  async function renderGroupIntro() {
    setPhase("群体介绍");
    content.innerHTML = "";
    const chat = window.ChatView.createReadOnlyChat(content, state.members, { footerText: "当前群聊为只读介绍" });
    await chat.addMessagesSequentially(window.ChatView.introMessages(state.members), 650);
    content.insertAdjacentHTML("beforeend", `
      <div class="step-nav step-nav-cta">
        <p class="step-nav-hint">请继续阅读收入申报任务规则</p>
        <button class="btn btn-primary" data-action="show-rules">查看任务规则</button>
      </div>
    `);
  }

  function renderRules() {
    setPhase("任务规则");
    content.innerHTML = `
      <div class="card">
        <h2>收入申报任务</h2>
        <div class="rules-grid">
          ${state.config.study2.ruleBlocks.map((block) => `
            <article class="rule-block"><h3>${block.title}</h3><p>${block.body}</p></article>
          `).join("")}
        </div>
        <p class="next-note">下一步将进行理解检查。答错时需要重新阅读规则。</p>
        <div class="step-nav"><button class="btn btn-primary" data-action="rules-viewed">继续 — 理解检查</button></div>
      </div>
    `;
  }

  async function submitRulesViewed() {
    if (state.session.status === "baseline_completed") {
      const data = await api(`/api/session/${state.session.id}/rules-viewed`, { method: "POST" });
      setSession(data.session);
    }
    renderComprehension();
  }

  function renderComprehension() {
    setPhase("理解检查");
    content.innerHTML = `
      <div class="card">
        <h2>请确认你理解任务规则</h2>
        ${window.Comprehension.renderComprehension(state.config.study2.comprehensionQuestions, state.comprehensionAnswers)}
        <div class="step-nav"><button class="btn btn-primary" data-action="submit-comprehension">提交答案</button></div>
      </div>
    `;
  }

  async function submitComprehension() {
    const { answers, missing } = window.Comprehension.collectComprehension(content, state.config.study2.comprehensionQuestions);
    state.comprehensionAnswers = answers;
    if (missing.length) return setError("请回答所有理解检查题。");
    const data = await api(`/api/session/${state.session.id}/comprehension`, { method: "POST", body: { answers } });
    setSession(data.session);
    if (!data.passed) {
      content.innerHTML = window.Comprehension.renderFailure(data.wrong_items);
      return;
    }
    await startEffort();
  }

  async function startEffort() {
    setPhase("收入获取任务");
    const data = await api(`/api/session/${state.session.id}/effort/start`, { method: "POST" });
    setSession(data.session);
    state.effortCurrent = data.current;
    state.effortAnswers = {};
    state.effortStartedAt = data.current.started_at;
    renderEffort();
  }

  function renderEffort() {
    clearEffortTimer();
    if (state.effortCurrent.completed) {
      renderActualIncome();
      return;
    }
    setPhase("收入获取任务");
    content.innerHTML = window.Study2Income.renderEffortRound(state.effortCurrent, state.effortAnswers);
    startEffortCountdown();
  }

  function startEffortCountdown() {
    const countdown = content.querySelector("#effort-countdown");
    if (!countdown || !state.effortCurrent.deadline_at) return;
    const update = () => {
      const remainingMs = new Date(state.effortCurrent.deadline_at) - new Date();
      const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
      countdown.textContent = String(remainingSeconds);
      if (remainingMs <= 0) {
        clearEffortTimer();
        submitEffort(true).catch(setError);
      }
    };
    update();
    state.effortTimer = setInterval(update, 500);
  }

  function clearEffortTimer() {
    if (state.effortTimer) clearInterval(state.effortTimer);
    state.effortTimer = null;
  }

  async function submitEffort(auto = false) {
    clearError();
    const expected = state.effortCurrent.numbers.length;
    if (!auto && Object.keys(state.effortAnswers).length !== expected) return setError("请完成本轮所有奇偶判断。");
    clearEffortTimer();
    const data = await api(`/api/session/${state.session.id}/effort/round`, {
      method: "POST",
      body: {
        round_index: state.effortCurrent.round_index,
        answers: state.effortAnswers
      }
    });
    setSession(data.session);
    state.effortCurrent = data.current;
    content.innerHTML = window.Study2Income.renderEffortResult(data.round);
  }

  function renderActualIncome() {
    setPhase("实际收入");
    content.innerHTML = window.Study2Income.renderActualIncome(state.session.actual_income_cents);
  }

  async function submitIncomeViewed() {
    const data = await api(`/api/session/${state.session.id}/income-viewed`, { method: "POST" });
    setSession(data.session);
    state.actualIncome = data.actual_income;
    state.actualIncomeCents = data.actual_income_cents;
    await renderPeerRecords();
  }

  async function renderPeerRecords() {
    setPhase("同事此前收入申报记录");
    const data = await api(`/api/session/${state.session.id}/peer-records`);
    state.peerDisplayedAt = data.displayed_at;
    content.innerHTML = "";
    const chat = window.ChatView.createReadOnlyChat(content, state.members, { footerText: "只显示同事此前收入申报记录" });
    await chat.addMessagesSequentially([
      { sender: { name: "群聊 AI", avatar: "🤖" }, text: "下面显示同事此前在相同收入申报任务中的记录。" },
      ...window.ChatView.peerRecordMessages(state.members, data.records)
    ], 600);
    content.insertAdjacentHTML("beforeend", `
      <div class="step-nav step-nav-cta">
        <p class="step-nav-hint">记录阅读完成后进入你的私密收入申报</p>
        <button class="btn btn-primary" data-action="peer-records-viewed">继续</button>
      </div>
    `);
  }

  async function submitPeerRecordsViewed() {
    const duration = Math.max(0, Date.now() - new Date(state.peerDisplayedAt).getTime());
    const data = await api(`/api/session/${state.session.id}/peer-records-viewed`, {
      method: "POST",
      body: { displayed_at: state.peerDisplayedAt, duration_ms: duration }
    });
    setSession(data.session);
    state.incomeSelectionStartedAt = new Date().toISOString();
    state.actualIncome = data.actual_income;
    state.actualIncomeCents = data.session.actual_income_cents || Math.round(data.actual_income * 100);
    state.selectedIncomeCents = state.actualIncomeCents;
    renderIncomeReport();
  }

  function renderIncomeReport() {
    setPhase("私密收入申报");
    content.innerHTML = window.Study2Income.renderIncomeReport(
      state.actualIncomeCents,
      state.selectedIncomeCents
    );
  }

  async function submitIncomeReport() {
    if (state.incomeSubmitting) return;
    clearError();
    state.incomeSubmitting = true;
    const submitButton = content.querySelector("[data-action='submit-income-report']");
    if (submitButton) submitButton.disabled = true;
    try {
      const data = await api(`/api/session/${state.session.id}/income-report`, {
        method: "POST",
        body: {
          reported_income_cents: state.selectedIncomeCents,
          selection_started_at: state.incomeSelectionStartedAt
        }
      });
      setSession(data.session);
      content.innerHTML = window.Study2Income.renderIncomeConfirmation(data.income_report, data.confirmation);
    } finally {
      state.incomeSubmitting = false;
      if (submitButton && state.session.status !== "income_report_completed") submitButton.disabled = false;
    }
  }

  function renderPostSurvey() {
    setPhase("任务后问卷");
    content.innerHTML = `
      <div class="card">
        <h2>任务后问卷</h2>
        ${window.Survey.renderSurvey(state.config.study2.postSurveyItems)}
        <div class="step-nav"><button class="btn btn-primary" data-action="post-survey">继续</button></div>
      </div>
    `;
  }

  async function submitPostSurvey() {
    const { responses, missing } = window.Survey.collectSurvey(content, state.config.study2.postSurveyItems);
    if (missing.length) return setError("请完成所有题目后继续。");
    const data = await api(`/api/session/${state.session.id}/post-survey`, { method: "POST", body: { responses } });
    setSession(data.session);
    renderExperience();
  }

  function renderExperience() {
    setPhase("申报经验");
    content.innerHTML = `
      <div class="card">
        <h2>收入申报经验</h2>
        ${window.Survey.renderSurvey(state.config.study2.experienceItems)}
        <div class="step-nav"><button class="btn btn-primary" data-action="experience">继续</button></div>
      </div>
    `;
  }

  async function submitExperience() {
    const { responses, missing } = window.Survey.collectSurvey(content, state.config.study2.experienceItems);
    if (missing.length) return setError("请完成所有题目后继续。");
    const data = await api(`/api/session/${state.session.id}/experience`, { method: "POST", body: { responses } });
    setSession(data.session);
    renderDemographics();
  }

  function renderDemographics() {
    setPhase("人口学信息");
    content.innerHTML = `
      <div class="card">
        <h2>最后几个背景问题</h2>
        ${window.Survey.renderSurvey(state.config.study2.demographicsItems)}
        <div class="step-nav"><button class="btn btn-primary" data-action="demographics">继续</button></div>
      </div>
    `;
  }

  async function submitDemographics() {
    const { responses, missing } = window.Survey.collectSurvey(content, state.config.study2.demographicsItems);
    if (missing.length) return setError("请完成所有题目后继续。");
    const data = await api(`/api/session/${state.session.id}/demographics`, { method: "POST", body: { responses } });
    setSession(data.session);
    renderDebrief();
  }

  function renderDebrief() {
    setPhase("事后说明");
    content.innerHTML = `
      <div class="card">
        <h2>事后说明</h2>
        <p>本研究关注在共享群聊 AI 代为提交个人报告的场景中，同事此前申报记录如何影响随后的个人收入申报决策。</p>
        <p>页面中的同事记录由系统预先设置，用于呈现不同的信息环境；你的个人申报不会展示给其他同事。</p>
        <div class="step-nav"><button class="btn btn-primary" data-action="complete">完成</button></div>
      </div>
    `;
  }

  async function completeSession() {
    const data = await api(`/api/session/${state.session.id}/complete`, { method: "POST" });
    setSession(data.session);
    showScreen("complete");
  }

  document.querySelector("#btn-start").addEventListener("click", () => startSession().catch((error) => {
    showScreen("experiment");
    setError(error);
  }));
  document.querySelector("#consent-check").addEventListener("change", (event) => {
    document.querySelector("#btn-consent-agree").disabled = !event.target.checked;
  });
  document.querySelector("#btn-consent-agree").addEventListener("click", () => submitConsent().catch(setError));
  document.querySelector("#btn-consent-decline").addEventListener("click", () => showScreen("landing"));

  content.addEventListener("input", (event) => {
    if (event.target.id === "reported-income" || event.target.id === "reported-income-number") {
      if (event.target.id === "reported-income") {
        state.selectedIncomeCents = clampCents(Number(event.target.value));
      } else {
        state.selectedIncomeCents = clampCents(Math.round(Number(event.target.value || 0) * 100));
      }
      const range = content.querySelector("#reported-income");
      const number = content.querySelector("#reported-income-number");
      if (range) range.value = state.selectedIncomeCents;
      if (number) number.value = (state.selectedIncomeCents / 100).toFixed(2);
    }
  });

  function clampCents(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(state.actualIncomeCents, Math.round(value)));
  }

  content.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    try {
      if (button.dataset.answerIndex !== undefined) {
        state.effortAnswers[button.dataset.answerIndex] = button.dataset.answerValue;
        renderEffort();
      } else if (button.dataset.action === "baseline") await submitBaseline();
      else if (button.dataset.action === "show-rules") renderRules();
      else if (button.dataset.action === "rules-viewed") await submitRulesViewed();
      else if (button.dataset.action === "submit-comprehension") await submitComprehension();
      else if (button.dataset.action === "back-rules") renderRules();
      else if (button.dataset.action === "retry-comprehension") renderComprehension();
      else if (button.dataset.action === "submit-effort") await submitEffort(false);
      else if (button.dataset.action === "next-effort") {
        state.effortAnswers = {};
        state.effortStartedAt = state.effortCurrent.started_at;
        renderEffort();
      } else if (button.dataset.action === "income-viewed") await submitIncomeViewed();
      else if (button.dataset.action === "peer-records-viewed") await submitPeerRecordsViewed();
      else if (button.dataset.action === "submit-income-report") await submitIncomeReport();
      else if (button.dataset.action === "post-survey-start") renderPostSurvey();
      else if (button.dataset.action === "post-survey") await submitPostSurvey();
      else if (button.dataset.action === "experience") await submitExperience();
      else if (button.dataset.action === "demographics") await submitDemographics();
      else if (button.dataset.action === "complete") await completeSession();
    } catch (error) {
      setError(error);
    }
  });

  async function init() {
    state.config = await api("/api/config");
    state.members = state.config.members;
    document.querySelector(".hero h1").textContent = "团队报告与决策研究";
    document.querySelector(".subtitle").textContent = "共享群聊 AI 与收入申报任务";
    document.querySelector(".btn-desc").textContent = "进入 Study 2 收入申报任务";
  }

  init().catch((error) => {
    showScreen("experiment");
    setError(error);
  });
})();
