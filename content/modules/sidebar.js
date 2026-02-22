/**
 * DOM Review — Sidebar Module (Track 8, Layer 2)
 *
 * Renders the review list panel inside the Shadow DOM sidebar container.
 * Supports filtering (all/open/resolved), sorting (priority/date/category),
 * and actions (locate, resolve, edit, delete).
 *
 * Depends on: ui (Track 4), store (Track 1), commentPanel (Track 6)
 * Registers: window.__domReview.sidebar
 */
(() => {
  'use strict';
  window.__domReview = window.__domReview || {};

  let visible = false;
  let needsRender = false;
  let currentFilter = 'all'; // 'all' | 'open' | 'resolved'
  let currentSort = 'date';  // 'priority' | 'date' | 'category'
  let currentSearch = '';

  const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function getContainer() {
    const { ui } = window.__domReview;
    return ui.getShadowRoot().getElementById('dr-sidebar');
  }

  function filterReviews(reviews) {
    let result = reviews;
    if (currentFilter === 'open') result = result.filter(r => !r.resolved);
    if (currentFilter === 'resolved') result = result.filter(r => r.resolved);
    if (currentSearch) {
      const q = currentSearch.toLowerCase();
      result = result.filter(r =>
        (r.comment && r.comment.toLowerCase().includes(q)) ||
        (r.selector && r.selector.toLowerCase().includes(q)) ||
        (r.category && r.category.toLowerCase().includes(q)) ||
        (r.replies && r.replies.some(rp => rp.comment && rp.comment.toLowerCase().includes(q)))
      );
    }
    return result;
  }

  function sortReviews(reviews) {
    const sorted = reviews.slice();
    if (currentSort === 'priority') {
      sorted.sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2));
    } else if (currentSort === 'date') {
      sorted.sort((a, b) => new Date(b.created) - new Date(a.created));
    } else if (currentSort === 'category') {
      sorted.sort((a, b) => (a.category || '').localeCompare(b.category || ''));
    }
    return sorted;
  }

  function formatDate(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  }

  function renderContextBlock(context) {
    if (!context) return '';
    const rows = [];
    const fw = context.framework;
    if (fw) {
      rows.push(`<div class="dr-context-section">Framework</div>`);
      rows.push(contextRow('framework', fw.framework));
      rows.push(contextRow('component', fw.componentName));
      if (fw.filePath) rows.push(contextRow('file', fw.filePath));
      if (fw.parentComponentName) rows.push(contextRow('parent', fw.parentComponentName));
      if (fw.props && Object.keys(fw.props).length > 0) {
        rows.push(`<div class="dr-context-section">Props</div>`);
        for (const [k, v] of Object.entries(fw.props)) {
          rows.push(contextRow(k, typeof v === 'string' ? v : JSON.stringify(v)));
        }
      }
      if (fw.state && Object.keys(fw.state).length > 0) {
        rows.push(`<div class="dr-context-section">State</div>`);
        for (const [k, v] of Object.entries(fw.state)) {
          rows.push(contextRow(k, typeof v === 'string' ? v : JSON.stringify(v)));
        }
      }
    }
    rows.push(`<div class="dr-context-section">Element</div>`);
    if (context.tagName) rows.push(contextRow('tag', context.tagName));
    if (context.styles) {
      if (context.styles.fontSize) rows.push(contextRow('font', context.styles.fontSize));
      if (context.styles.color) rows.push(contextRow('color', context.styles.color));
      if (context.styles.display) rows.push(contextRow('display', context.styles.display));
    }
    if (context.a11y && context.a11y.role) rows.push(contextRow('role', context.a11y.role));
    if (rows.length === 0) return '';
    const uid = 'ctx-' + Math.random().toString(36).slice(2, 8);
    return `
      <button class="dr-context-toggle" data-toggle="${uid}">
        <span class="dr-context-arrow" id="arrow-${uid}">\u25B6</span> Context
      </button>
      <div class="dr-context-body" id="${uid}">
        ${rows.join('')}
      </div>
    `;
  }

  function contextRow(key, value) {
    return `<div class="dr-context-row"><span class="dr-context-key">${escapeHtml(key)}</span><span class="dr-context-val" title="${escapeHtml(String(value))}">${escapeHtml(String(value))}</span></div>`;
  }

  function renderReplies(replies) {
    if (!replies || replies.length === 0) return '';
    return `
      <div class="dr-review-replies">
        ${replies.map(r => `
          <div class="dr-reply">
            <div class="dr-reply-header">
              <span class="dr-reply-author">${escapeHtml(r.author || 'unknown')}</span>
              <span class="dr-reply-date">${formatDate(r.created)}</span>
            </div>
            <div class="dr-reply-text">${escapeHtml(r.comment)}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderCard(review, index) {
    const priorityClass = `dr-pill--${review.priority}`;
    const resolvedClass = review.resolved ? ' dr-resolved' : '';
    return `
      <div class="dr-review-card${resolvedClass}" data-review-id="${escapeHtml(review.id)}">
        <div class="dr-review-header">
          <span class="dr-review-number">#${index + 1}</span>
          <span class="dr-pill ${priorityClass} dr-active" style="pointer-events:none;font-size:11px;padding:2px 7px;">${escapeHtml(review.priority)}</span>
          <span class="dr-pill dr-active" style="pointer-events:none;font-size:11px;padding:2px 7px;">${escapeHtml(review.category)}</span>
          ${review.resolved ? '<span class="dr-pill" style="pointer-events:none;font-size:11px;padding:2px 7px;background:#22c55e;color:white;border-color:#22c55e;">resolved</span>' : ''}
        </div>
        <div class="dr-review-selector">${escapeHtml(review.selector)}</div>
        <div class="dr-review-comment">${escapeHtml(review.comment)}</div>
        ${renderReplies(review.replies)}
        <div class="dr-reply-input-wrap" data-review-id="${escapeHtml(review.id)}">
          <textarea class="dr-reply-input" data-reply-for="${escapeHtml(review.id)}" placeholder="Add a comment..." rows="1"></textarea>
          <button class="dr-btn dr-btn--small dr-btn--primary dr-reply-send dr-hidden" data-action="send-reply" data-id="${escapeHtml(review.id)}">Send</button>
        </div>
        ${renderContextBlock(review.context)}
        <div class="dr-review-meta">${formatDate(review.created)}${review.updated ? ' (edited)' : ''}</div>
        <div class="dr-review-actions">
          <button class="dr-btn dr-btn--small" data-action="locate" data-id="${escapeHtml(review.id)}">Locate</button>
          <button class="dr-btn dr-btn--small" data-action="${review.resolved ? 'unresolve' : 'resolve'}" data-id="${escapeHtml(review.id)}">${review.resolved ? 'Reopen' : 'Resolve'}</button>
          <button class="dr-btn dr-btn--small" data-action="edit" data-id="${escapeHtml(review.id)}">Edit</button>
          <button class="dr-btn dr-btn--small dr-btn--danger" data-action="delete" data-id="${escapeHtml(review.id)}">Delete</button>
        </div>
      </div>
    `;
  }

  function buildFilterPill(value, label) {
    const active = currentFilter === value ? ' dr-active' : '';
    return `<span class="dr-pill${active}" data-filter="${value}">${label}</span>`;
  }

  // --- Public API ---

  function render() {
    if (!visible) { needsRender = true; return; }
    needsRender = false;

    const container = getContainer();
    if (!container) return;

    const { store } = window.__domReview;
    const allReviews = store.getAll();
    const filtered = sortReviews(filterReviews(allReviews));
    const openCount = allReviews.filter(r => !r.resolved).length;
    const resolvedCount = allReviews.filter(r => r.resolved).length;

    container.innerHTML = `
      <div class="dr-sidebar-header">
        <span class="dr-sidebar-title">Reviews (${allReviews.length})</span>
        <button class="dr-btn dr-btn--icon" id="dr-sidebar-close">\u00D7</button>
      </div>
      <div class="dr-sidebar-filters">
        ${buildFilterPill('all', `All (${allReviews.length})`)}
        ${buildFilterPill('open', `Open (${openCount})`)}
        ${buildFilterPill('resolved', `Resolved (${resolvedCount})`)}
      </div>
      <div class="dr-sidebar-search-sort">
        <input type="text" class="dr-search-input" id="dr-sidebar-search" placeholder="Search..." value="${escapeHtml(currentSearch)}">
        <select class="dr-select" id="dr-sidebar-sort">
          <option value="date"${currentSort === 'date' ? ' selected' : ''}>Date</option>
          <option value="priority"${currentSort === 'priority' ? ' selected' : ''}>Priority</option>
          <option value="category"${currentSort === 'category' ? ' selected' : ''}>Category</option>
        </select>
      </div>
      <div class="dr-sidebar-list" id="dr-sidebar-list">
        ${filtered.length ? filtered.map((r, i) => renderCard(r, i)).join('') : '<div class="dr-sidebar-empty">No reviews yet.<br>Click "Select" to start reviewing.</div>'}
      </div>
    `;

    // --- Wire events (event delegation) ---

    // Close
    container.querySelector('#dr-sidebar-close').addEventListener('click', () => hide());

    // Filter pills
    container.querySelector('.dr-sidebar-filters').addEventListener('click', (e) => {
      const pill = e.target.closest('.dr-pill');
      if (!pill || !pill.dataset.filter) return;
      currentFilter = pill.dataset.filter;
      render();
    });

    // Search input
    container.querySelector('#dr-sidebar-search').addEventListener('input', (e) => {
      currentSearch = e.target.value;
      render();
      // Restore focus and cursor position after re-render
      const input = container.querySelector('#dr-sidebar-search');
      if (input) { input.focus(); input.selectionStart = input.selectionEnd = input.value.length; }
    });

    // Sort select
    container.querySelector('#dr-sidebar-sort').addEventListener('change', (e) => {
      currentSort = e.target.value;
      render();
    });

    // Context toggle (event delegation)
    const list = container.querySelector('#dr-sidebar-list');
    list.addEventListener('click', (e) => {
      const toggle = e.target.closest('[data-toggle]');
      if (toggle) {
        const uid = toggle.dataset.toggle;
        const body = container.querySelector('#' + uid);
        const arrow = container.querySelector('#arrow-' + uid);
        if (body) body.classList.toggle('open');
        if (arrow) arrow.classList.toggle('open');
        return;
      }
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      if (action === 'send-reply') {
        const textarea = list.querySelector(`textarea[data-reply-for="${CSS.escape(id)}"]`);
        if (!textarea) return;
        const text = textarea.value.trim();
        if (!text) return;
        handleAction('add-reply', id, text);
        return;
      }
      handleAction(action, id);
    });

    // Reply input: auto-grow + show/hide send button
    list.addEventListener('input', (e) => {
      if (!e.target.matches('.dr-reply-input')) return;
      e.target.style.height = 'auto';
      e.target.style.height = e.target.scrollHeight + 'px';
      const wrap = e.target.closest('.dr-reply-input-wrap');
      const sendBtn = wrap && wrap.querySelector('.dr-reply-send');
      if (sendBtn) {
        if (e.target.value.trim()) sendBtn.classList.remove('dr-hidden');
        else sendBtn.classList.add('dr-hidden');
      }
    });

    // Reply input: Ctrl+Enter / Cmd+Enter to send
    list.addEventListener('keydown', (e) => {
      if (!e.target.matches('.dr-reply-input')) return;
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        const text = e.target.value.trim();
        if (!text) return;
        const reviewId = e.target.dataset.replyFor;
        handleAction('add-reply', reviewId, text);
      }
    });
  }

  function handleAction(action, id, extra) {
    const { store, commentPanel } = window.__domReview;

    switch (action) {
      case 'add-reply': {
        const review = store.get(id);
        if (!review) return;
        const replies = (review.replies || []).slice();
        replies.push({
          id: 'rp_' + Date.now(),
          comment: extra,
          author: 'user',
          created: new Date().toISOString(),
        });
        store.update(id, { replies });
        break;
      }
      case 'locate': {
        const review = store.get(id);
        if (!review) return;
        try {
          const el = document.querySelector(review.selector);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.setAttribute('data-dom-review-hover', '');
            setTimeout(() => el.removeAttribute('data-dom-review-hover'), 1500);
          }
        } catch { /* invalid selector */ }
        break;
      }
      case 'resolve':
        store.resolve(id);
        break;
      case 'unresolve':
        store.unresolve(id);
        break;
      case 'edit': {
        const review = store.get(id);
        if (review && commentPanel) commentPanel.showEdit(review);
        break;
      }
      case 'delete': {
        if (confirm('Delete this review?')) store.remove(id);
        break;
      }
    }
  }

  function show() {
    const container = getContainer();
    if (!container) return;
    visible = true;
    container.classList.remove('dr-hidden');
    window.__domReview.ui.showSidebar();
    if (needsRender) render(); else render();
  }

  function hide() {
    const container = getContainer();
    if (!container) return;
    visible = false;
    container.classList.add('dr-hidden');
    window.__domReview.ui.hideSidebar();
  }

  function toggle() {
    if (visible) hide(); else show();
  }

  function scrollToReview(id) {
    const container = getContainer();
    if (!container) return;
    const card = container.querySelector(`[data-review-id="${CSS.escape(id)}"]`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.style.borderColor = 'var(--dr-accent)';
      setTimeout(() => { card.style.borderColor = ''; }, 2000);
    }
  }

  window.__domReview.sidebar = { show, hide, toggle, render, scrollToReview };
})();
