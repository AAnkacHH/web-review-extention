/**
 * DOM Review — Popup Script (Track 10, Layer 3)
 *
 * Shows review count, provides copy-prompt templates,
 * and export/import buttons.
 */
(() => {
  'use strict';

  const countEl = document.getElementById('count');
  const statusEl = document.getElementById('status');
  const mainContent = document.getElementById('main-content');
  const noPage = document.getElementById('no-page');
  const toast = document.getElementById('toast');
  const promptToggle = document.getElementById('btn-prompt-toggle');
  const promptGroup = document.getElementById('prompt-group');

  let reviewData = null;

  // --- Prompt templates ---

  const PROMPTS = {
    'fix-all': (data) =>
`You are reviewing a web page. Below is a JSON array of code-review comments left on DOM elements.
For each review, fix the issue described in the comment. Pay attention to the CSS selector, priority, and category.

Page: ${data.page}
Reviews:
${JSON.stringify(data.reviews.filter(r => !r.resolved), null, 2)}

Instructions:
- Fix each issue based on its category (style, logic, a11y, text, layout, remove, add).
- Prioritize "high" items first.
- Provide the fix as code changes.`,

    'style-review': (data) =>
`You are doing a CSS/style review of a web page. Below are style-related review comments on DOM elements.

Page: ${data.page}
Style Reviews:
${JSON.stringify(data.reviews.filter(r => !r.resolved && r.category === 'style'), null, 2)}

Instructions:
- For each element (identified by CSS selector), suggest improved CSS.
- Consider the captured context (current styles, bounding box) when making suggestions.
- Focus on visual consistency, spacing, typography, and responsive design.`,

    'a11y-audit': (data) =>
`You are performing an accessibility audit on a web page. Below are accessibility-related review comments.

Page: ${data.page}
Accessibility Reviews:
${JSON.stringify(data.reviews.filter(r => !r.resolved && r.category === 'a11y'), null, 2)}

All Reviews (for context):
${JSON.stringify(data.reviews.filter(r => !r.resolved), null, 2)}

Instructions:
- For each flagged element, suggest WCAG-compliant fixes.
- Check for: proper ARIA roles, labels, keyboard navigation, color contrast, semantic HTML.
- Provide code changes with explanations.`
  };

  // --- Init ---

  function init() {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab || !tab.url) {
        showNoPage();
        return;
      }

      const url = tab.url;
      if (!url.startsWith('http://localhost') && !url.startsWith('http://127.0.0.1')) {
        showNoPage();
        return;
      }

      // Fetch review data from content script
      chrome.runtime.sendMessage({ type: 'GET_REVIEWS' }, (raw) => {
        if (chrome.runtime.lastError) {
          statusEl.textContent = 'Could not connect to page.';
          return;
        }

        if (!raw) {
          showReady(0);
          return;
        }

        try {
          reviewData = JSON.parse(raw);
          const total = reviewData.reviews.length;
          const open = reviewData.reviews.filter(r => !r.resolved).length;
          showReady(total, open);
        } catch {
          showReady(0);
        }
      });
    });
  }

  function showNoPage() {
    statusEl.style.display = 'none';
    mainContent.style.display = 'none';
    noPage.style.display = '';
    countEl.textContent = '-';
    countEl.classList.add('badge--zero');
  }

  function showReady(total, open) {
    noPage.style.display = 'none';
    mainContent.style.display = '';

    if (total === 0) {
      statusEl.innerHTML = 'No reviews on this page yet.<br>Click <strong>Select</strong> in the toolbar to start.';
      countEl.textContent = '0';
      countEl.classList.add('badge--zero');
    } else {
      const resolved = total - (open || 0);
      statusEl.innerHTML = `<strong>${total}</strong> review${total !== 1 ? 's' : ''} on this page` +
        (resolved > 0 ? ` (<strong>${open}</strong> open, ${resolved} resolved)` : '');
      countEl.textContent = open || total;
      countEl.classList.toggle('badge--zero', total === 0);
    }
  }

  function showToast(text) {
    toast.textContent = text || 'Copied!';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 1500);
  }

  // --- Event handlers ---

  promptToggle.addEventListener('click', () => {
    promptGroup.classList.toggle('open');
  });

  promptGroup.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-prompt]');
    if (!btn) return;
    const key = btn.dataset.prompt;
    const template = PROMPTS[key];
    if (!template) return;

    if (!reviewData || !reviewData.reviews.length) {
      showToast('No reviews to copy');
      return;
    }

    const text = template(reviewData);
    navigator.clipboard.writeText(text).then(() => {
      showToast('Copied!');
    }).catch(() => {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('Copied!');
    });
  });

  // Export
  document.getElementById('btn-export').addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab) return;
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          if (window.__domReview && window.__domReview.exportImport) {
            window.__domReview.exportImport.exportJSON();
          }
        }
      });
    });
  });

  // Import
  document.getElementById('btn-import').addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab) return;
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          if (window.__domReview && window.__domReview.exportImport) {
            window.__domReview.exportImport.importJSON();
          }
        }
      });
    });
  });

  init();
})();
