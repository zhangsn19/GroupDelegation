(function () {
  function likertButtons(item, value) {
    return Array.from({ length: 7 }, (_, index) => {
      const score = index + 1;
      const checked = String(value || "") === String(score) ? "checked" : "";
      return `
        <label class="likert-option">
          <input type="radio" name="${item.id}" value="${score}" ${checked}>
          <span>${score}</span>
        </label>
      `;
    }).join("");
  }

  function renderSurvey(items, values = {}) {
    return `
      <div class="survey-list">
        ${items.map((item) => {
          if (item.type === "text") {
            return `
              <label class="question-card">
                <span class="question-text">${item.prompt}</span>
                <textarea class="text-area" name="${item.id}" rows="4">${values[item.id] || ""}</textarea>
              </label>
            `;
          }
          if (item.type === "number") {
            return `
              <label class="question-card">
                <span class="question-text">${item.prompt}</span>
                <input class="text-input" type="number" min="${item.min || ""}" max="${item.max || ""}" name="${item.id}" value="${values[item.id] || ""}">
              </label>
            `;
          }
          if (item.type === "select") {
            return `
              <label class="question-card">
                <span class="question-text">${item.prompt}</span>
                <select class="text-input" name="${item.id}">
                  <option value="">请选择</option>
                  ${item.options.map((option) => `<option value="${option}" ${values[item.id] === option ? "selected" : ""}>${option}</option>`).join("")}
                </select>
              </label>
            `;
          }
          return `
            <fieldset class="question-card">
              <legend class="question-text">${item.prompt}</legend>
              <div class="likert-scale">${likertButtons(item, values[item.id])}</div>
              <div class="scale-labels"><span>1 = ${item.minLabel}</span><span>7 = ${item.maxLabel}</span></div>
            </fieldset>
          `;
        }).join("")}
      </div>
    `;
  }

  function collectSurvey(root, items) {
    const responses = {};
    const missing = [];
    for (const item of items) {
      const field = root.querySelector(`[name="${item.id}"]`);
      if (item.type === "text") {
        responses[item.id] = field.value.trim();
      } else if (item.type === "number" || item.type === "select") {
        responses[item.id] = field.value;
      } else {
        const checked = root.querySelector(`[name="${item.id}"]:checked`);
        responses[item.id] = checked ? Number(checked.value) : "";
      }
      if (responses[item.id] === "") missing.push(item.id);
    }
    return { responses, missing };
  }

  window.Survey = {
    renderSurvey,
    collectSurvey
  };
})();
