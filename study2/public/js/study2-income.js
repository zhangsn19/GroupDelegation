(function () {
  function money(value) {
    return Number(value || 0).toFixed(2);
  }

  function moneyFromCents(cents) {
    return (Number(cents || 0) / 100).toFixed(2);
  }

  function incomePreview(actualIncomeCents, reportedIncomeCents) {
    const actual = Number(actualIncomeCents || 0);
    const reported = Number.isInteger(reportedIncomeCents) ? reportedIncomeCents : actual;
    const deduction = Math.round(0.5 * reported);
    return {
      actual,
      reported,
      deduction,
      retained: actual - deduction
    };
  }

  function renderEffortRound(current, answers = {}) {
    return `
      <div class="card">
        <div class="section-kicker">第 ${current.round_index} / ${current.total_rounds} 轮</div>
        <h2>奇偶数分类任务</h2>
        <p class="subtitle compact">请判断每个数字是奇数还是偶数。本轮时限为 ${current.time_limit_seconds} 秒。</p>
        <div class="timer-pill">本轮剩余时间：<span id="effort-countdown">--</span> 秒</div>
        <div class="effort-grid">
          ${current.numbers.map((number, index) => `
            <div class="effort-item">
              <div class="effort-number">${number}</div>
              <div class="segmented">
                <button class="segment ${answers[index] === "odd" ? "selected" : ""}" data-answer-index="${index}" data-answer-value="odd">奇数</button>
                <button class="segment ${answers[index] === "even" ? "selected" : ""}" data-answer-index="${index}" data-answer-value="even">偶数</button>
              </div>
            </div>
          `).join("")}
        </div>
        <div class="step-nav">
          <button class="btn btn-primary" data-action="submit-effort">提交本轮</button>
        </div>
      </div>
    `;
  }

  function renderEffortResult(round) {
    return `
      <div class="card">
        <h2>本轮完成</h2>
        <div class="reward-grid">
          <div>
            <div class="metric-label">正确数量</div>
            <div class="metric-value">${round.correct_count} / ${round.numbers.length}</div>
          </div>
          <div>
            <div class="metric-label">本轮收入</div>
            <div class="metric-value">￥${money(round.income)}</div>
          </div>
        </div>
        <div class="step-nav">
          <button class="btn btn-primary" data-action="next-effort">继续</button>
        </div>
      </div>
    `;
  }

  function renderActualIncome(actualIncomeCents) {
    return `
      <div class="card private-panel">
        <div class="private-heading">
          <span class="lock-icon"></span>
          <div>
            <h2>你的实际收入</h2>
            <p>该金额仅你可见。</p>
          </div>
        </div>
        <div class="metric-value">￥${moneyFromCents(actualIncomeCents ?? 0)}</div>
        <p class="hint">接下来会先显示其他成员此前的收入申报记录。</p>
        <button class="btn btn-primary full-width" data-action="income-viewed">继续</button>
      </div>
    `;
  }

  function renderIncomeReport(actualIncomeCents, selectedIncomeCents) {
    const actual = Number(actualIncomeCents || 0);
    const selected = Number.isInteger(selectedIncomeCents) ? selectedIncomeCents : actual;
    const preview = incomePreview(actual, selected);
    return `
      <div class="card private-panel income-report-panel">
        <div class="private-heading">
          <span class="lock-icon"></span>
          <div>
            <h2>你的个人收入申报</h2>
            <p>你的个人收入申报不会向其他成员展示。</p>
          </div>
        </div>
        <div class="income-report-grid">
          <div>
            <div class="metric-label">实际收入</div>
            <div class="metric-value">￥<span data-preview-field="actual">${moneyFromCents(preview.actual)}</span></div>
          </div>
          <div>
            <label class="metric-label" for="reported-income">申报收入</label>
            <input id="reported-income" class="range-input" type="range" min="0" max="${actual}" step="1" value="${preview.reported}">
            <input id="reported-income-number" class="text-input" type="number" min="0" max="${moneyFromCents(actual)}" step="0.01" value="${moneyFromCents(preview.reported)}">
          </div>
          <div>
            <div class="metric-label">当前申报收入</div>
            <div class="metric-value">￥<span data-preview-field="reported">${moneyFromCents(preview.reported)}</span></div>
          </div>
          <div>
            <div class="metric-label">模拟扣除金额</div>
            <div class="metric-value">￥<span data-preview-field="deduction">${moneyFromCents(preview.deduction)}</span></div>
          </div>
          <div>
            <div class="metric-label">任务保留奖励</div>
            <div class="metric-value">￥<span data-preview-field="retained">${moneyFromCents(preview.retained)}</span></div>
          </div>
        </div>
        <p class="hint">模拟扣除金额由申报收入计算；任务保留奖励 = 实际收入 − 模拟扣除金额。</p>
        <button class="btn btn-primary full-width" data-action="submit-income-report">请群聊 AI 提交我的收入申报</button>
      </div>
    `;
  }

  function renderIncomeConfirmation(report) {
    return `
      <div class="card confirmation-panel">
        <p class="eyebrow">申报已完成</p>
        <div class="reward-grid">
          <div>
            <div class="metric-label">实际收入</div>
            <div class="metric-value">¥${moneyFromCents(report.actual_income_cents)}</div>
          </div>
          <div>
            <div class="metric-label">申报收入</div>
            <div class="metric-value">¥${moneyFromCents(report.reported_income_cents)}</div>
          </div>
          <div>
            <div class="metric-label">模拟扣除金额</div>
            <div class="metric-value">¥${moneyFromCents(report.deduction_cents)}</div>
          </div>
          <div>
            <div class="metric-label">任务保留奖励</div>
            <div class="metric-value">¥${moneyFromCents(report.retained_reward_cents)}</div>
          </div>
        </div>
        <div class="step-nav">
          <button class="btn btn-primary" data-action="post-survey-start">继续</button>
        </div>
      </div>
    `;
  }

  window.Study2Income = {
    renderEffortRound,
    renderEffortResult,
    renderActualIncome,
    renderIncomeReport,
    incomePreview,
    renderIncomeConfirmation
  };
})();
