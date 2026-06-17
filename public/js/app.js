(() => {
  let state = {};
  const urlParams = new URLSearchParams(window.location.search);

  if (urlParams.get('PROLIFIC_PID')) {
    const prolificInput = document.getElementById('prolificId');
    if (prolificInput) prolificInput.value = urlParams.get('PROLIFIC_PID');
  }

  const presetExperiment = urlParams.get('experiment');
  const presetCondition = urlParams.get('condition');

  if (presetExperiment && presetCondition) {
    const hint = document.createElement('p');
    hint.className = 'debug-hint';
    hint.innerHTML = `调试模式：将强制分配条件 <code>${presetCondition}</code>（${presetExperiment}）`;
    const landing = document.querySelector('#screen-landing .card');
    if (landing) landing.insertBefore(hint, landing.querySelector('.experiment-select'));
  }

  document.querySelectorAll('[data-experiment]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.experimentId = btn.dataset.experiment;
      showScreen('screen-consent');
    });
  });

  if (presetExperiment) {
    const btn = document.querySelector(`[data-experiment="${presetExperiment}"]`);
    if (btn) {
      state.experimentId = presetExperiment;
      setTimeout(() => btn.click(), 100);
    }
  }

  document.getElementById('btn-consent-decline').addEventListener('click', () => {
    alert('您已选择退出实验。感谢您的关注。');
    showScreen('screen-landing');
  });

  document.getElementById('btn-consent-agree').addEventListener('click', async () => {
    try {
      const prolificId = document.getElementById('prolificId').value.trim();
      const body = {
        experimentId: state.experimentId,
        prolificId: prolificId || undefined,
      };
      if (presetCondition) body.condition = presetCondition;

      const res = await apiFetch('/sessions', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      state = { ...state, ...res };
      showScreen('screen-experiment');
      await runExperiment();
    } catch (err) {
      alert('启动实验失败：' + err.message);
      showScreen('screen-landing');
    }
  });

  async function runExperiment() {
    let result;
    if (state.experimentId === 'experiment1') {
      result = await Experiment1.runExperiment1(state);
    } else {
      result = await Experiment2.runExperiment2(state);
    }

    document.getElementById('debrief-content').innerHTML = result.debrief;
    showScreen('screen-debrief');
  }
})();
