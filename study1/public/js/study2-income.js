(function () {
  function renderPlaceholder(message) {
    return `
      <section class="panel">
        <div class="section-kicker">Study 2</div>
        <h1>收入申报任务暂未开放</h1>
        <p>${message}</p>
      </section>
    `;
  }

  window.Study2Income = {
    renderPlaceholder
  };
})();
