require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const store = require('./store');
const { generateBotReply } = require('./llm');
const { HOST_SCRIPTS, getDelegateConfirm } = require('./scripts');
const exp1Config = require('../config/experiment1');
const exp2Config = require('../config/experiment2');

const app = express();
const HOST = process.env.HOST || '0.0.0.0';
const PORT = process.env.PORT || 3456;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

function requireSession(req, res, next) {
  const sessionId = req.params.sessionId || req.body.sessionId;
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
  const session = store.readSession(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  req.session = session;
  next();
}

// --- Session management ---

app.post('/api/sessions', (req, res) => {
  const { experimentId, prolificId } = req.body;
  if (!['experiment1', 'experiment2'].includes(experimentId)) {
    return res.status(400).json({ error: 'Invalid experimentId' });
  }

  const condition =
    experimentId === 'experiment1'
      ? exp1Config.assignCondition()
      : exp2Config.assignCondition();

  const session = store.createSession({ experimentId, condition, prolificId });
  store.appendEvent(session.id, { type: 'session_created', condition });

  const payload = {
    sessionId: session.id,
    experimentId,
    condition,
    config: buildExperimentConfig(experimentId, condition),
  };
  res.json(payload);
});

function buildExperimentConfig(experimentId, condition) {
  if (experimentId === 'experiment1') {
    return {
      preSurvey: exp1Config.PRE_SURVEY,
      postSurvey: exp1Config.POST_SURVEY,
      team: exp1Config.buildTeam(condition),
      agentType: condition.agentType,
      teamSize: condition.teamSize,
    };
  }
  return {
    preSurvey: exp2Config.PRE_SURVEY,
    postSurvey: exp2Config.POST_SURVEY,
    plantedErrors: exp2Config.PLANTED_ERRORS.map((e) => ({
      id: e.id,
      type: e.type,
      location: e.location,
      severity: e.severity,
      recognitionLabel: e.recognitionLabel,
    })),
    recognitionItems: exp2Config.getRecognitionItems(),
    recognitionOptions: exp2Config.RECOGNITION_OPTIONS,
    memoContent: exp2Config.MEMO_CONTENT,
    narrative: exp2Config.getWorkflowNarrative(condition),
    team: exp2Config.getTeamMembers(condition),
    role: condition.role,
    roleLabel: exp2Config.ROLE_LABELS[condition.role],
    aiTopology: condition.aiTopology,
    aiTopologyLabel: exp2Config.AI_TOPOLOGY_LABELS[condition.aiTopology],
  };
}

app.get('/api/sessions/:sessionId', requireSession, (req, res) => {
  res.json(req.session);
});

app.patch('/api/sessions/:sessionId/phase', requireSession, (req, res) => {
  const { phase } = req.body;
  const updated = store.updateSession(req.session.id, { phase });
  store.appendEvent(req.session.id, { type: 'phase_change', phase });
  res.json(updated);
});

// --- Surveys ---

app.post('/api/sessions/:sessionId/pre-survey', requireSession, (req, res) => {
  const { responses, durationMs } = req.body;
  const updated = store.updateSession(req.session.id, {
    preSurvey: responses,
    phase: 'task',
    timings: { ...req.session.timings, preSurveyMs: durationMs },
  });
  store.appendEvent(req.session.id, { type: 'pre_survey', responses, durationMs });
  res.json(updated);
});

app.post('/api/sessions/:sessionId/post-survey', requireSession, (req, res) => {
  const { responses, durationMs } = req.body;
  const updated = store.updateSession(req.session.id, {
    postSurvey: responses,
    phase: 'debrief',
    completed: true,
    timings: { ...req.session.timings, postSurveyMs: durationMs },
  });
  store.appendEvent(req.session.id, { type: 'post_survey', responses, durationMs });
  res.json(updated);
});

// --- Experiment 1: Dice task ---

app.post('/api/sessions/:sessionId/exp1/roll', requireSession, (req, res) => {
  const diceValue = Math.floor(Math.random() * 6) + 1;
  const taskData = {
    ...(req.session.taskData || {}),
    diceValue,
    diceRolledAt: new Date().toISOString(),
  };
  store.updateSession(req.session.id, { taskData });
  store.appendEvent(req.session.id, { type: 'dice_roll', diceValue });
  res.json({ diceValue });
});

app.post('/api/sessions/:sessionId/exp1/delegate', requireSession, async (req, res) => {
  const { instruction, reportedValue } = req.body;
  const session = req.session;
  const diceValue = session.taskData?.diceValue;
  if (!diceValue) return res.status(400).json({ error: 'Dice not rolled yet' });

  const deviation = reportedValue - diceValue;
  const bonus = exp1Config.dicePayout(reportedValue);

  const delegate = exp1Config.buildTeam(session.condition).find((m) => m.role === 'delegate');
  const confirmFallback = getDelegateConfirm();
  const botReply = await generateBotReply({
    role: session.condition.agentType === 'ai' ? 'ai_assistant' : 'delegate',
    context: `被试指令：请上报数字 ${reportedValue}`,
    fallback: confirmFallback,
  });

  const taskData = {
    ...session.taskData,
    instruction,
    reportedValue,
    deviation,
    bonus,
    delegatedAt: new Date().toISOString(),
    delegateReply: botReply.message,
    delegateReplySource: botReply.source,
  };

  store.updateSession(session.id, { taskData });
  store.appendEvent(session.id, {
    type: 'delegation',
    diceValue,
    reportedValue,
    deviation,
    instruction,
    bonus,
    delegateReply: botReply.message,
  });

  res.json({
    deviation,
    bonus,
    delegateReply: botReply.message,
    delegateReplySource: botReply.source,
    delegateName: delegate.name,
  });
});

app.post('/api/sessions/:sessionId/exp1/chat', requireSession, async (req, res) => {
  const { message, botRole } = req.body;
  const fallbacks = {
    host: '好的，我们继续。',
    member: '收到！',
    delegate: getDelegateConfirm(),
  };

  const botReply = await generateBotReply({
    role: botRole || 'member',
    context: message,
    fallback: fallbacks[botRole] || fallbacks.member,
  });

  store.appendEvent(req.session.id, { type: 'chat', role: 'participant', message });
  store.appendEvent(req.session.id, {
    type: 'chat',
    role: botRole,
    message: botReply.message,
    source: botReply.source,
  });

  res.json({ reply: botReply.message, source: botReply.source });
});

// --- Experiment 1: Scripted host messages ---

app.get('/api/sessions/:sessionId/exp1/script/:step', requireSession, (req, res) => {
  const { step } = req.params;
  const { condition } = req.session;
  const team = exp1Config.buildTeam(condition);
  const delegate = team.find((m) => m.role === 'delegate');

  let messages = [];
  switch (step) {
    case 'overview':
      messages = [HOST_SCRIPTS.exp1_overview(condition.teamSize)];
      break;
    case 'intros':
      messages = HOST_SCRIPTS.exp1_intro_round(team);
      break;
    case 'rules':
      messages = HOST_SCRIPTS.exp1_task_rules(delegate.name, condition.agentType);
      break;
    case 'dice':
      messages = [HOST_SCRIPTS.exp1_dice_announce];
      break;
    case 'debrief':
      messages = [HOST_SCRIPTS.exp1_debrief];
      break;
    default:
      return res.status(400).json({ error: 'Unknown script step' });
  }

  for (const msg of messages) {
    store.appendEvent(req.session.id, { type: 'script', step, message: msg });
  }
  res.json({ messages });
});

// --- Experiment 2: Legal memo ---

app.get('/api/sessions/:sessionId/exp2/script/:step', requireSession, (req, res) => {
  const { step } = req.params;
  const { condition } = req.session;
  const narrative = exp2Config.getWorkflowNarrative(condition);
  const team = exp2Config.getTeamMembers(condition);

  let messages = [];
  switch (step) {
    case 'overview':
      messages = HOST_SCRIPTS.exp2_overview(narrative);
      break;
    case 'intros':
      messages = HOST_SCRIPTS.exp2_team_intro(team);
      break;
    case 'workflow':
      messages = HOST_SCRIPTS.exp2_workflow(condition.role);
      break;
    default:
      return res.status(400).json({ error: 'Unknown script step' });
  }

  for (const msg of messages) {
    store.appendEvent(req.session.id, { type: 'script', step, message: msg });
  }
  res.json({ messages });
});

app.post('/api/sessions/:sessionId/exp2/submit', requireSession, (req, res) => {
  const {
    caughtErrors,
    reportedErrors,
    verificationActions,
    decision,
    annotations,
    reviewStartedAt,
    reviewDurationMs,
  } = req.body;

  const totalErrors = exp2Config.PLANTED_ERRORS.length;
  const reported = Array.isArray(reportedErrors || caughtErrors)
    ? (reportedErrors || caughtErrors)
    : [];
  const reportRate = reported.length / totalErrors;

  const taskData = {
    ...(req.session.taskData || {}),
    reportedErrors: reported,
    caughtErrors: reported, // legacy alias
    reportRate,
    catchRate: reportRate, // legacy alias
    totalPlantedErrors: totalErrors,
    verificationActions: verificationActions || req.session.taskData?.verificationActions || [],
    verificationCount: (verificationActions || req.session.taskData?.verificationActions || []).length,
    decision,
    annotations: annotations || [],
    reviewStartedAt,
    reviewDurationMs,
    submittedAt: new Date().toISOString(),
  };

  store.updateSession(req.session.id, {
    taskData,
    timings: { ...req.session.timings, reviewDurationMs },
  });
  store.appendEvent(req.session.id, { type: 'memo_submit', ...taskData });

  res.json({
    reportRate,
    catchRate: reportRate,
    totalErrors,
    reportedCount: reported.length,
    caughtCount: reported.length,
  });
});

app.post('/api/sessions/:sessionId/exp2/recognition', requireSession, (req, res) => {
  const { recognitionResponses, durationMs } = req.body;
  const taskData = req.session.taskData || {};
  const reported = taskData.reportedErrors || taskData.caughtErrors || [];
  const metrics = exp2Config.computeRecognitionMetrics(recognitionResponses, reported);

  const updatedTaskData = {
    ...taskData,
    ...metrics,
    recognitionDurationMs: durationMs,
    recognitionCompletedAt: new Date().toISOString(),
  };

  store.updateSession(req.session.id, {
    taskData: updatedTaskData,
    timings: { ...req.session.timings, recognitionMs: durationMs },
  });
  store.appendEvent(req.session.id, { type: 'recognition_test', ...metrics, durationMs });

  res.json(metrics);
});

app.post('/api/sessions/:sessionId/exp2/verify', requireSession, (req, res) => {
  const { actionType, target } = req.body;
  const event = { type: 'verification', actionType, target, ts: new Date().toISOString() };
  store.appendEvent(req.session.id, event);

  const taskData = req.session.taskData || {};
  const actions = taskData.verificationActions || [];
  actions.push({ actionType, target, ts: event.ts });
  store.updateSession(req.session.id, { taskData: { ...taskData, verificationActions: actions } });

  res.json({ ok: true, count: actions.length });
});

// --- Events & timing ---

app.post('/api/sessions/:sessionId/events', requireSession, (req, res) => {
  const event = store.appendEvent(req.session.id, req.body);
  res.json(event);
});

app.post('/api/sessions/:sessionId/timing', requireSession, (req, res) => {
  const updated = store.updateSession(req.session.id, {
    timings: { ...req.session.timings, ...req.body },
  });
  res.json(updated.timings);
});

// --- Admin export ---

app.get('/api/admin/info', (req, res) => {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const sessions = store.listSessions();
  res.json({
    dataDirectory: store.SESSIONS_DIR,
    sessionCount: sessions.length,
    completedCount: sessions.filter((s) => s.completed).length,
    exportUrls: {
      json: '/api/admin/export',
      csv: '/api/admin/export?format=csv',
      experiment1: '/api/admin/export?experiment=experiment1&format=csv',
      experiment2: '/api/admin/export?experiment=experiment2&format=csv',
    },
  });
});

app.get('/api/admin/export', (req, res) => {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const format = req.query.format || 'json';
  const experimentId = req.query.experiment;

  if (format === 'csv') {
    const filtered = experimentId
      ? store.listSessions({ experimentId })
      : store.listSessions();
    const rows = filtered.map((s) => flattenForCsv(s));
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=hci_experiment_data.csv');
    return res.send(toCsvExport(rows));
  }

  const data = experimentId
    ? store.listSessions({ experimentId })
    : store.listSessions();
  res.json(data);
});

function flattenForCsv(s) {
  const flat = (obj, prefix) => {
    const out = {};
    for (const [k, v] of Object.entries(obj || {})) {
      const key = prefix ? `${prefix}_${k}` : k;
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
        Object.assign(out, flat(v, key));
      } else {
        out[key] = Array.isArray(v) ? JSON.stringify(v) : v;
      }
    }
    return out;
  };
  return {
    session_id: s.id,
    experiment_id: s.experimentId,
    prolific_id: s.prolificId,
    created_at: s.createdAt,
    completed: s.completed,
    ...flat(s.condition, 'condition'),
    ...flat(s.preSurvey, 'pre'),
    ...flat(s.postSurvey, 'post'),
    ...flat(s.taskData, 'task'),
    ...flat(s.timings, 'timing'),
  };
}

function toCsvExport(rows) {
  if (!rows.length) return '';
  const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const esc = (v) => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n');
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, llmConfigured: !!process.env.LLM_API_KEY });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`HCI Experiment server listening on ${HOST}:${PORT}`);
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  Network: http://<your-lan-ip>:${PORT}`);
});
