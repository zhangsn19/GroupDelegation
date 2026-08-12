(function () {
  const SECTION_TITLES = {
    A: "Group norms",
    B: "Social influence",
    C: "Responsibility and moral feelings",
    D: "Information and task checks",
    E: "Identity manipulation",
    F: "Additional comment (optional)"
  };

  const SECTION_SUBTITLES = {
    F: "This question is optional. You may leave it blank."
  };

  function likertButtons(item, value) {
    const points = item.scalePoints || 7;
    return Array.from({ length: points }, (_, index) => {
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
    return `${item.prompt}${item.required === false ? "（可选）" : ""}`;
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
                <input class="text-input" type="number" min="${item.min || ""}" max="${item.max || ""}" step="${item.step || 1}" name="${item.id}" value="${values[item.id] || ""}">
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
                  ${item.options.map((option) => {
                    const optionValue = typeof option === "object" ? option.value : option;
                    const optionLabel = typeof option === "object" ? option.label : option;
                    return `<option value="${optionValue}" ${values[item.id] === optionValue ? "selected" : ""}>${optionLabel}</option>`;
                  }).join("")}
                </select>
              </label>
            `;
          }
          const points = item.scalePoints || 7;
          return `
            ${header}
            <fieldset class="question-card survey-card" data-question-id="${item.id}">
              <legend class="question-text">${promptText(item)}</legend>
              <div class="likert-scale likert-scale--${points}" data-scale-points="${points}">${likertButtons(item, values[item.id])}</div>
              <div class="scale-labels"><span>1 = ${item.minLabel}</span><span>${points} = ${item.maxLabel}</span></div>
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
    root.querySelectorAll(".survey-card.has-field-error").forEach((node) => node.classList.remove("has-field-error"));
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

  function showFieldErrors(root, fieldErrors = {}) {
    clearMissing(root);
    const entries = Object.entries(fieldErrors).filter(([, message]) => message);
    if (!entries.length) return;
    const list = root.querySelector(".survey-list");
    list?.insertAdjacentHTML("beforebegin", `<div class="survey-error-summary">请检查以下信息：</div>`);
    entries.forEach(([id, message]) => {
      const card = root.querySelector(`[data-question-id="${id}"]`);
      if (!card) return;
      card.classList.add("has-field-error");
      card.insertAdjacentHTML("beforeend", `<div class="field-error">${message}</div>`);
    });
    const first = root.querySelector(`[data-question-id="${entries[0][0]}"]`);
    first?.scrollIntoView({ block: "center", behavior: "smooth" });
    first?.querySelector("input, select, textarea, button")?.focus({ preventScroll: true });
  }

  function maybeClearFieldError(event) {
    const card = event.target.closest?.(".survey-card.has-field-error");
    if (!card) return;
    if (event.target.name === "age") {
      const numeric = Number(event.target.value);
      if (!Number.isInteger(numeric) || numeric < 18 || numeric > 100) return;
    }
    card.classList.remove("has-field-error");
    card.querySelectorAll(".field-error").forEach((node) => node.remove());
    if (!document.querySelector(".survey-card.has-field-error")) {
      document.querySelectorAll(".survey-error-summary").forEach((node) => node.remove());
    }
  }

  document.addEventListener("input", (event) => {
    maybeClearFieldError(event);
    const card = event.target.closest?.(".survey-card.is-missing");
    if (!card) return;
    card.classList.remove("is-missing");
    card.querySelectorAll(".field-error").forEach((node) => node.remove());
  });

  document.addEventListener("change", (event) => {
    maybeClearFieldError(event);
    const card = event.target.closest?.(".survey-card.is-missing");
    if (!card) return;
    card.classList.remove("is-missing");
    card.querySelectorAll(".field-error").forEach((node) => node.remove());
  });

  window.Survey = {
    renderSurvey,
    collectSurvey,
    showMissing,
    showFieldErrors
  };
})();
