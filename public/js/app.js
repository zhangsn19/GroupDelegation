(() => {
  let state = {};

  document.querySelectorAll('[data-experiment]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.experimentId = btn.dataset.experiment;
      showScreen('screen-consent');
    });
  });

  document.getElementById('btn-consent-decline').addEventListener('click', () => {
    alert('您已选择退出实验。感谢您的关注。');
    showScreen('screen-landing');
  });

  document.getElementById('btn-consent-agree').addEventListener('click', async () => {
    try {
      const prolificId = document.getElementById('prolificId').value.trim();
      const res = await apiFetch('/sessions', {
        method: 'POST',
        body: JSON.stringify({
          experimentId: state.experimentId,
          prolificId: prolificId || undefined,
        }),
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
