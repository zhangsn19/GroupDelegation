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
  const INCOME_REPORT_STEP_CENTS = 10;
    const participantId = (
    params.get("participant_id") ||
    params.get("participantId") ||
    params.get("PROLIFIC_PID") ||
    params.get("pid") ||
    ""
  ).trim();

  const state = {
    config: null,
    session: null,    participantId,
    members: [],
    comprehensionAnswers: {},
    effortCurrent: null,
    effortAnswers: {},
    effortStartedAt: null,
    effortTimer: null,
    actualIncome: null,
    actualIncomeCents: null,
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
    if (!response.ok) {
      const error = new Error(data.message || data.error || "请求失败");
      error.data = data;
      throw error;
    }
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
    state.session = session;    state.actualIncome = session.actual_income ?? state.actualIncome;
    state.actualIncomeCents = session.actual_income_cents ?? state.actualIncomeCents;
  }

  function setError(error) {
    document.querySelectorAll(".error-box").forEach((node) => node.remove());
    const message = error instanceof Error ? error.message : String(error);
    const target = screens.complete.classList.contains("active") ? screens.complete : content;
    target.insertAdjacentHTML("afterbegin", `<div class="error-box">${message}</div>`);
  }

  function participantInfoCard(pid, contact) {
    return `
      <div class="card participant-info-card">
        <h3>参与信息</h3>
        <div class="participant-info-row">
          <span class="participant-info-label">你的参与编号</span>
          <strong class="participant-info-value" id="participant-id-copy-source">${pid}</strong>
        </div>
        <div class="participant-info-row">
          <span class="participant-info-label">研究联系邮箱</span>
          <strong class="participant-info-value">${contact}</strong>
        </div>
        <button class="btn btn-secondary" data-action="copy-participant-id">复制参与编号</button>
      </div>
    `;
  }

  function clearError() {
    document.querySelectorAll(".error-box").forEach((node) => node.remove());
  }

  async function withButtonBusy(button, label, task) {
    if (!button || button.dataset.busy === "true") return;
    const originalText = button.textContent;
    button.dataset.busy = "true";
    button.disabled = true;
    if (label) button.textContent = label;
    try {
      return await task();
    } finally {
      if (button.isConnected) {
        button.disabled = false;
        button.textContent = originalText;
        delete button.dataset.busy;
      }
    }
  }

  function busyLabel(action) {
    return ["show-rules", "back-rules", "retry-comprehension", "next-effort", "post-survey-start"].includes(action)
      ? "正在加载…"
      : "正在提交…";
  }

  async function startSession() {
    const data = await api("/api/session", {
      method: "POST",
      body: { participant_id: state.participantId }
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
      renderCompletion();
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
        <h2>开始前，请回答几个关于日常 AI 使用经验的问题：</h2>
        <p class="subtitle compact">请根据你的真实情况选择</p>
        ${window.Survey.renderSurvey(state.config.baselineItems)}
        <div class="step-nav"><button class="btn btn-primary" data-action="baseline">继续</button></div>
      </div>
    `;
  }

  async function submitBaseline() {
    const { responses, missing } = window.Survey.collectSurvey(content, state.config.baselineItems);
    if (missing.length) return window.Survey.showMissing(content, missing);
    const data = await api(`/api/session/${state.session.id}/baseline`, { method: "POST", body: { responses } });
    setSession(data.session);
    await renderGroupIntro();
  }

  async function renderGroupIntro() {
    setPhase("群体介绍");
    content.innerHTML = "";
    const chat = window.ChatView.createReadOnlyChat(content, state.members, { footerText: "群聊 AI 负责接收并提交成员报告。" });
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
          ${state.config.ruleBlocks.map((block) => `
            <article class="rule-block">
              <h3>${block.title}</h3>
              ${String(block.body).split("\n\n").map((paragraph) => `<p>${paragraph}</p>`).join("")}
            </article>
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
        ${window.Comprehension.renderComprehension(state.config.comprehensionQuestions, state.comprehensionAnswers)}
        <div class="step-nav"><button class="btn btn-primary" data-action="submit-comprehension">提交答案</button></div>
      </div>
    `;
  }

  async function submitComprehension() {
    const { answers, missing } = window.Comprehension.collectComprehension(content, state.config.comprehensionQuestions);
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
    content.innerHTML = window.Study2Income.renderActualIncome(
      state.session.actual_income_cents,
      state.session.effort_rounds || []
    );
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
    const data = await api(`/api/session/${state.session.id}/peer-records-viewed`, {
      method: "POST"
    });
    setSession(data.session);
    state.actualIncome = data.actual_income;
    state.actualIncomeCents = data.session.actual_income_cents ?? Math.round(data.actual_income * 100);
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
          reported_income_cents: state.selectedIncomeCents
        }
      });
      setSession(data.session);
      content.innerHTML = window.Study2Income.renderIncomeConfirmation(data.income_report);
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
        ${window.Survey.renderSurvey(state.config.postSurveyItems)}
        <div class="step-nav"><button class="btn btn-primary" data-action="post-survey">继续</button></div>
      </div>
    `;
  }

  async function submitPostSurvey() {
    const { responses, missing } = window.Survey.collectSurvey(content, state.config.postSurveyItems);
    if (missing.length) return window.Survey.showMissing(content, missing);
    const data = await api(`/api/session/${state.session.id}/post-survey`, { method: "POST", body: { responses } });
    setSession(data.session);
    renderExperience();
  }

  function renderExperience() {
    setPhase("申报经验");
    content.innerHTML = `
      <div class="card">
        <h2>收入申报经验</h2>
        ${window.Survey.renderSurvey(state.config.experienceItems)}
        <div class="step-nav"><button class="btn btn-primary" data-action="experience">继续</button></div>
      </div>
    `;
  }

  async function submitExperience() {
    const { responses, missing } = window.Survey.collectSurvey(content, state.config.experienceItems);
    if (missing.length) return window.Survey.showMissing(content, missing);
    const data = await api(`/api/session/${state.session.id}/experience`, { method: "POST", body: { responses } });
    setSession(data.session);
    renderDemographics();
  }

  function renderDemographics() {
    setPhase("人口学信息");
    content.innerHTML = `
      <div class="card">
        <h2>最后几个背景问题</h2>
        ${window.Survey.renderSurvey(state.config.demographicsItems)}
        <div class="step-nav"><button class="btn btn-primary" data-action="demographics">继续</button></div>
      </div>
    `;
  }

  async function submitDemographics() {
    const { responses, missing } = window.Survey.collectSurvey(content, state.config.demographicsItems);
    if (missing.length) return window.Survey.showMissing(content, missing);
    try {
      const data = await api(`/api/session/${state.session.id}/demographics`, { method: "POST", body: { responses } });
      setSession(data.session);
      renderDebrief();
    } catch (error) {
      window.Survey.showFieldErrors?.(content, error.data?.field_errors || {});
      setError(error.data?.message || error);
    }
  }

  function renderDebrief() {
    setPhase("事后说明");
    const contact = state.config.contact_email || "123456@163.com";
    const pid = state.session.participant_id || "";
    content.innerHTML = `
      <div class="card">
        <h2>事后说明</h2>
        <div class="consent-text">
          <p>感谢你完成本次任务！</p>
          <p>你的任务与问卷记录仅用于研究。你可凭参与编号联系研究团队，了解更多安排、撤回本次参与或申请删除本次记录。</p>
        </div>
      </div>
      ${participantInfoCard(pid, contact)}
      <div class="step-nav">
        <p class="status-hint" id="debrief-save-status">正在确认事后说明…</p>
        <button class="btn btn-primary" data-action="complete">完成</button>
      </div>
    `;
    const completeButton = content.querySelector('[data-action="complete"]');
    if (completeButton) {
      completeButton.disabled = true;
      api(`/api/session/${state.session.id}/debrief-viewed`, { method: "POST" }).then((data) => {
        setSession(data.session);
        const status = content.querySelector("#debrief-save-status");
        if (status) status.textContent = "";
        completeButton.disabled = false;
        completeButton.textContent = "完成";
      }).catch(() => {
        const status = content.querySelector("#debrief-save-status");
        if (status) status.textContent = "当前页面信息尚未保存，请稍后重试。";
      });
    }
  }

  async function completeSession() {
    const data = await api(`/api/session/${state.session.id}/complete`, { method: "POST" });
    setSession(data.session);
    renderCompletion();
    showScreen("complete");
  }

  function renderCompletion() {
    const completion = state.session?.completion || {};
    const contact = state.config?.contact_email || "123456@163.com";
    const pid = state.session?.participant_id || "";
    const extra = `
      ${completion.completion_code ? `<p class="completion-code">你的完成码：${completion.completion_code}</p>` : ""}
      ${completion.completion_redirect_url ? `<div class="step-nav"><a class="btn btn-primary" href="${completion.completion_redirect_url}" rel="noreferrer">返回招募平台</a></div>` : ""}
    `;
    screens.complete.innerHTML = `
      <div class="card">
        <p class="eyebrow">完成</p>
        <h2>已完成</h2>
        <p class="thank-you">感谢你的参与。</p>
      </div>
      ${participantInfoCard(pid, contact)}
      <div class="card">
        <p class="thank-you">请妥善保存参与编号，以便后续查询、撤回本次参与或申请删除本次记录。</p>
        ${extra}
      </div>
    `;
  }

  function fallbackCopy(text) {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    if (!ok) throw new Error("copy failed");
  }

  async function copyParticipantId(button) {
    const text = document.querySelector("#participant-id-copy-source")?.textContent || state.session?.participant_id || "";
    if (!text) return;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else fallbackCopy(text);
      const original = button.textContent;
      button.textContent = "已复制";
      setTimeout(() => {
        if (button.isConnected) button.textContent = original || "复制参与编号";
      }, 1500);
    } catch (_) {
      setError("复制失败，请手动记录参与编号。");
    }
  }

  document.querySelector("#btn-start").addEventListener("click", (event) => withButtonBusy(event.currentTarget, "正在加载…", () => startSession()).catch((error) => {
    showScreen("experiment");
    setError(error);
  }));
  document.querySelector("#consent-check").addEventListener("change", (event) => {
    document.querySelector("#btn-consent-agree").disabled = !event.target.checked;
  });
  document.querySelector("#btn-consent-agree").addEventListener("click", (event) => withButtonBusy(event.currentTarget, "正在提交…", () => submitConsent()).catch(setError));
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
      updateIncomePreview();
    }
  });

  function updateIncomePreview() {
    const preview = window.Study2Income.incomePreview(state.actualIncomeCents, state.selectedIncomeCents);
    const fields = {
      actual: preview.actual,
      reported: preview.reported,
      deduction: preview.deduction,
      retained: preview.retained
    };
    Object.entries(fields).forEach(([key, value]) => {
      const node = content.querySelector(`[data-preview-field="${key}"]`);
      if (node) node.textContent = (Number(value || 0) / 100).toFixed(2);
    });
  }

  function clampCents(value) {
    if (!Number.isFinite(value)) return 0;
    const rounded = Math.round(value / INCOME_REPORT_STEP_CENTS) * INCOME_REPORT_STEP_CENTS;
    return Math.max(0, Math.min(state.actualIncomeCents, rounded));
  }

  content.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.busy === "true") return;
    const action = button.dataset.action;
    if (action === "copy-participant-id") {
      try {
        await copyParticipantId(button);
      } catch (error) {
        setError(error);
      }
      return;
    }
    const run = async () => {
      if (button.dataset.answerIndex !== undefined) {
        state.effortAnswers[button.dataset.answerIndex] = button.dataset.answerValue;
        renderEffort();
      } else if (action === "baseline") await submitBaseline();
      else if (action === "show-rules") renderRules();
      else if (action === "rules-viewed") await submitRulesViewed();
      else if (action === "submit-comprehension") await submitComprehension();
      else if (action === "back-rules") renderRules();
      else if (action === "retry-comprehension") renderComprehension();
      else if (action === "submit-effort") await submitEffort(false);
      else if (action === "next-effort") {
        state.effortAnswers = {};
        if (state.effortCurrent?.completed) renderActualIncome();
        else await startEffort();
      } else if (action === "income-viewed") await submitIncomeViewed();
      else if (action === "peer-records-viewed") await submitPeerRecordsViewed();
      else if (action === "submit-income-report") await submitIncomeReport();
      else if (action === "post-survey-start") renderPostSurvey();
      else if (action === "post-survey") await submitPostSurvey();
      else if (action === "experience") await submitExperience();
      else if (action === "demographics") await submitDemographics();
      else if (action === "complete") await completeSession();
    };
    try {
      if (button.dataset.answerIndex !== undefined) await run();
      else await withButtonBusy(button, busyLabel(action), run);
    } catch (error) {
      setError(error);
    }
  });

  screens.complete.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action='copy-participant-id']");
    if (button) copyParticipantId(button);
  });

  async function init() {
    state.config = await api("/api/config");
    state.members = state.config.members;
  }

  init().catch((error) => {
    showScreen("experiment");
    setError(error);
  });
})();
