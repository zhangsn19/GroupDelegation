(function () {
  const SECTION_TITLES = {
    A: "任务理解与信息回忆",
    B: "你对同事实际做法的判断",
    C: "你对同事认为“应当/可接受”的判断",
    D: "回顾自己的感受",
    E: "回顾你的决定与群聊 AI 的角色",
    F: "补充说明（可选）"
  };

  const SECTION_SUBTITLES = {
    D: "以下两题请按感受强度作答：1 = 完全没有，7 = 非常强烈。",
    F: "以下两题为可选。若没有补充，也可留空继续。"
  };

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

  function sectionHeader(section) {
    if (!section || !SECTION_TITLES[section]) return "";
    const subtitle = SECTION_SUBTITLES[section]
      ? `<p class="subtitle compact">${SECTION_SUBTITLES[section]}</p>`
      : "";
    return `
      <div>
        <div class="section-kicker">${SECTION_TITLES[section]}</div>
        ${subtitle}
      </div>
    `;
  }

  function promptText(item) {
    const prompt = item.id === "f_design_influences"
      ? item.prompt.replace("请说明；若没有，也请说明。", "请说明；若没有或不想补充，也可留空。")
      : item.prompt;
    return `${prompt}${item.required === false ? "（可选）" : ""}`;
  }

  function renderSurvey(items, values = {}) {
    let previousSection = null;
    return `
      <div class="survey-list">
        ${items.map((item) => {
          const header = item.section !== previousSection ? sectionHeader(item.section) : "";
          previousSection = item.section;
          if (item.type === "text") {
            return `
              ${header}
              <label class="question-card survey-card" data-question-id="${item.id}">
                <span class="question-text">${promptText(item)}</span>
                <textarea class="text-area" name="${item.id}" rows="4">${values[item.id] || ""}</textarea>
              </label>
            `;
          }
          if (item.type === "number") {
            return `
              ${header}
              <label class="question-card survey-card" data-question-id="${item.id}">
                <span class="question-text">${promptText(item)}</span>
                <input class="text-input" type="number" min="${item.min || ""}" max="${item.max || ""}" name="${item.id}" value="${values[item.id] || ""}">
              </label>
            `;
          }
          if (item.type === "select") {
            return `
              ${header}
              <label class="question-card survey-card" data-question-id="${item.id}">
                <span class="question-text">${promptText(item)}</span>
                <select class="text-input" name="${item.id}">
                  <option value="">请选择</option>
                  ${item.options.map((option) => `<option value="${option}" ${values[item.id] === option ? "selected" : ""}>${option}</option>`).join("")}
                </select>
              </label>
            `;
          }
          return `
            ${header}
            <fieldset class="question-card survey-card" data-question-id="${item.id}">
              <legend class="question-text">${promptText(item)}</legend>
              <div class="likert-scale">${likertButtons(item, values[item.id])}</div>
              <div class="scale-labels"><span>1 = ${item.minLabel}</span><span>7 = ${item.maxLabel}</span></div>
            </fieldset>
          `;
        }).join("")}
      </div>
    `;
  }

  function collectSurvey(root, items) {
    clearMissing(root);
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
      if (responses[item.id] === "" && item.required !== false) missing.push(item.id);
    }
    return { responses, missing };
  }

  function clearMissing(root) {
    root.querySelectorAll(".survey-error-summary, .field-error").forEach((node) => node.remove());
    root.querySelectorAll(".survey-card.is-missing").forEach((node) => node.classList.remove("is-missing"));
  }

  function showMissing(root, missing) {
    clearMissing(root);
    if (!missing.length) return;
    const list = root.querySelector(".survey-list");
    list?.insertAdjacentHTML("beforebegin", `<div class="survey-error-summary">还有 ${missing.length} 题未完成，请先补全标记题目。</div>`);
    missing.forEach((id) => {
      const card = root.querySelector(`[data-question-id="${id}"]`);
      if (!card) return;
      card.classList.add("is-missing");
      card.insertAdjacentHTML("beforeend", `<div class="field-error">请完成此题。</div>`);
    });
    const first = root.querySelector(`[data-question-id="${missing[0]}"]`);
    first?.scrollIntoView({ block: "center", behavior: "smooth" });
    const focusTarget = first?.querySelector("input, select, textarea, button");
    focusTarget?.focus({ preventScroll: true });
  }

  document.addEventListener("input", (event) => {
    const card = event.target.closest?.(".survey-card.is-missing");
    if (!card) return;
    card.classList.remove("is-missing");
    card.querySelectorAll(".field-error").forEach((node) => node.remove());
  });

  document.addEventListener("change", (event) => {
    const card = event.target.closest?.(".survey-card.is-missing");
    if (!card) return;
    card.classList.remove("is-missing");
    card.querySelectorAll(".field-error").forEach((node) => node.remove());
  });

  window.Survey = {
    renderSurvey,
    collectSurvey,
    showMissing
  };
})();
