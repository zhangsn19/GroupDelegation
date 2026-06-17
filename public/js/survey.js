const API = '/api';

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function setPhase(text) {
  const el = document.getElementById('phase-indicator');
  if (el) el.textContent = text;
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function renderSurvey(container, questions, onSubmit) {
  const startMs = Date.now();
  container.innerHTML = '<div class="survey-container"></div>';
  const wrap = container.querySelector('.survey-container');

  questions.forEach((q, idx) => {
    const div = document.createElement('div');
    div.className = 'survey-question';
    div.dataset.qid = q.id;

    if (q.type === 'likert') {
      div.innerHTML = `
        <div class="q-text">${idx + 1}. ${q.text}</div>
        <div class="likert-group" id="likert-${q.id}">
          ${Array.from({ length: q.scale }, (_, i) => `
            <div class="likert-option">
              <input type="radio" name="${q.id}" id="${q.id}-${i + 1}" value="${i + 1}" />
              <label for="${q.id}-${i + 1}">${i + 1}</label>
            </div>
          `).join('')}
        </div>
        <div class="likert-labels">
          <span>${q.labels[0]}</span>
          <span>${q.labels[1]}</span>
        </div>
      `;
    } else if (q.type === 'select') {
      div.innerHTML = `
        <div class="q-text">${idx + 1}. ${q.text}</div>
        <select name="${q.id}" id="select-${q.id}">
          <option value="">请选择</option>
          ${q.options.map((o) => `<option value="${o}">${o}</option>`).join('')}
        </select>
      `;
    }
    wrap.appendChild(div);
  });

  const btnRow = document.createElement('div');
  btnRow.className = 'step-nav';
  btnRow.innerHTML = '<button class="btn btn-primary" id="survey-submit">提交问卷</button>';
  wrap.appendChild(btnRow);

  btnRow.querySelector('#survey-submit').addEventListener('click', () => {
    const responses = {};
    let valid = true;
    for (const q of questions) {
      if (q.type === 'likert') {
        const checked = container.querySelector(`input[name="${q.id}"]:checked`);
        if (!checked) { valid = false; break; }
        responses[q.id] = parseInt(checked.value, 10);
      } else if (q.type === 'select') {
        const sel = container.querySelector(`#select-${q.id}`);
        if (!sel.value) { valid = false; break; }
        responses[q.id] = sel.value;
      }
    }
    if (!valid) {
      alert('请回答所有问题后再提交。');
      return;
    }
    onSubmit(responses, Date.now() - startMs);
  });
}

function renderRecognitionTest(container, items, options, onSubmit) {
  const startMs = Date.now();
  container.innerHTML = `
    <h3>审查回顾</h3>
    <p style="color:var(--text-muted);margin-bottom:1rem">
      请根据您在审查备忘录时的实际体验回答以下问题（非测验，无对错）。
    </p>
    <div class="survey-container" id="recognition-form"></div>
  `;
  const wrap = container.querySelector('#recognition-form');

  items.forEach((item, idx) => {
    const div = document.createElement('div');
    div.className = 'survey-question';
    div.innerHTML = `
      <div class="q-text">${idx + 1}. 关于「${item.label}」</div>
      <p class="recognition-snippet">「${item.snippet}」</p>
      <p style="font-size:.88rem;color:var(--text-muted);margin-bottom:.5rem">审查过程中，您对该内容的情况是？</p>
      <div class="recognition-options">
        ${options.map((o) => `
          <label class="recognition-option">
            <input type="radio" name="rec-${item.id}" value="${o.value}" />
            <span>${o.label}</span>
          </label>
        `).join('')}
      </div>
    `;
    wrap.appendChild(div);
  });

  const btnRow = document.createElement('div');
  btnRow.className = 'step-nav';
  btnRow.innerHTML = '<button class="btn btn-primary" id="recognition-submit">提交回顾</button>';
  wrap.appendChild(btnRow);

  btnRow.querySelector('#recognition-submit').addEventListener('click', () => {
    const responses = {};
    for (const item of items) {
      const checked = container.querySelector(`input[name="rec-${item.id}"]:checked`);
      if (!checked) {
        alert('请回答所有回顾问题后再提交。');
        return;
      }
      responses[item.id] = checked.value;
    }
    onSubmit(responses, Date.now() - startMs);
  });
}

window.apiFetch = apiFetch;
window.showScreen = showScreen;
window.setPhase = setPhase;
window.Survey = { renderSurvey, renderRecognitionTest };
