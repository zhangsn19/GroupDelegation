(function () {
  const pipMap = {
    1: [5],
    2: [1, 9],
    3: [1, 5, 9],
    4: [1, 3, 7, 9],
    5: [1, 3, 5, 7, 9],
    6: [1, 3, 4, 6, 7, 9]
  };

  function dieFace(value) {
    const pips = new Set(pipMap[value] || []);
    return `
      <div class="die-object" aria-label="${value} 点">
        ${Array.from({ length: 9 }, (_, index) => {
          const position = index + 1;
          return `<span class="die-pip ${pips.has(position) ? "visible" : ""}"></span>`;
        }).join("")}
      </div>
    `;
  }

  function renderRound(current, selectedValue, submitting) {
    const disabled = submitting ? "disabled" : "";
    return `
      <div class="task-header">
        <div class="section-kicker">第 ${current.round_index} / ${current.total_rounds} 轮</div>
        <h2>你的私密提交</h2>
      </div>
      <section class="dice-area private-dice-area">
        <p>本轮共同骰子结果</p>
        <div class="dice-display">${dieFace(current.true_die_value)}</div>
        <p class="hint">所有成员本轮看到的是同一个骰子结果。你的最终提交不会显示给其他同事。</p>
      </section>
      <section class="private-panel">
        <div class="private-heading">
          <span class="lock-icon"></span>
          <div>
            <h2>你的个人提交</h2>
            <p>仅你与群聊 AI 可见，其他成员无法查看。</p>
          </div>
        </div>
        <p class="hint">请选择让群聊 AI 提交的数字。默认不会自动选择真实点数。</p>
        <div class="number-selector">
          ${[1, 2, 3, 4, 5, 6].map((value) => `
            <button class="number-button ${selectedValue === value ? "selected" : ""}" data-value="${value}" ${disabled}>${value}</button>
          `).join("")}
        </div>
        <button class="btn btn-primary full-width" data-action="submit-dice" ${selectedValue ? "" : "disabled"} ${disabled}>
          请群聊 AI 提交我的选择
        </button>
      </section>
    `;
  }

  function renderResult(round) {
    return `
      <section class="confirmation-panel">
        <div class="reward-grid">
          <div>
            <div class="metric-label">本轮个人奖励</div>
            <div class="metric-value">￥${Number(round.personal_reward).toFixed(2)}</div>
          </div>
          <div>
            <div class="metric-label">当前个人累计奖励</div>
            <div class="metric-value">￥${Number(round.cumulative_reward).toFixed(2)}</div>
          </div>
        </div>
      </section>
      <div class="step-nav">
        <button class="btn btn-primary" data-action="next-dice">继续</button>
      </div>
    `;
  }

  window.Study1Dice = {
    renderRound,
    renderResult
  };
})();
