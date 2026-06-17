function createChatUI(container, members, options = {}) {
  const layout = document.createElement('div');
  layout.className = 'chat-layout';

  const sidebar = document.createElement('div');
  sidebar.className = 'member-sidebar';
  sidebar.innerHTML = '<h4>团队成员</h4>';
  const memberList = document.createElement('div');
  members.forEach((m) => {
    const item = document.createElement('div');
    item.className = 'member-item';
    item.innerHTML = `<span class="member-avatar">${m.avatar}</span><span>${m.name}</span>`;
    memberList.appendChild(item);
  });
  sidebar.appendChild(memberList);

  const panel = document.createElement('div');
  panel.className = 'chat-panel';
  const messages = document.createElement('div');
  messages.className = 'chat-messages';
  messages.id = 'chat-messages';

  const inputArea = document.createElement('div');
  inputArea.className = 'chat-input-area';
  inputArea.innerHTML = `
    <input type="text" id="chat-input" placeholder="输入消息..." autocomplete="off" />
    <button type="button" class="btn btn-primary" id="chat-send">发送</button>
  `;

  panel.appendChild(messages);
  panel.appendChild(inputArea);
  layout.appendChild(sidebar);
  layout.appendChild(panel);
  container.appendChild(layout);

  const inputEl = inputArea.querySelector('#chat-input');
  const sendBtn = inputArea.querySelector('#chat-send');
  const userSender = { name: '您', avatar: '👤' };

  const api = {
    messagesEl: messages,
    inputEl,
    sendBtn,
    addMessage(sender, text, isUser = false) {
      const msg = document.createElement('div');
      msg.className = `chat-msg ${isUser ? 'user' : 'bot'}`;
      msg.innerHTML = `
        <span class="msg-avatar">${sender.avatar || '💬'}</span>
        <div class="msg-body">
          <div class="msg-sender">${sender.name}</div>
          <div class="msg-bubble">${text}</div>
        </div>
      `;
      messages.appendChild(msg);
      messages.scrollTop = messages.scrollHeight;
      return msg;
    },
    async addMessagesSequentially(items, gapMs = 1200) {
      for (const item of items) {
        await delay(gapMs);
        this.addMessage(item.sender, item.text, item.isUser);
      }
    },
  };

  async function handleSend() {
    const text = inputEl.value.trim();
    if (!text || sendBtn.disabled) return;

    inputEl.value = '';
    api.addMessage(userSender, text, true);

    if (options.onSend) {
      sendBtn.disabled = true;
      inputEl.disabled = true;
      try {
        await options.onSend(text, api);
      } catch (err) {
        api.addMessage({ name: '系统', avatar: '⚠️' }, `发送失败：${err.message}`);
      } finally {
        sendBtn.disabled = false;
        inputEl.disabled = false;
        inputEl.focus();
      }
    }
  }

  sendBtn.addEventListener('click', handleSend);
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  return api;
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

window.ChatUI = { createChatUI, delay };
