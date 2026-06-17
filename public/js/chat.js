function createChatUI(container, members, options = {}) {
  const layout = document.createElement('div');
  layout.className = 'chat-layout';

  const sidebar = document.createElement('div');
  sidebar.className = 'member-sidebar';
  sidebar.innerHTML = '<h4>团队成员</h4>';

  if (options.topologyNodes) {
    sidebar.appendChild(renderTopologyDiagram(options.topologyNodes, options.topology));
  }

  const memberList = document.createElement('div');
  memberList.className = 'member-list';
  members.forEach((m) => {
    const item = document.createElement('div');
    item.className = 'member-item' + (m.role === 'participant' ? ' member-item-you' : '');
    const label = m.relationshipLabel
      ? `<span class="member-role">${m.relationshipLabel}</span>`
      : '';
    item.innerHTML = `
      <span class="member-avatar">${m.avatar}</span>
      <div class="member-info">
        <span class="member-name">${m.name}</span>
        ${label}
      </div>
    `;
    memberList.appendChild(item);
  });
  sidebar.appendChild(memberList);

  if (options.topology?.summary) {
    const topoNote = document.createElement('p');
    topoNote.className = 'topology-summary';
    topoNote.textContent = options.topology.summary;
    sidebar.appendChild(topoNote);
  }

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
      const roleTag = sender.relationshipLabel && !isUser
        ? `<span class="msg-role-tag">${sender.relationshipLabel}</span>`
        : '';
      msg.innerHTML = `
        <span class="msg-avatar">${sender.avatar || '💬'}</span>
        <div class="msg-body">
          <div class="msg-sender">${sender.name}${roleTag}</div>
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

function renderTopologyDiagram(topologyNodes, topology) {
  const wrap = document.createElement('div');
  wrap.className = 'topology-diagram';

  if (topologyNodes.type === 'star') {
    wrap.innerHTML = `
      <div class="topo-title">星形网络</div>
      <div class="topo-star">
        <div class="topo-peers">
          ${topologyNodes.peers.map((p) => `<span class="topo-node" title="${p.relationshipLabel || ''}">${p.avatar}</span>`).join('')}
        </div>
        <div class="topo-center-row">
          <span class="topo-node topo-downstream" title="${topologyNodes.downstream?.relationshipLabel || ''}">${topologyNodes.downstream?.avatar || '🤝'}</span>
          <span class="topo-arrow">→</span>
          <span class="topo-node topo-center" title="委托者">${topologyNodes.center?.avatar || '👤'}</span>
        </div>
        <div class="topo-caption">您居中心 · 受托节点执行上报</div>
      </div>
    `;
  } else if (topologyNodes.type === 'hierarchy') {
    const chainHtml = topologyNodes.chain
      .map((n) => {
        const cls = n.isYou ? 'topo-node topo-you' : 'topo-node';
        return `<span class="${cls}" title="${n.relationshipLabel || ''}">${n.avatar}</span>`;
      })
      .join('<span class="topo-arrow">→</span>');

    const aiHtml = topologyNodes.ai
      ? `<div class="topo-ai-branch">
          <span class="topo-ai-label">${topologyNodes.aiTopology === 'bypass' ? '旁路' : topologyNodes.aiTopology === 'upstream' ? '上游' : '下游'}</span>
          <span class="topo-node topo-ai" title="${topologyNodes.ai.relationshipLabel || ''}">${topologyNodes.ai.avatar}</span>
        </div>`
      : '';

    wrap.innerHTML = `
      <div class="topo-title">层级链 · ${topology?.aiTopologyLabel || ''}</div>
      <div class="topo-chain">${chainHtml}</div>
      ${aiHtml}
      <div class="topo-caption">起草 → 审核 → 签发</div>
    `;
  }

  return wrap;
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

window.ChatUI = { createChatUI, delay };
