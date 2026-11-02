// The reporter's page: one issue filed from this machine, its state, and the maintainer's answers. Everything from the server is rendered as text.
(() => {
  const root = document.getElementById('report');
  const element = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
  const when = (iso) => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
  const PILL = { open: 'info', done: 'ok', dropped: 'warn' };
  const id = new URLSearchParams(location.search).get('id') || '';
  const show = (...nodes) => root.replaceChildren(...nodes);

  if (!id) { show(element('p', 'wt-empty', 'No report id in the link.')); return; }
  document.title = id + ' · Your report · Whose Turn';
  fetch('/api/feedback?id=' + encodeURIComponent(id)).then((r) => r.json()).then((j) => {
    const report = j.report;
    if (!report) { show(element('p', 'wt-empty', 'No report ' + id + ' was filed from this machine.')); return; }
    const head = element('header', 'wt-report-head');
    head.append(element('span', 'wt-report-id', report.id), element('h1', '', report.title), element('span', 'wt-pill ' + (PILL[report.outcome] || 'info'), report.state || 'filed, not yet seen'));
    const meta = element('p', 'wt-report-meta', (report.kind || 'report') + ' · filed ' + when(report.filed_at) + (report.changed_at ? ' · last change ' + when(report.changed_at) : ''));
    const body = element('section', 'wt-report-section');
    body.append(element('h2', '', 'What you reported'), element('p', 'wt-report-text', report.body || '(no text kept)'));
    const answers = element('section', 'wt-report-section');
    answers.append(element('h2', '', 'Answers'));
    if (report.unanswered) {
      answers.append(element('p', 'wt-report-unanswered', 'Closed without an answer. The maintainer owes you a reason; this page will show it once it is written.'));
    } else if (!report.answers.length) {
      answers.append(element('p', 'wt-empty', 'No answer yet.'));
    }
    for (const answer of report.answers) {
      const item = element('article', 'wt-report-answer');
      item.append(element('p', 'wt-report-answer-meta', (answer.by || 'maintainer') + ' · ' + when(answer.at)), element('p', 'wt-report-text', answer.text));
      answers.append(item);
    }
    show(head, meta, body, answers);
  }).catch(() => show(element('p', 'wt-empty', 'The monitor did not answer. Is it running?')));
})();
