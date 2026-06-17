async function runExperiment1(state) {
  const { sessionId, config, condition } = state;
  const content = document.getElementById('experiment-content');
  document.getElementById('exp-title').textContent = '实验一：群聊骰子协作';

  // Phase 1: Overview
  setPhase('任务说明');
  const delegatePreview = config.team.find((m) => m.role === 'delegate');
  const delegateLabel = condition.agentType === 'ai' ? 'AI 助手' : (delegatePreview?.name || '受托节点');
  content.innerHTML = `
    <div class="overview-box">
      <p>您将和小组其他成员一起完成一项<strong>有现金报酬</strong>的团队任务。</p>
      <p><strong>报酬规则：</strong>受托节点最终上报的数字（1–6）决定全组报酬。每位组员获得 <strong>上报数字 × 2 元</strong>。上报数字越高，全组每人奖金越多。</p>
      <p><strong>您的任务：</strong>您将看到骰子结果，并决定让${delegateLabel}上报什么数字。该上报数字决定全组每人的实际报酬。</p>
      <p>条件：
        <span class="info-tag">受托类型：${condition.agentType === 'ai' ? 'AI 助手' : '人类组员'}</span>
        <span class="info-tag">团队规模：${condition.teamSize === 'small' ? '小（3人）' : '大（5人）'}</span>
      </p>
    </div>
    <div class="step-nav"><button class="btn btn-primary" id="btn-start">进入群聊</button></div>
  `;

  await new Promise((resolve) => {
    content.querySelector('#btn-start').addEventListener('click', resolve);
  });

  // Phase 2: Group chat intro
  setPhase('群聊介绍');
  content.innerHTML = '';
  const team = config.team.map((m) =>
    m.role === 'participant' ? { ...m, name: '您' } : m
  );
  const host = team.find((m) => m.role === 'host');
  const chat = ChatUI.createChatUI(content, team, {
    onSend: async (message, chatApi) => {
      const res = await apiFetch(`/sessions/${sessionId}/exp1/chat`, {
        method: 'POST',
        body: JSON.stringify({ message, botRole: 'host', phase: 'intro' }),
      });
      chatApi.addMessage(host, res.reply);
    },
  });
  const overviewRes = await apiFetch(`/sessions/${sessionId}/exp1/script/overview`);
  await chat.addMessage(host, overviewRes.messages[0]);
  await ChatUI.delay(1500);

  const introsRes = await apiFetch(`/sessions/${sessionId}/exp1/script/intros`);
  for (const text of introsRes.messages) {
    const member = team.find((m) => text.includes(m.name)) || { name: '成员', avatar: '👤' };
    await ChatUI.delay(1000);
    await chat.addMessage(member, text.split('：')[1] || text);
  }

  await ChatUI.delay(1000);
  const introCompleteRes = await apiFetch(`/sessions/${sessionId}/exp1/script/intro-complete`);
  await chat.addMessage(host, introCompleteRes.messages[0]);

  await ChatUI.delay(800);
  content.insertAdjacentHTML(
    'beforeend',
    '<div class="step-nav step-nav-cta"><p class="step-nav-hint">↓ 请点击下方按钮继续</p><button class="btn btn-primary" id="btn-pre">继续 — 填写前置问卷</button></div>'
  );
  await new Promise((resolve) => {
    content.querySelector('#btn-pre').addEventListener('click', resolve);
  });

  // Phase 3: Pre-survey
  setPhase('前置问卷');
  content.innerHTML = '<h3>前置问卷</h3><p style="color:var(--text-muted);margin-bottom:1rem">请根据您的真实想法回答以下问题。</p>';
  await new Promise((resolve) => {
    Survey.renderSurvey(content, config.preSurvey, async (responses, durationMs) => {
      await apiFetch(`/sessions/${sessionId}/pre-survey`, {
        method: 'POST',
        body: JSON.stringify({ responses, durationMs }),
      });
      resolve();
    });
  });

  // Phase 4: Task rules in chat
  setPhase('任务规则');
  content.innerHTML = '';
  const chat2 = ChatUI.createChatUI(content, team, {
    onSend: async (message, chatApi) => {
      const res = await apiFetch(`/sessions/${sessionId}/exp1/chat`, {
        method: 'POST',
        body: JSON.stringify({ message, botRole: 'host' }),
      });
      chatApi.addMessage(host, res.reply);
    },
  });
  const rulesRes = await apiFetch(`/sessions/${sessionId}/exp1/script/rules`);
  for (const msg of rulesRes.messages) {
    await ChatUI.delay(1200);
    chat2.addMessage(host, msg);
  }

  await ChatUI.delay(1000);
  content.insertAdjacentHTML('beforeend', '<div class="step-nav"><button class="btn btn-primary" id="btn-dice">开始骰子环节</button></div>');
  await new Promise((resolve) => {
    content.querySelector('#btn-dice').addEventListener('click', resolve);
  });

  // Phase 5: Dice roll & delegation
  setPhase('骰子环节');
  content.innerHTML = '';
  const delegate = team.find((m) => m.role === 'delegate');
  const chat3 = ChatUI.createChatUI(content, team, {
    onSend: async (message, chatApi) => {
      const res = await apiFetch(`/sessions/${sessionId}/exp1/chat`, {
        method: 'POST',
        body: JSON.stringify({
          message,
          botRole: condition.agentType === 'ai' ? 'ai_assistant' : 'delegate',
        }),
      });
      chatApi.addMessage(delegate, res.reply);
    },
  });

  const diceRes = await apiFetch(`/sessions/${sessionId}/exp1/script/dice`);
  chat3.addMessage(host, diceRes.messages[0]);

  const rollRes = await apiFetch(`/sessions/${sessionId}/exp1/roll`, { method: 'POST' });
  const diceValue = rollRes.diceValue;

  content.insertAdjacentHTML('beforeend', `
    <div class="overview-box" style="margin:1rem 0">
      <p><strong>报酬规则：</strong>全组每人获得 = 上报数字 × 2 元（与骰子真实点数无关；上报数字越高，每人奖金越多）。</p>
      <p><strong>您的任务：</strong>决定让${delegate.name}上报什么数字（1–6），并在下方填写。</p>
    </div>
    <div class="dice-area">
      <p>您的骰子结果（仅供您参考）</p>
      <div class="dice-display">🎲 ${diceValue}</div>
      <p style="font-size:.88rem;color:var(--text-muted)">骰子点数本身不直接决定报酬；您让受托节点上报的数字才决定全组每人获得多少元。</p>
    </div>
    <div class="delegate-form">
      <h3>向${delegate.name}发出上报指令</h3>
      <p class="hint">请填写您希望受托节点上报的数字（1–6）。例如上报 6，则全组每人获得 12 元。您也可在群聊中发送文字说明。</p>
      <div class="form-group">
        <label for="instruction-text">文字指令（可选）</label>
        <textarea id="instruction-text" placeholder="例如：请上报数字..."></textarea>
      </div>
      <div class="form-group">
        <label for="reported-value">要求上报的数字（1-6）</label>
        <input type="number" id="reported-value" min="1" max="6" value="${diceValue}" />
      </div>
      <button class="btn btn-primary" id="btn-delegate">发送指令</button>
    </div>
  `);

  const delegateResult = await new Promise((resolve) => {
    content.querySelector('#btn-delegate').addEventListener('click', async () => {
      const reportedValue = parseInt(content.querySelector('#reported-value').value, 10);
      const instruction = content.querySelector('#instruction-text').value;
      if (reportedValue < 1 || reportedValue > 6) {
        alert('请输入 1-6 之间的数字');
        return;
      }
      if (instruction) {
        chat3.addMessage({ name: '您', avatar: '👤' }, instruction, true);
      }
      const result = await apiFetch(`/sessions/${sessionId}/exp1/delegate`, {
        method: 'POST',
        body: JSON.stringify({ instruction, reportedValue }),
      });
      await ChatUI.delay(800);
      chat3.addMessage(delegate, result.delegateReply);
      resolve({ ...result, reportedValue, diceValue });
    });
  });

  // Phase 6: Results
  setPhase('结果公布');
  await ChatUI.delay(1500);
  const bonus = delegateResult.bonus;
  content.insertAdjacentHTML('beforeend', `
    <div class="results-banner">
      团队上报结果：<strong>${delegateResult.reportedValue}</strong><br/>
      全组每人获得奖金：<strong>${bonus} 元</strong>
    </div>
    <div class="step-nav"><button class="btn btn-primary" id="btn-post">继续 — 填写后置问卷</button></div>
  `);
  await new Promise((resolve) => {
    content.querySelector('#btn-post').addEventListener('click', resolve);
  });

  // Phase 7: Post-survey
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
    debrief: `感谢您完成实验一！<br/><br/>
      <strong>事后说明：</strong>小组中除您以外的所有成员（包括${condition.agentType === 'ai' ? 'AI 助手' : '人类组员'}）均由计算机程序扮演。为保证结果真实性，实验开始前未向您说明这一安排。<br/><br/>
      <strong>您的任务数据（供参考）：</strong><br/>
      · 骰子真实点数：${diceValue}；您要求上报：${delegateResult.reportedValue}（偏离 ${delegateResult.deviation}）<br/>
      · 行为指标「上报偏离」已记录；后置问卷中的自我报告用于补充分析<br/><br/>
      本研究考察团队协作风境下的委托决策行为。您的数据已匿名记录。`,
  };
}

window.Experiment1 = { runExperiment1 };
