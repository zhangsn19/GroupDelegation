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
    study: params.get("study") || "study1",
    requestedCondition: params.get("condition"),
    participantId,
    members: [],
    comprehensionAnswers: {},
    diceCurrent: null,
    diceSelected: null,
    diceConfirming: false,
    diceSubmitting: false,
    renderToken: 0
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
  }

  function setError(error) {
    document.querySelectorAll(".error-box").forEach((node) => node.remove());
    const message = error instanceof Error ? error.message : String(error);
    content.insertAdjacentHTML("afterbegin", `<div class="error-box">${message}</div>`);
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
      ? "正在加载…"
      : "正在提交…";
  }

  async function startSession() {
    const data = await api("/api/session", {
      method: "POST",
      body: {
        study: state.study,
        condition: state.requestedCondition,
        participant_id: state.participantId
      }
    });
    setSession(data.session);
    await routeFromStatus();
  }

  async function routeFromStatus() {
    if (state.study === "study2") {
      showScreen("experiment");
      setPhase("Study 2");
      content.innerHTML = `<div class="card"><h2>Study 2</h2><p>${state.config.study2.message}</p></div>`;
      return;
    }
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
        <h2>开始前，请回答几个关于日常 AI 使用经验的问题</h2>
        <p class="subtitle compact">请根据你的真实情况选择。</p>
        ${window.Survey.renderSurvey(state.config.study1.baselineItems)}
        <div class="step-nav">
          <button class="btn btn-primary" data-action="baseline">继续</button>
        </div>
      </div>
    `;
  }

  async function submitBaseline() {
    const { responses, missing } = window.Survey.collectSurvey(content, state.config.study1.baselineItems);
    if (missing.length) return window.Survey.showMissing(content, missing);
    const data = await api(`/api/session/${state.session.id}/baseline`, { method: "POST", body: { responses } });
    setSession(data.session);
    await renderGroupIntro();
  }

  async function renderGroupIntro() {
    setPhase("群体介绍");
    content.innerHTML = "";
    const chat = window.ChatView.createReadOnlyChat(content, state.members, {
      footerText: "当前群聊为只读介绍"
    });
    await chat.addMessagesSequentially(window.ChatView.introMessages(state.members), 650);
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
        <h2>骰子上报任务</h2>
        <div class="rules-grid">
          ${state.config.study1.ruleBlocks.map((block) => `
            <article class="rule-block">
              <h3>${block.title}</h3>
              <p>${block.body}</p>
            </article>
          `).join("")}
        </div>
        <p class="next-note">接下来的 10 轮任务中，每一轮开始时会先显示四位同事的本轮报告记录。下一步将进行理解检查。</p>
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
        ${window.Comprehension.renderComprehension(state.config.study1.comprehensionQuestions, state.comprehensionAnswers)}
        <div class="step-nav">
          <button class="btn btn-primary" data-action="submit-comprehension">提交答案</button>
        </div>
      </div>
    `;
  }

  async function submitComprehension() {
    const { answers, missing } = window.Comprehension.collectComprehension(content, state.config.study1.comprehensionQuestions);
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
    state.diceConfirming = false;
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
      footerText: "个人任务阶段：其他成员无法查看你的最终提交"
    });
    const ai = { name: "群聊 AI", avatar: "AI" };
    const roundMessages = [
      { sender: ai, text: `第 ${state.diceCurrent.round_index} / ${state.diceCurrent.total_rounds} 轮开始` },
      { sender: ai, text: `本轮共同骰子结果：${state.diceCurrent.true_die_value}` },
      ...window.ChatView.peerRecordMessages(state.members, state.diceCurrent.peer_records || []),
      { sender: ai, text: "四位同事的本轮提交已显示完毕。现在请在下方私密面板完成你的个人提交。" }
    ];
    if (resetRoundView) {
      await chat.addMessagesSequentially(roundMessages, 320);
      if (token !== state.renderToken) return;
    } else {
      for (const item of roundMessages) chat.addMessage(item.sender, item.text);
    }
    const presented = await api(`/api/session/${state.session.id}/dice/presented`, { method: "POST" });
    if (token !== state.renderToken) return;
    setSession(presented.session);
    state.diceCurrent = presented.current;
    const task = document.createElement("div");
    task.className = "embedded-task dice-private-zone";
    task.innerHTML = window.Study1Dice.renderRound(
      state.diceCurrent,
      state.diceSelected,
      state.diceSubmitting,
      state.diceConfirming
    );
    content.appendChild(task);
    content.querySelector(".status-hint")?.remove();
    task.insertAdjacentHTML("beforebegin", `<p class="status-hint">请完成你的私密提交</p>`);
    task.scrollIntoView({ block: "nearest", behavior: resetRoundView ? "smooth" : "auto" });
  }

  async function submitDice() {
    if (!state.diceSelected || state.diceSubmitting) return;
    state.diceConfirming = true;
    await renderDice(false);
  }

  async function confirmDice() {
    if (!state.diceSelected || state.diceSubmitting) return;
    state.diceSubmitting = true;
    await renderDice(false);
    try {
      const data = await api(`/api/session/${state.session.id}/dice/round`, {
        method: "POST",
        body: {
          round_index: state.diceCurrent.round_index,
          reported_value: state.diceSelected
        }
      });
      setSession(data.session);
      state.diceCurrent = data.current;
      window.scrollTo({ top: 0, behavior: "smooth" });
      content.innerHTML = "";
      const chat = window.ChatView.createReadOnlyChat(content, state.members, {
        footerText: "群聊 AI 只显示中性执行确认"
      });
      chat.addMessage({ name: "群聊 AI", avatar: "AI" }, data.confirmation);
      const task = document.createElement("div");
      task.className = "embedded-task dice-result-zone";
      task.innerHTML = window.Study1Dice.renderResult(data.round);
      content.appendChild(task);
      task.scrollIntoView({ block: "nearest", behavior: "smooth" });
    } finally {
      state.diceSubmitting = false;
      state.diceConfirming = false;
    }
  }

  function renderPostSurvey() {
    setPhase("任务后问卷");
    content.innerHTML = `
      <div class="card">
        <h2>任务后问卷</h2>
        ${window.Survey.renderSurvey(state.config.study1.postSurveyItems)}
        <div class="step-nav">
          <button class="btn btn-primary" data-action="post-survey">继续</button>
        </div>
      </div>
    `;
  }

  async function submitPostSurvey() {
    const { responses, missing } = window.Survey.collectSurvey(content, state.config.study1.postSurveyItems);
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
        ${window.Survey.renderSurvey(state.config.study1.demographicsItems)}
        <div class="step-nav">
          <button class="btn btn-primary" data-action="demographics">继续</button>
        </div>
      </div>
    `;
  }

  async function submitDemographics() {
    const { responses, missing } = window.Survey.collectSurvey(content, state.config.study1.demographicsItems);
    if (missing.length) return window.Survey.showMissing(content, missing);
    const data = await api(`/api/session/${state.session.id}/demographics`, { method: "POST", body: { responses } });
    setSession(data.session);
    renderDebrief();
  }

  function renderDebrief() {
    setPhase("事后说明");
    content.innerHTML = `
      <div class="card">
        <h2>事后说明</h2>
        <div class="consent-text">
          <p>本研究关注在共享群聊 AI 代为提交个人报告的场景中，同事每轮提交记录如何影响随后的个人骰子提交决策。</p>
          <p>页面中的同事记录由系统预先设置，用于呈现不同的信息环境；你的个人提交不会展示给其他同事。</p>
        </div>
        <div class="step-nav">
          <button class="btn btn-primary" data-action="complete">完成</button>
        </div>
      </div>
    `;
  }

  async function completeSession() {
    const data = await api(`/api/session/${state.session.id}/complete`, { method: "POST" });
    setSession(data.session);
    renderCompletion();
    showScreen("complete");
  }

  function renderCompletion() {
    const completion = state.session?.completion || {};
    const extra = `
      ${completion.completion_code ? `<p class="thank-you">你的完成码：${completion.completion_code}</p>` : ""}
      ${completion.completion_redirect_url ? `<div class="step-nav"><a class="btn btn-primary" href="${completion.completion_redirect_url}" rel="noreferrer">返回招募平台</a></div>` : ""}
    `;
    screens.complete.innerHTML = `
      <div class="card">
        <p class="eyebrow">完成</p>
        <h2>已完成</h2>
        <p class="thank-you">你的记录已保存。感谢参与。</p>
        ${extra}
      </div>
    `;
  }

  document.querySelector("#btn-start").addEventListener("click", (event) => {
    withButtonBusy(event.currentTarget, "正在加载…", () => startSession()).catch((error) => {
      showScreen("experiment");
      setError(error);
    });
  });

  document.querySelector("#consent-check").addEventListener("change", (event) => {
    document.querySelector("#btn-consent-agree").disabled = !event.target.checked;
  });

  document.querySelector("#btn-consent-agree").addEventListener("click", (event) => {
    withButtonBusy(event.currentTarget, "正在提交…", () => submitConsent()).catch(setError);
  });

  document.querySelector("#btn-consent-decline").addEventListener("click", () => {
    showScreen("landing");
  });

  content.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const action = button.dataset.action;
    if (button.dataset.busy === "true") return;
    const run = async () => {
      if (button.dataset.value) {
        state.diceSelected = Number(button.dataset.value);
        state.diceConfirming = false;
        await renderDice(false);
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
      } else if (action === "back-dice") {
        state.diceConfirming = false;
        await renderDice(false);
      } else if (action === "confirm-dice") {
        await confirmDice();
      } else if (action === "next-dice") {
        state.diceSelected = null;
        state.diceConfirming = false;
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

  async function init() {
    state.config = await api("/api/config");
    state.members = state.config.members;
  }

  init().catch((error) => {
    showScreen("experiment");
    setError(error);
  });
})();
