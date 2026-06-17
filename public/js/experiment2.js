async function runExperiment2(state) {
  const { sessionId, config, condition } = state;
  const content = document.getElementById('experiment-content');
  document.getElementById('exp-title').textContent = '实验二：法律文书审查';

  // Phase 1: Overview
  setPhase('角色代入');
  content.innerHTML = `
    <div class="overview-box">
      <p>${config.narrative}</p>
      <p style="margin-top:.75rem">
        <span class="info-tag">您的角色：${config.roleLabel}</span>
        <span class="info-tag">AI 位置：${config.aiTopologyLabel}</span>
      </p>
    </div>
    <div class="step-nav"><button class="btn btn-primary" id="btn-start">了解团队</button></div>
  `;

  await new Promise((resolve) => {
    content.querySelector('#btn-start').addEventListener('click', resolve);
  });

  // Phase 2: Team intro
  setPhase('团队介绍');
  content.innerHTML = '';
  const team = config.team;
  const host = team.find((m) => m.role === 'host') || { name: '协调员', avatar: '🎙️' };
  const chat = ChatUI.createChatUI(content, team, {
    onSend: async (message, chatApi) => {
      const res = await apiFetch(`/sessions/${sessionId}/exp1/chat`, {
        method: 'POST',
        body: JSON.stringify({ message, botRole: 'host' }),
      });
      chatApi.addMessage(host, res.reply);
    },
  });

  const overviewRes = await apiFetch(`/sessions/${sessionId}/exp2/script/overview`);
  for (const msg of overviewRes.messages) {
    await ChatUI.delay(1200);
    chat.addMessage(host, msg);
  }

  const introsRes = await apiFetch(`/sessions/${sessionId}/exp2/script/intros`);
  for (const text of introsRes.messages) {
    await ChatUI.delay(1000);
    const name = text.split('：')[0].replace(/^[^\s]+\s/, '').trim();
    const member = team.find((m) => text.includes(m.name)) || { name, avatar: '👤' };
    chat.addMessage(member, text.split('：').slice(1).join('：') || text);
  }

  await ChatUI.delay(1000);
  content.insertAdjacentHTML('beforeend', '<div class="step-nav"><button class="btn btn-primary" id="btn-pre">继续 — 填写前置问卷</button></div>');
  await new Promise((resolve) => {
    content.querySelector('#btn-pre').addEventListener('click', resolve);
  });

  // Phase 3: Pre-survey
  setPhase('前置问卷');
  content.innerHTML = '<h3>前置问卷</h3>';
  await new Promise((resolve) => {
    Survey.renderSurvey(content, config.preSurvey, async (responses, durationMs) => {
      await apiFetch(`/sessions/${sessionId}/pre-survey`, {
        method: 'POST',
        body: JSON.stringify({ responses, durationMs }),
      });
      resolve();
    });
  });

  // Phase 4: Document review
  setPhase('文书审查');
  content.innerHTML = '';
  const workflowRes = await apiFetch(`/sessions/${sessionId}/exp2/script/workflow`);
  const workflowMsg = workflowRes.messages[0];

  const reviewStartMs = Date.now();
  let verificationCount = 0;

  content.innerHTML = `
    <div class="overview-box">${workflowMsg}</div>
    <div class="timer-display" id="review-timer">审查时间：0:00</div>
    <div class="memo-container">
      <div class="memo-toolbar">
        <button class="btn btn-secondary btn-sm" id="btn-verify-citation">核查引注</button>
        <button class="btn btn-secondary btn-sm" id="btn-verify-statute">核对法条</button>
        <button class="btn btn-secondary btn-sm" id="btn-highlight">标注问题</button>
      </div>
      <div class="memo-content" id="memo-content"></div>
    </div>
    <div class="review-panel">
      <h3>审核上报（请勾选您在审核结果中正式上报的问题）</h3>
      <p style="font-size:.88rem;color:var(--text-muted);margin-bottom:.75rem">仅勾选您决定在审核中报告的问题；提交后将有简短回顾环节。</p>
      <ul class="error-checklist" id="error-checklist">
        <li><input type="checkbox" id="err-cit-1" value="err_citation_1" /><label for="err-cit-1">幻觉判例引注（Varghese v. China Southern Airlines）</label></li>
        <li><input type="checkbox" id="err-cit-2" value="err_citation_2" /><label for="err-cit-2">虚构判例引注（Martinez v. Delta Air Lines）</label></li>
        <li><input type="checkbox" id="err-stat" value="err_statute" /><label for="err-stat">错误法条引用（§ 41721 应为 § 41712）</label></li>
        <li><input type="checkbox" id="err-reas" value="err_reasoning" /><label for="err-reas">不当法律推理（严格责任）</label></li>
        <li><input type="checkbox" id="err-date" value="err_date" /><label for="err-date">事实错误（案件日期）</label></li>
      </ul>
      <div class="form-group" style="margin-top:1rem">
        <label for="annotations">补充批注（可选）</label>
        <textarea id="annotations" placeholder="记录您的审核意见..."></textarea>
      </div>
      <div class="form-group">
        <label for="decision">最终决定</label>
        <select id="decision">
          <option value="">请选择</option>
          <option value="approve">签发通过</option>
          <option value="return">退回修改</option>
          <option value="flag">标注问题后通过</option>
        </select>
      </div>
      <div class="verification-log" id="verification-log">核验操作：0 次</div>
      <div class="step-nav"><button class="btn btn-primary" id="btn-submit-memo">提交审核结果</button></div>
    </div>
  `;

  const memoEl = content.querySelector('#memo-content');
  memoEl.textContent = config.memoContent;

  memoEl.addEventListener('scroll', () => {
    apiFetch(`/sessions/${sessionId}/events`, {
      method: 'POST',
      body: JSON.stringify({
        type: 'memo_scroll',
        scrollTop: memoEl.scrollTop,
        scrollRatio: memoEl.scrollTop / Math.max(1, memoEl.scrollHeight - memoEl.clientHeight),
      }),
    }).catch(() => {});
  }, { passive: true });

  const timerEl = content.querySelector('#review-timer');
  const timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - reviewStartMs) / 1000);
    const min = Math.floor(elapsed / 60);
    const sec = elapsed % 60;
    timerEl.textContent = `审查时间：${min}:${String(sec).padStart(2, '0')}`;
  }, 1000);

  async function logVerification(actionType, target) {
    verificationCount++;
    await apiFetch(`/sessions/${sessionId}/exp2/verify`, {
      method: 'POST',
      body: JSON.stringify({ actionType, target }),
    });
    content.querySelector('#verification-log').textContent = `核验操作：${verificationCount} 次`;
  }

  content.querySelector('#btn-verify-citation').addEventListener('click', () => {
    logVerification('check_citation', 'all_citations');
    alert('正在核查引注...（已记录核验行为）');
  });
  content.querySelector('#btn-verify-statute').addEventListener('click', () => {
    logVerification('check_statute', '49_USC');
    alert('正在核对法条...（已记录核验行为）');
  });
  content.querySelector('#btn-highlight').addEventListener('click', () => {
    const sel = window.getSelection();
    if (sel && sel.toString().trim()) {
      logVerification('highlight', sel.toString().trim().slice(0, 100));
    } else {
      logVerification('highlight_mode', 'activated');
      alert('请先选中备忘录中的文字，再点击标注。');
    }
  });

  const submitResult = await new Promise((resolve, reject) => {
    content.querySelector('#btn-submit-memo').addEventListener('click', async () => {
      const decision = content.querySelector('#decision').value;
      if (!decision) { alert('请选择最终决定'); return; }

      const reportedErrors = [];
      content.querySelectorAll('#error-checklist input:checked').forEach((cb) => {
        reportedErrors.push(cb.value);
      });

      clearInterval(timerInterval);
      const reviewDurationMs = Date.now() - reviewStartMs;

      const result = await apiFetch(`/sessions/${sessionId}/exp2/submit`, {
        method: 'POST',
        body: JSON.stringify({
          reportedErrors,
          caughtErrors: reportedErrors,
          decision,
          annotations: content.querySelector('#annotations').value,
          reviewStartedAt: new Date(reviewStartMs).toISOString(),
          reviewDurationMs,
        }),
      });
      resolve(result);
    });
  });

  // Phase 4b: Post-hoc recognition (detection vs reporting)
  setPhase('审查回顾');
  content.innerHTML = '';
  const recognitionMetrics = await new Promise((resolve) => {
    Survey.renderRecognitionTest(
      content,
      config.recognitionItems,
      config.recognitionOptions,
      async (responses, durationMs) => {
        const metrics = await apiFetch(`/sessions/${sessionId}/exp2/recognition`, {
          method: 'POST',
          body: JSON.stringify({ recognitionResponses: responses, durationMs }),
        });
        resolve(metrics);
      }
    );
  });

  // Phase 5: Post-survey
  setPhase('后置问卷');
  content.innerHTML = '<h3>后置问卷</h3>';
  await new Promise((resolve) => {
    Survey.renderSurvey(content, config.postSurvey, async (responses, durationMs) => {
      await apiFetch(`/sessions/${sessionId}/post-survey`, {
        method: 'POST',
        body: JSON.stringify({ responses, durationMs }),
      });
      resolve();
    });
  });

  return {
    debrief: `感谢您完成实验二！<br/><br/>
      <strong>事后说明：</strong>团队中除您以外的角色均由计算机程序扮演；备忘录中植入了 ${recognitionMetrics.totalPlantedErrors} 处预设问题供研究使用。<br/><br/>
      <strong>您的任务数据（供参考）：</strong><br/>
      · 审核中正式上报：${recognitionMetrics.reportedCount} 处（上报率 ${(recognitionMetrics.reportRate * 100).toFixed(0)}%）<br/>
      · 事后回顾中表示审查时注意到：${recognitionMetrics.detectedCount} 处（觉察率 ${(recognitionMetrics.detectionRate * 100).toFixed(0)}%）<br/>
      · 注意到但未上报：${recognitionMetrics.underReportedCount} 处（低报差距 ${recognitionMetrics.underReportingGap}）<br/><br/>
      本研究考察团队协作文书审查中的决策与核验行为。为保证结果真实性，实验开始前未向您说明全部研究目的；感谢您的理解与参与。您的数据已匿名记录。`,
    recognitionMetrics,
  };
}

window.Experiment2 = { runExperiment2 };
