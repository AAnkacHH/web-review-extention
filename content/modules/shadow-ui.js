/**
 * DOM Review — Shadow UI Module (Track 4)
 *
 * Creates the Shadow DOM host with toolbar, comment panel container,
 * and sidebar container. All extension UI lives inside closed Shadow DOM.
 *
 * Registers: window.__domReview.ui
 */
(() => {
  'use strict';
  window.__domReview = window.__domReview || {};

  // --- Shadow DOM host ---
  const host = document.createElement('div');
  host.id = 'dom-review-host';
  host.style.cssText = 'position: fixed; z-index: 2147483647; top: 0; left: 0; width: 0; height: 0; pointer-events: none;';
  const shadow = host.attachShadow({ mode: 'closed' });

  // --- Inline styles (from assets/shadow-styles.css + component styles) ---
  const style = document.createElement('style');
  style.textContent = `
    /* === Design Tokens === */
    :host {
      --dr-bg-primary: #1e293b;
      --dr-bg-secondary: #334155;
      --dr-bg-hover: #475569;
      --dr-text-primary: #f8fafc;
      --dr-text-secondary: #94a3b8;
      --dr-accent: #3b82f6;
      --dr-accent-hover: #2563eb;
      --dr-danger: #ef4444;
      --dr-warning: #f59e0b;
      --dr-success: #22c55e;
      --dr-radius: 8px;
      --dr-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      --dr-font: system-ui, -apple-system, sans-serif;
      --dr-font-size: 14px;
    }

    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    /* === Toolbar === */
    .dr-toolbar {
      position: fixed;
      bottom: 16px;
      right: 16px;
      z-index: 2147483647;
      background: var(--dr-bg-primary);
      color: var(--dr-text-primary);
      padding: 8px 12px;
      border-radius: var(--dr-radius);
      font-family: var(--dr-font);
      font-size: var(--dr-font-size);
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: var(--dr-shadow);
      pointer-events: auto;
      user-select: none;
      border: 1px solid rgba(255, 255, 255, 0.08);
    }

    .dr-toolbar-title {
      font-weight: 600;
      font-size: 13px;
      color: var(--dr-text-secondary);
      margin-right: 4px;
    }

    /* === Buttons === */
    .dr-btn {
      background: var(--dr-bg-secondary);
      color: var(--dr-text-primary);
      border: 1px solid rgba(255, 255, 255, 0.06);
      padding: 5px 12px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      font-family: var(--dr-font);
      font-weight: 500;
      transition: background 0.15s, border-color 0.15s;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
      line-height: 1.4;
    }
    .dr-btn:hover { background: var(--dr-bg-hover); border-color: rgba(255, 255, 255, 0.12); }
    .dr-btn:active { transform: scale(0.97); }
    .dr-btn--primary { background: var(--dr-accent); border-color: var(--dr-accent); }
    .dr-btn--primary:hover { background: var(--dr-accent-hover); }
    .dr-btn--danger { background: var(--dr-danger); border-color: var(--dr-danger); color: white; }
    .dr-btn--danger:hover { background: #dc2626; }
    .dr-btn--small { padding: 3px 8px; font-size: 12px; }
    .dr-btn--icon { padding: 3px 6px; font-size: 16px; line-height: 1; background: transparent; border: none; }
    .dr-btn--icon:hover { background: var(--dr-bg-hover); }
    .dr-active { background: var(--dr-warning) !important; color: #1e293b !important; border-color: var(--dr-warning) !important; font-weight: 600; }

    /* === Badge (count) === */
    .dr-badge {
      background: var(--dr-danger);
      color: white;
      border-radius: 50%;
      min-width: 18px;
      height: 18px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 700;
      padding: 0 4px;
    }

    /* === Hidden === */
    .dr-hidden { display: none !important; }

    /* === Comment Panel === */
    .dr-comment-panel {
      position: fixed;
      bottom: 80px;
      right: 16px;
      z-index: 2147483647;
      background: var(--dr-bg-primary);
      color: var(--dr-text-primary);
      border-radius: var(--dr-radius);
      box-shadow: var(--dr-shadow);
      border: 1px solid rgba(255, 255, 255, 0.08);
      width: 380px;
      max-height: 80vh;
      overflow-y: auto;
      font-family: var(--dr-font);
      font-size: var(--dr-font-size);
      pointer-events: auto;
    }
    .dr-panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 14px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }
    .dr-panel-title { font-weight: 600; font-size: 14px; }
    .dr-panel-info {
      padding: 10px 14px;
      background: var(--dr-bg-secondary);
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }
    .dr-panel-tag {
      font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
      font-size: 12px;
      color: var(--dr-accent);
      margin-bottom: 4px;
    }
    .dr-panel-selector {
      font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
      font-size: 11px;
      color: var(--dr-text-secondary);
      word-break: break-all;
    }
    .dr-panel-form { padding: 14px; }
    .dr-panel-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 12px 14px;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
    }
    .dr-panel-context {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 10px;
    }
    .dr-context-item {
      font-size: 11px;
      color: var(--dr-text-secondary);
      background: var(--dr-bg-secondary);
      padding: 2px 8px;
      border-radius: 4px;
      font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
    }

    /* === Form Elements === */
    .dr-label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: var(--dr-text-secondary);
      margin-bottom: 6px;
      margin-top: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .dr-label:first-child { margin-top: 0; }
    .dr-textarea {
      width: 100%;
      min-height: 72px;
      background: var(--dr-bg-secondary);
      color: var(--dr-text-primary);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 6px;
      padding: 8px 10px;
      font-family: var(--dr-font);
      font-size: 13px;
      resize: vertical;
      outline: none;
      transition: border-color 0.15s;
    }
    .dr-textarea:focus { border-color: var(--dr-accent); }
    .dr-textarea::placeholder { color: var(--dr-text-secondary); opacity: 0.6; }
    .dr-select {
      background: var(--dr-bg-secondary);
      color: var(--dr-text-primary);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 6px;
      padding: 5px 8px;
      font-family: var(--dr-font);
      font-size: 13px;
      cursor: pointer;
      outline: none;
    }

    /* === Pills (category & priority) === */
    .dr-pill-group {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .dr-pill {
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 500;
      font-family: var(--dr-font);
      cursor: pointer;
      border: 1px solid rgba(255, 255, 255, 0.1);
      background: var(--dr-bg-secondary);
      color: var(--dr-text-secondary);
      transition: all 0.15s;
    }
    .dr-pill:hover { border-color: rgba(255, 255, 255, 0.2); color: var(--dr-text-primary); }
    .dr-pill.dr-active { background: var(--dr-accent); color: white; border-color: var(--dr-accent); }
    .dr-pill--high.dr-active { background: var(--dr-danger); border-color: var(--dr-danger); }
    .dr-pill--medium.dr-active { background: var(--dr-warning); border-color: var(--dr-warning); color: #1e293b; }
    .dr-pill--low.dr-active { background: var(--dr-bg-hover); border-color: var(--dr-bg-hover); color: var(--dr-text-primary); }

    /* === Sidebar === */
    .dr-sidebar {
      position: fixed;
      bottom: 80px;
      right: 16px;
      z-index: 2147483647;
      width: 360px;
      max-height: calc(100vh - 100px);
      border-radius: 8px;
      background: var(--dr-bg-primary);
      color: var(--dr-text-primary);
      font-family: var(--dr-font);
      font-size: var(--dr-font-size);
      box-shadow: -4px 0 16px rgba(0, 0, 0, 0.3);
      border-left: 1px solid rgba(255, 255, 255, 0.06);
      display: flex;
      flex-direction: column;
      pointer-events: auto;
      overflow: hidden;
    }
    .dr-sidebar-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 14px 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      flex-shrink: 0;
    }
    .dr-sidebar-title { font-weight: 600; font-size: 15px; }
    .dr-sidebar-filters {
      display: flex;
      gap: 6px;
      padding: 10px 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      flex-shrink: 0;
    }
    .dr-sidebar-sort {
      padding: 8px 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      flex-shrink: 0;
    }
    .dr-sidebar-list {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
    }
    .dr-sidebar-empty {
      text-align: center;
      color: var(--dr-text-secondary);
      padding: 40px 16px;
      font-size: 13px;
    }

    /* === Review Card === */
    .dr-review-card {
      background: var(--dr-bg-secondary);
      border-radius: var(--dr-radius);
      padding: 12px;
      margin-bottom: 8px;
      border: 1px solid rgba(255, 255, 255, 0.04);
      transition: border-color 0.15s;
    }
    .dr-review-card:hover { border-color: rgba(255, 255, 255, 0.12); }
    .dr-review-card.dr-resolved { opacity: 0.6; }
    .dr-review-header {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 6px;
    }
    .dr-review-number {
      font-weight: 700;
      font-size: 12px;
      color: var(--dr-text-secondary);
    }
    .dr-review-selector {
      font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
      font-size: 11px;
      color: var(--dr-text-secondary);
      word-break: break-all;
      margin-bottom: 6px;
    }
    .dr-review-comment {
      font-size: 13px;
      line-height: 1.5;
      margin-bottom: 8px;
      color: var(--dr-text-primary);
    }
    .dr-review-meta {
      font-size: 11px;
      color: var(--dr-text-secondary);
      margin-bottom: 8px;
    }
    .dr-review-actions {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }

    /* === Replies === */
    .dr-review-replies {
      margin: 8px 0;
      padding-left: 12px;
      border-left: 2px solid var(--dr-accent);
    }
    .dr-reply {
      margin-bottom: 6px;
    }
    .dr-reply:last-child {
      margin-bottom: 0;
    }
    .dr-reply-header {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 2px;
    }
    .dr-reply-author {
      font-weight: 600;
      font-size: 11px;
      color: var(--dr-accent);
    }
    .dr-reply-date {
      font-size: 11px;
      color: var(--dr-text-secondary);
    }
    .dr-reply-text {
      font-size: 12px;
      color: var(--dr-text-primary);
      line-height: 1.4;
    }

    /* === Reply Input === */
    .dr-reply-input-wrap {
      display: flex;
      gap: 6px;
      align-items: flex-end;
      margin: 8px 0;
    }
    .dr-reply-input {
      flex: 1;
      background: var(--dr-bg-primary);
      color: var(--dr-text-primary);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 6px;
      padding: 6px 10px;
      font-family: var(--dr-font);
      font-size: 12px;
      resize: none;
      outline: none;
      overflow: hidden;
      min-height: 30px;
      line-height: 1.4;
      transition: border-color 0.15s;
    }
    .dr-reply-input:focus { border-color: var(--dr-accent); }
    .dr-reply-input::placeholder { color: var(--dr-text-secondary); opacity: 0.5; }
    .dr-reply-send {
      flex-shrink: 0;
    }

    /* === Collapsible Context === */
    .dr-context-toggle {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      color: var(--dr-text-secondary);
      cursor: pointer;
      user-select: none;
      padding: 4px 0;
      margin-top: 4px;
      border: none;
      background: none;
      font-family: var(--dr-font);
    }
    .dr-context-toggle:hover { color: var(--dr-text-primary); }
    .dr-context-arrow {
      display: inline-block;
      transition: transform 0.15s;
      font-size: 10px;
    }
    .dr-context-arrow.open { transform: rotate(90deg); }
    .dr-context-body {
      display: none;
      padding: 6px 0 2px;
    }
    .dr-context-body.open { display: block; }
    .dr-context-row {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      padding: 2px 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.03);
    }
    .dr-context-key {
      color: var(--dr-text-secondary);
      font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
    }
    .dr-context-val {
      color: var(--dr-accent);
      font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
      max-width: 180px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      text-align: right;
    }
    .dr-context-section {
      font-size: 10px;
      font-weight: 600;
      color: var(--dr-text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-top: 6px;
      margin-bottom: 2px;
    }

    /* === Divider === */
    .dr-divider {
      border: none;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
      margin: 8px 0;
    }

    /* === Scrollbar === */
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--dr-bg-hover); border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--dr-text-secondary); }
  `;
  shadow.appendChild(style);

  // --- HTML structure ---
  const root = document.createElement('div');
  root.id = 'dom-review-root';
  root.innerHTML = `
    <div class="dr-toolbar">
      <span class="dr-toolbar-title">DOM Review</span>
      <button class="dr-btn" id="dr-btn-select">Select</button>
      <button class="dr-btn" id="dr-btn-reviews">Reviews <span class="dr-badge" id="dr-count">0</span></button>
      <button class="dr-btn" id="dr-btn-export">Export</button>
      <button class="dr-btn" id="dr-btn-import">Import</button>
    </div>
    <div class="dr-comment-panel dr-hidden" id="dr-comment-panel"></div>
    <div class="dr-sidebar dr-hidden" id="dr-sidebar"></div>
  `;
  shadow.appendChild(root);

  // --- Public API ---
  window.__domReview.ui = {
    init() {
      if (!host.parentNode) document.body.appendChild(host);
    },

    getToolbar() {
      return shadow.querySelector('.dr-toolbar');
    },

    getShadowRoot() {
      return shadow;
    },

    showPanel() {
      shadow.getElementById('dr-comment-panel').classList.remove('dr-hidden');
    },

    hidePanel() {
      shadow.getElementById('dr-comment-panel').classList.add('dr-hidden');
    },

    showSidebar() {
      shadow.getElementById('dr-sidebar').classList.remove('dr-hidden');
    },

    hideSidebar() {
      shadow.getElementById('dr-sidebar').classList.add('dr-hidden');
    },

    updateBadgeCount(n) {
      shadow.getElementById('dr-count').textContent = n;
    },

    onSelectClick(callback) {
      shadow.getElementById('dr-btn-select').addEventListener('click', callback);
    },

    onReviewsClick(callback) {
      shadow.getElementById('dr-btn-reviews').addEventListener('click', callback);
    },

    onExportClick(callback) {
      shadow.getElementById('dr-btn-export').addEventListener('click', callback);
    },

    onImportClick(callback) {
      shadow.getElementById('dr-btn-import').addEventListener('click', callback);
    }
  };
})();
