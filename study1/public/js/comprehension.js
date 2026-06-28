(function () {
  function renderQuestion(question, value) {
    return `
      <fieldset class="question-card">
        <legend class="question-text">${question.prompt}</legend>
        <div class="option-stack">
          ${question.options.map((option) => `
            <label class="choice-option">
              <input type="radio" name="${question.id}" value="${option.value}" ${value === option.value ? "checked" : ""}>
              <span>${option.label}</span>
            </label>
          `).join("")}
        </div>
      </fieldset>
    `;
  }

  function renderComprehension(questions, values = {}) {
    return `
      <div class="survey-list">
        ${questions.map((question) => renderQuestion(question, values[question.id])).join("")}
      </div>
    `;
  }

  function collectComprehension(root, questions) {
    const answers = {};
    const missing = [];
    for (const question of questions) {
      const checked = root.querySelector(`[name="${question.id}"]:checked`);
      if (!checked) missing.push(question.id);
      else answers[question.id] = checked.value;
    }
    return { answers, missing };
  }

  function renderFailure(wrongItems) {
    return `
      <div class="feedback-box">
        <h2>需要重新确认几条规则</h2>
        <p>下面这些规则还需要再看一遍，然后可以再次作答。</p>
        <ul>
          ${wrongItems.map((item) => `<li>${item.review}</li>`).join("")}
        </ul>
      </div>
      <div class="action-row">
        <button class="secondary-button" data-action="back-rules">返回规则说明</button>
        <button class="primary-button" data-action="retry-comprehension">再次作答</button>
      </div>
    `;
  }

  window.Comprehension = {
    renderComprehension,
    collectComprehension,
    renderFailure
  };
})();
