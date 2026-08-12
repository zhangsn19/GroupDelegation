(function () {
  // Legacy opening script retained only for historical/non-Human-AI sessions.
  const LEGACY_OPENING_MESSAGES = [
    ["群聊 AI", "大家好，任务群已经建好了。"],
    ["张明", "收到，我这边已经准备好了。"],
    ["李华", "我也进来了，等系统提示。"],
    ["王芳", "好的，我这边可以开始。"],
    ["陈思", "明白，按流程来。"],
    ["群聊 AI", "本次任务中，5 名成员将分别完成自己的个人提交。"],
    ["群聊 AI", "每个人的结果独立结算；你的最终提交不会向其他成员展示。"],
    ["群聊 AI", "我会按每位成员自己的选择完成提交，不提供建议、评价或修改。"]
  ];

  function createReadOnlyChat(container, members, options = {}) {
    const layout = document.createElement("div");
    layout.className = "chat-layout";

    const sidebar = document.createElement("aside");
    sidebar.className = "member-sidebar";
    sidebar.innerHTML = `<h4>${options.sidebarTitle || "Work group"}</h4>`;

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
    note.textContent = options.sidebarNote || "The Submission System records each member's report.";
    sidebar.appendChild(note);

    const panel = document.createElement("section");
    panel.className = "chat-panel";
    const messages = document.createElement("div");
    messages.className = "chat-messages";
    panel.appendChild(messages);
    const footerText = Object.prototype.hasOwnProperty.call(options, "footerText")
      ? options.footerText
      : "The Submission System records each member's report.";
    if (footerText) {
      const footer = document.createElement("div");
      footer.className = "read-only-footer";
      footer.textContent = footerText;
      panel.appendChild(footer);
    }

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
      addSystemNotice(text) {
        const notice = document.createElement("div");
        notice.className = "system-notice";
        notice.innerHTML = `<span class="system-notice-label">SUBMISSION SYSTEM</span><span></span>`;
        notice.lastElementChild.textContent = text;
        messages.appendChild(notice);
        messages.scrollTop = messages.scrollHeight;
        return notice;
      },
      async addMessagesSequentially(items, gapMs = 650) {
        for (const item of items) {
          await delay(gapMs);
          if (item.kind === "notice") this.addSystemNotice(item.text);
          else this.addMessage(item.sender, item.text, item.tone || "bot");
        }
      }
    };
  }

  function avatarFor(name) {
    if (name === "Submission System") return "SYSTEM";
    if (name === "你") return "你";
    return String(name || "员").slice(0, 1);
  }

  function identityIntroMessages(members) {
    return members
      .filter((member) => member.id !== "participant")
      .map((member) => ({ sender: member, text: `${member.name} is ready.`, tone: "system" }));
  }

  function introMessages(members) {
    const byName = Object.fromEntries(members.map((member) => [member.name, member]));
    return LEGACY_OPENING_MESSAGES.map(([name, text]) => ({
      sender: byName[name] || { name, avatar: avatarFor(name) },
      text
    }));
  }

  function peerRecordMessages(members, records) {
    const byName = Object.fromEntries(members.map((member) => [member.name, member]));
    const byId = Object.fromEntries(members.map((member) => [member.id, member]));
    return records.map((record) => ({
      sender: byId[record.member_id] || byName[record.name] || { name: record.name, avatar: avatarFor(record.name) },
      text: record.text
    }));
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  window.ChatView = {
    createReadOnlyChat,
    introMessages,
    identityIntroMessages,
    peerRecordMessages,
    delay
  };
})();
