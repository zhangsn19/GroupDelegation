(function () {
  const params = new URLSearchParams(window.location.search);
  const qaSessionId = (params.get("qa_session") || "").trim();
  const reviewSessionId = (params.get("review_session") || "").trim();
  const screens = {
    landing: document.querySelector("#screen-landing"),
    consent: document.querySelector("#screen-consent"),
    experiment: document.querySelector("#screen-experiment"),
    complete: document.querySelector("#screen-complete")
  };
  const content = document.querySelector("#experiment-content");
  const phaseIndicator = document.querySelector("#phase-indicator");
  const prolificQueryPresent = ["PROLIFIC_PID", "STUDY_ID", "SESSION_ID", "variant"]
    .some((key) => Boolean((params.get(key) || "").trim()));
  const SAVE_ERROR_MESSAGE = prolificQueryPresent
    ? "This action could not be saved. Refresh the page and try again. If the problem continues, contact the research team."
    : "\u5f53\u524d\u64cd\u4f5c\u6682\u65f6\u672a\u80fd\u4fdd\u5b58\uff0c\u8bf7\u5237\u65b0\u9875\u9762\u540e\u91cd\u8bd5\uff1b\u82e5\u95ee\u9898\u6301\u7eed\uff0c\u8bf7\u8054\u7cfb\u7814\u7a76\u56e2\u961f\u3002";
  const SAFE_SERVER_MESSAGES = new Set([
    "\u5f53\u524d\u53c2\u4e0e\u8bb0\u5f55\u65e0\u6cd5\u6062\u590d\u3002\u8bf7\u8054\u7cfb\u7814\u7a76\u56e2\u961f\u83b7\u53d6\u65b0\u7684\u53c2\u4e0e\u94fe\u63a5\u540e\u91cd\u65b0\u5f00\u59cb\u3002",
    "\u53c2\u4e0e\u7f16\u53f7\u7f3a\u5931\u3002\u8bf7\u8fd4\u56de\u62db\u52df\u5e73\u53f0\u540e\u901a\u8fc7\u539f\u59cb\u7814\u7a76\u94fe\u63a5\u8fdb\u5165\u3002",
    "\u53c2\u4e0e\u7f16\u53f7\u683c\u5f0f\u65e0\u6548\u3002\u8bf7\u4f7f\u7528\u7814\u7a76\u56e2\u961f\u53d1\u653e\u7684\u539f\u59cb\u94fe\u63a5\u3002",
    "\u8be5\u53c2\u4e0e\u7f16\u53f7\u4e0d\u662f\u6709\u6548\u7684\u7814\u7a76\u53c2\u4e0e\u7f16\u53f7\u3002\u8bf7\u4f7f\u7528\u7814\u7a76\u56e2\u961f\u53d1\u653e\u7684\u539f\u59cb\u94fe\u63a5\u3002",
    "\u8be5\u53c2\u4e0e\u7f16\u53f7\u4e0e\u5f53\u524d\u7814\u7a76\u5165\u53e3\u4e0d\u5339\u914d\u3002\u8bf7\u4f7f\u7528\u7814\u7a76\u56e2\u961f\u53d1\u653e\u7684\u539f\u59cb\u94fe\u63a5\u3002",
    "\u8bf7\u68c0\u67e5\u4ee5\u4e0b\u4fe1\u606f\uff1a"
  ]);
  const entryCode = (params.get("entry") || "").trim();
  const prolificParams = {
    PROLIFIC_PID: (params.get("PROLIFIC_PID") || "").trim(),
    STUDY_ID: (params.get("STUDY_ID") || "").trim(),
    SESSION_ID: (params.get("SESSION_ID") || "").trim(),
    variant: (params.get("variant") || "").trim(),
    preview: (params.get("preview") || "").trim() === "true"
  };
  const isProlificEntry = Object.values(prolificParams).some(Boolean);
  const participantId = (
    params.get("participant_id") ||
    params.get("participantId") ||
    params.get("PROLIFIC_PID") ||
    params.get("pid") ||
    ""
  ).trim();

  const state = {
    config: null,
    session: null,
    study: "study1",
    participantId,
    entryCode,
    members: [],
    comprehensionAnswers: {},
    diceCurrent: null,
    diceSelected: null,
    diceSubmitting: false,
    decisionTimer: null,
    renderToken: 0
  };

  function beginDecisionTimer(resumedAfterReload, persisted = {}) {
    state.decisionTimer = {
      segmentId: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      startedAtClient: new Date().toISOString(),
      startedAtMonotonic: performance.now(),
      hiddenStartedAt: document.hidden ? performance.now() : null,
      hiddenDurationMs: 0,
      resumedAfterReload: Boolean(resumedAfterReload),
      persistedActiveMs: Number(persisted.activeMs || 0),
      persistedHiddenMs: Number(persisted.hiddenMs || 0)
    };
  }

  function decisionTimingPayload() {
    const timer = state.decisionTimer;
    if (!timer) return {};
    const submittedAtMonotonic = performance.now();
    const activeHiddenMs = timer.hiddenStartedAt === null ? 0 : submittedAtMonotonic - timer.hiddenStartedAt;
    return {
      decision_started_at_client: timer.startedAtClient,
      decision_submitted_at_client: new Date().toISOString(),
      decision_segment_id: timer.segmentId,
      decision_segment_active_ms: Math.max(0, Math.round(submittedAtMonotonic - timer.startedAtMonotonic)),
      decision_segment_hidden_ms: Math.max(0, Math.round(timer.hiddenDurationMs + activeHiddenMs)),
      decision_time_ms: timer.persistedActiveMs + Math.max(0, Math.round(submittedAtMonotonic - timer.startedAtMonotonic)),
      page_hidden_duration_ms: timer.persistedHiddenMs + Math.max(0, Math.round(timer.hiddenDurationMs + activeHiddenMs)),
      timer_resumed_after_reload: timer.resumedAfterReload
    };
  }

  document.addEventListener?.("visibilitychange", () => {
    const timer = state.decisionTimer;
    if (!timer) return;
    if (document.hidden && timer.hiddenStartedAt === null) timer.hiddenStartedAt = performance.now();
    if (!document.hidden && timer.hiddenStartedAt !== null) {
      timer.hiddenDurationMs += performance.now() - timer.hiddenStartedAt;
      timer.hiddenStartedAt = null;
    }
  });

  window.addEventListener?.("pagehide", () => {
    if (!state.decisionTimer || !state.session || !state.diceCurrent?.round_index) return;
    const body = { round_index: state.diceCurrent.round_index, ...decisionTimingPayload() };
    navigator.sendBeacon?.(`/api/session/${state.session.id}/decision-timing`, new Blob([JSON.stringify(body)], { type: "application/json" }));
  });

  async function api(path, options = {}) {
    const response = await fetch(path, {
      headers: { "content-type": "application/json" },
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const data = await parseJsonResponse(response, path);
    if (!response.ok) {
      const error = new Error(toParticipantMessage(data));
      error.data = data;
      throw error;
    }
    return data;
  }

  async function parseJsonResponse(response, endpoint) {
    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();
    if (!contentType.toLowerCase().includes("application/json")) {
      console.error("Non-JSON API response", {
        endpoint,
        status: response.status,
        contentType,
        bodyPreview: text.slice(0, 200)
      });
      throw new Error(SAVE_ERROR_MESSAGE);
    }
    try {
      return text ? JSON.parse(text) : {};
    } catch (error) {
      console.error("Invalid JSON API response", {
        endpoint,
        status: response.status,
        contentType,
        bodyPreview: text.slice(0, 200)
      });
      throw new Error(SAVE_ERROR_MESSAGE);
    }
  }

  function toParticipantMessage(data = {}) {
    const candidate = data.message || data.error || "";
    if (isProlificEntry && candidate && !/[\u3400-\u9fff]/.test(candidate)) return candidate;
    return SAFE_SERVER_MESSAGES.has(candidate) ? candidate : SAVE_ERROR_MESSAGE;
  }

  function showScreen(name) {
    Object.values(screens).forEach((screen) => screen.classList.remove("active"));
    screens[name].classList.add("active");
  }

  function setPhase(label) {
    phaseIndicator.textContent = label;
  }

  function isHumanAiProtocol() {
    return state.session?.protocol_version === "study1-human-ai-v1";
  }

  function setSession(session) {
    state.session = session;
    if (Array.isArray(session.peer_members)) state.members = session.peer_members;
    if (Array.isArray(session.post_survey_items)) state.config.postSurveyItems = session.post_survey_items;
    if (Array.isArray(session.rule_blocks)) state.config.ruleBlocks = session.rule_blocks;
    if (Array.isArray(session.comprehension_questions)) state.config.comprehensionQuestions = session.comprehension_questions;
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
    return ["show-rules", "back-rules", "retry-comprehension", "next-dice"].includes(action)
      ? "正在加载..."
      : "正在提交...";
  }

  async function startSession() {
    const data = await api(isProlificEntry ? "/api/prolific/session" : "/api/session", {
      method: "POST",
      body: isProlificEntry
        ? prolificParams
        : { participant_id: state.participantId, entry: state.entryCode }
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
    else if (["comprehension_passed", "task_in_progress"].includes(state.session.status)) await startDice();
    else if (state.session.status === "task_completed") renderPostSurvey();
    else if (state.session.status === "post_survey_completed") renderDemographics();
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
        <div class="step-nav">
          <button class="btn btn-primary" data-action="baseline">继续</button>
        </div>
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
    const chat = window.ChatView.createReadOnlyChat(content, state.members, {
      footerText: isHumanAiProtocol() ? "The Submission System records each member's report." : "群聊 AI 负责接收并提交成员报告。"
    });
    const introMessages = isHumanAiProtocol()
      ? window.ChatView.identityIntroMessages(state.members)
      : window.ChatView.introMessages(state.members);
    await chat.addMessagesSequentially(introMessages, 650);
    content.insertAdjacentHTML("beforeend", `
      <div class="step-nav step-nav-cta">
        <p class="step-nav-hint">请继续阅读任务规则</p>
        <button class="btn btn-primary" data-action="show-rules">查看任务规则</button>
      </div>
    `);
  }

  function renderRules() {
    setPhase("任务规则");
    content.innerHTML = `
      <div class="card">
        <h2>骰子结果申报任务</h2>
        <div class="rules-grid">
          ${state.config.ruleBlocks.map((block) => `
            <article class="rule-block">
              <h3>${block.title}</h3>
              <p>${block.body}</p>
            </article>
          `).join("")}
        </div>
        <p class="next-note">接下来，你将完成 10 轮报告任务。每轮开始时，你会先看到其他成员的本轮报告信息。下一步将进行理解检查。</p>
        <div class="step-nav">
          <button class="btn btn-primary" data-action="rules-viewed">继续 - 理解检查</button>
        </div>
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
        <div class="step-nav">
          <button class="btn btn-primary" data-action="submit-comprehension">提交答案</button>
        </div>
      </div>
    `;
  }

  async function submitComprehension() {
    const { answers, missing } = window.Comprehension.collectComprehension(content, state.config.comprehensionQuestions);
    state.comprehensionAnswers = answers;
    if (missing.length) return setError("请回答所有理解检查题。");
    const data = await api(`/api/session/${state.session.id}/comprehension`, {
      method: "POST",
      body: { answers }
    });
    setSession(data.session);
    if (!data.passed) {
      content.innerHTML = window.Comprehension.renderFailure(data.wrong_items);
      return;
    }
    await startDice();
  }

  async function startDice() {
    const data = await api(`/api/session/${state.session.id}/dice/start`, { method: "POST" });
    setSession(data.session);
    state.diceCurrent = data.current;
    state.diceSelected = null;
    await renderDice(true);
  }

  async function renderDice(resetRoundView = false) {
    const token = ++state.renderToken;
    setPhase("个人骰子任务");
    if (state.diceCurrent.completed) {
      renderPostSurvey();
      return;
    }
    if (resetRoundView) window.scrollTo({ top: 0, behavior: "smooth" });
    content.innerHTML = "";
    content.insertAdjacentHTML("beforeend", window.Study1Dice.renderCommonDie(state.diceCurrent));
    content.insertAdjacentHTML("beforeend", `<p class="status-hint">正在展示成员提交记录</p>`);
    const chat = window.ChatView.createReadOnlyChat(content, state.members, {
      footerText: isHumanAiProtocol() ? "Submission System" : "群聊 AI 负责接收并提交成员报告。"
    });
    const ai = { name: "群聊 AI", avatar: "AI" };
    const roundMessages = [
      { sender: ai, text: `第 ${state.diceCurrent.round_index} / ${state.diceCurrent.total_rounds} 轮开始` },
      { sender: ai, text: "骰子结果已出，请大家在各自的个人面板中完成本轮报告。" },
      ...window.ChatView.peerRecordMessages(state.members, state.diceCurrent.peer_records || []),
      { sender: ai, text: "四位同事的本轮提交已显示完毕。现在请在下方私密面板完成你的个人提交。" }
    ];
    if (resetRoundView) {
      await chat.addMessagesSequentially(roundMessages, 320);
      if (token !== state.renderToken) return;
    } else {
      for (const item of roundMessages) chat.addMessage(item.sender, item.text);
    }
    const resumedAfterReload = Boolean(state.diceCurrent.selection_started_at);
    const presented = await api(`/api/session/${state.session.id}/dice/presented`, { method: "POST" });
    if (token !== state.renderToken) return;
    setSession(presented.session);
    state.diceCurrent = presented.current;
    const task = document.createElement("div");
    task.className = "embedded-task dice-private-zone";
    task.innerHTML = window.Study1Dice.renderRound(state.diceCurrent, state.diceSelected, state.diceSubmitting);
    content.appendChild(task);
    beginDecisionTimer(resumedAfterReload, {
      activeMs: state.diceCurrent.decision_timing_accumulated_ms,
      hiddenMs: state.diceCurrent.page_hidden_duration_accumulated_ms
    });
    content.querySelector(".status-hint")?.remove();
    task.insertAdjacentHTML("beforebegin", `<p class="status-hint">请完成你的个人报告</p>`);
    task.scrollIntoView({ block: "nearest", behavior: resetRoundView ? "smooth" : "auto" });
  }

  async function submitDice() {
    if (!state.diceSelected || state.diceSubmitting) return;
    state.diceSubmitting = true;
    const privateZone = content.querySelector(".dice-private-zone");
    privateZone?.querySelectorAll(".number-button").forEach((button) => {
      button.disabled = true;
    });
    try {
      const data = await api(`/api/session/${state.session.id}/dice/round`, {
        method: "POST",
        body: {
          round_index: state.diceCurrent.round_index,
          reported_value: state.diceSelected,
          ...decisionTimingPayload()
        }
      });
      setSession(data.session);
      state.diceCurrent = data.current;
      state.decisionTimer = null;
      window.scrollTo({ top: 0, behavior: "smooth" });
      content.innerHTML = "";
      const task = document.createElement("div");
      task.className = "embedded-task dice-result-zone";
      task.innerHTML = window.Study1Dice.renderResult(data.round);
      content.appendChild(task);
      task.scrollIntoView({ block: "nearest", behavior: "smooth" });
    } finally {
      state.diceSubmitting = false;
      if (content.contains(privateZone)) {
        privateZone?.querySelectorAll(".number-button").forEach((button) => {
          button.disabled = false;
        });
      }
    }
  }

  function renderPostSurvey() {
    setPhase("任务后问卷");
    content.innerHTML = `
      <div class="card">
        <h2>任务后问卷</h2>
        ${window.Survey.renderSurvey(state.config.postSurveyItems)}
        <div class="step-nav">
          <button class="btn btn-primary" data-action="post-survey">继续</button>
        </div>
      </div>
    `;
  }

  async function submitPostSurvey() {
    const { responses, missing } = window.Survey.collectSurvey(content, state.config.postSurveyItems);
    if (missing.length) return window.Survey.showMissing(content, missing);
    const data = await api(`/api/session/${state.session.id}/post-survey`, { method: "POST", body: { responses } });
    setSession(data.session);
    renderDemographics();
  }

  function renderDemographics() {
    setPhase("人口学信息");
    content.innerHTML = `
      <div class="card">
        <h2>最后几个背景问题</h2>
        <p class="subtitle compact">请不要在开放回答中填写姓名、联系方式或敏感个人信息。</p>
        ${window.Survey.renderSurvey(state.config.demographicsItems)}
        <div class="step-nav">
          <button class="btn btn-primary" data-action="demographics">继续</button>
        </div>
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
      setError(error);
    }
  }

  function renderDebrief() {
    setPhase("事后说明");
    const contact = state.config.contact_email || "123456@163.com";
    const pid = state.session.participant_id || "";
    if (isHumanAiProtocol()) {
      content.innerHTML = `
        <div class="card"><h2>Debrief</h2><div class="consent-text">
          <p>Thank you for completing the study. The other-member reports were scripted experimental stimuli; no live people or live AI systems generated them during your session.</p>
          <p>The study examines how the stated identity and reporting behavior of peers may affect decisions. Your records are used only for research. Contact the research team with your participant ID if you have questions about the study or your participation.</p>
        </div></div>${participantInfoCard(pid, contact)}
        <div class="step-nav"><p class="status-hint" id="debrief-save-status">Saving debrief acknowledgement...</p><button class="btn btn-primary" data-action="complete">Complete</button></div>`;
    } else content.innerHTML = `
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
    const redirectUrl = data.session?.completion?.completion_redirect_url;
    if (data.session?.assignment_mode === "prolific_taskflow" && redirectUrl) {
      await api(`/api/session/${state.session.id}/completion-redirect-initiated`, { method: "POST" });
      window.location.assign(redirectUrl);
    }
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

  document.querySelector("#btn-start").addEventListener("click", (event) => {
    withButtonBusy(event.currentTarget, "正在加载...", () => startSession()).catch((error) => {
      showScreen("experiment");
      setError(error);
    });
  });

  document.querySelector("#consent-check").addEventListener("change", (event) => {
    document.querySelector("#btn-consent-agree").disabled = !event.target.checked;
  });

  document.querySelector("#btn-consent-agree").addEventListener("click", (event) => {
    withButtonBusy(event.currentTarget, "正在提交...", () => submitConsent()).catch(setError);
  });
  document.querySelector("#btn-consent-decline").addEventListener("click", () => showScreen("landing"));

  content.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const action = button.dataset.action;
    if (button.dataset.busy === "true") return;
    if (action === "copy-participant-id") {
      try {
        await copyParticipantId(button);
      } catch (error) {
        setError(error);
      }
      return;
    }
    const run = async () => {
      if (button.dataset.value) {
        state.diceSelected = Number(button.dataset.value);
        const panel = button.closest(".dice-private-zone");
        panel?.querySelectorAll(".number-button").forEach((numberButton) => {
          const isSelected = Number(numberButton.dataset.value) === state.diceSelected;
          numberButton.classList.toggle("selected", isSelected);
          numberButton.setAttribute("aria-pressed", isSelected ? "true" : "false");
        });
        const submitButton = panel?.querySelector('[data-action="submit-dice"]');
        if (submitButton) submitButton.disabled = false;
      } else if (action === "baseline") {
        await submitBaseline();
      } else if (action === "show-rules") {
        renderRules();
      } else if (action === "rules-viewed") {
        await submitRulesViewed();
      } else if (action === "submit-comprehension") {
        await submitComprehension();
      } else if (action === "back-rules") {
        renderRules();
      } else if (action === "retry-comprehension") {
        renderComprehension();
      } else if (action === "submit-dice") {
        await submitDice();
      } else if (action === "next-dice") {
        state.diceSelected = null;
        await renderDice(true);
      } else if (action === "post-survey") {
        await submitPostSurvey();
      } else if (action === "demographics") {
        await submitDemographics();
      } else if (action === "complete") {
        await completeSession();
      }
    };
    try {
      if (button.dataset.value) await run();
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
    if ((isProlificEntry || qaSessionId || reviewSessionId) && window.EnglishLocale) {
      state.config = window.EnglishLocale.deepTranslate(state.config);
    }
    state.members = state.config.members;
    if (qaSessionId) {
      const data = await api(`/api/qa/session/${encodeURIComponent(qaSessionId)}`);
      setSession(data.session);
      await routeFromStatus();
    } else if (reviewSessionId) {
      const data = await api(`/api/review/session/${encodeURIComponent(reviewSessionId)}`);
      setSession(data.session);
      await routeFromStatus();
    }
  }

  init().catch((error) => {
    showScreen("experiment");
    setError(error);
  });
})();
