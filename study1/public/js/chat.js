(function () {
  function createReadOnlyChat(container, members, options = {}) {
    const layout = document.createElement("div");
    layout.className = "chat-layout";

    const sidebar = document.createElement("aside");
    sidebar.className = "member-sidebar";
    sidebar.innerHTML = `<h4>${options.sidebarTitle || "模拟同事群体"}</h4>`;

    const memberList = document.createElement("div");
    memberList.className = "member-list";
    members.forEach((member) => {
      const item = document.createElement("div");
      item.className = `member-item ${member.id === "participant" ? "member-item-you" : ""}`;
      item.innerHTML = `
        <span class="member-avatar">${member.avatar || avatarFor(member.name)}</span>
        <div class="member-info">
          <span class="member-name">${member.name}</span>
          <span class="member-role">${member.role}</span>
        </div>
      `;
      memberList.appendChild(item);
    });
    sidebar.appendChild(memberList);

    const note = document.createElement("p");
    note.className = "sidebar-note";
    note.textContent = "群聊 AI 只按每位成员的个人选择完成提交，不提供建议或评价。";
    sidebar.appendChild(note);

    const panel = document.createElement("section");
    panel.className = "chat-panel";

    const messages = document.createElement("div");
    messages.className = "chat-messages";
    panel.appendChild(messages);

    const footer = document.createElement("div");
    footer.className = "read-only-footer";
    footer.textContent = options.footerText || "只读群聊记录";
    panel.appendChild(footer);

    layout.appendChild(sidebar);
    layout.appendChild(panel);
    container.appendChild(layout);

    return {
      layout,
      messagesEl: messages,
      addMessage(sender, text, tone = "bot") {
        const msg = document.createElement("div");
        msg.className = `chat-msg ${tone}`;
        msg.innerHTML = `
          <span class="msg-avatar">${sender.avatar || avatarFor(sender.name)}</span>
          <div class="msg-body">
            <div class="msg-sender">${sender.name}</div>
            <div class="msg-bubble">${text}</div>
          </div>
        `;
        messages.appendChild(msg);
        messages.scrollTop = messages.scrollHeight;
        return msg;
      },
      async addMessagesSequentially(items, gapMs = 650) {
        for (const item of items) {
          await delay(gapMs);
          this.addMessage(item.sender, item.text, item.tone || "bot");
        }
      }
    };
  }

  function avatarFor(name) {
    if (name === "群聊 AI") return "AI";
    if (name === "你") return "你";
    return "聊";
  }

  function introMessages(members) {
    const byName = Object.fromEntries(members.map((member) => [member.name, member]));
    return [
      { sender: byName["群聊 AI"], text: "大家好，任务群已经建好了。" },
      { sender: byName["张明"], text: "收到，我这边已经准备好了。" },
      { sender: byName["李华"], text: "我也进来了，等系统提示。" },
      { sender: byName["王芳"], text: "好的，我这边可以开始。" },
      { sender: byName["陈思"], text: "明白，按流程来。" },
      { sender: byName["群聊 AI"], text: "本次任务中，5 名成员将分别完成自己的个人提交。" },
      { sender: byName["群聊 AI"], text: "每个人的结果独立结算；你的最终提交不会向其他成员展示。" },
      { sender: byName["群聊 AI"], text: "我会按每位成员自己的选择完成提交，不提供建议、评价或修改。" }
    ];
  }

  function peerRecordMessages(members, records) {
    const byName = Object.fromEntries(members.map((member) => [member.name, member]));
    return records.map((record) => ({
      sender: byName[record.name] || { name: record.name },
      text: record.text
    }));
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  window.ChatView = {
    createReadOnlyChat,
    introMessages,
    peerRecordMessages,
    delay
  };
})();
