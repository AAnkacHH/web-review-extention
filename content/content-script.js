/**
 * DOM Review — Orchestrator (Track 10, Layer 3)
 *
 * Final assembly: wires all modules together.
 * Runs last in content_scripts injection order.
 */
(() => {
  'use strict';
  const { store, ui, selector, selectorGen, contextCapture,
          commentPanel, badges, sidebar, exportImport } = window.__domReview;

  // 1. Load persisted reviews
  store.loadFromStorage();

  // 2. Init Shadow DOM UI
  ui.init();

  // 3. Render badges for restored reviews (with retries for SPA)
  badges.render();
  // SPA frameworks render async — retry at increasing intervals
  [500, 1000, 2000, 4000].forEach(ms => setTimeout(() => badges.render(), ms));

  // 4. Wire toolbar Select -> selector mode
  ui.onSelectClick(() => {
    selector.toggle();
    const btn = ui.getShadowRoot().getElementById('dr-btn-select');
    btn.classList.toggle('dr-active', selector.isActive());
    btn.textContent = selector.isActive() ? 'Cancel' : 'Select';
  });

  // 5. Wire toolbar Reviews -> sidebar
  ui.onReviewsClick(() => sidebar.toggle());

  // 6. Wire toolbar Export/Import
  ui.onExportClick(() => exportImport.exportJSON());
  ui.onImportClick(() => exportImport.importJSON());

  // 7. Wire element selection -> comment panel
  selector.onSelect((element) => {
    const selectorData = selectorGen.generate(element);
    const context = contextCapture.capture(element);
    commentPanel.show(element, selectorData, context);

    // Reset select button state
    const btn = ui.getShadowRoot().getElementById('dr-btn-select');
    btn.classList.remove('dr-active');
    btn.textContent = 'Select';
  });

  // 8. Wire comment panel save -> store
  commentPanel.onSave((formData) => {
    if (formData.isEdit) {
      store.update(formData.editId, {
        comment: formData.comment,
        category: formData.category,
        priority: formData.priority,
        context: formData.context,
      });
    } else {
      store.add({
        id: `r_${Date.now()}`,
        selector: formData.selector,
        xpath: formData.xpath,
        comment: formData.comment,
        priority: formData.priority,
        category: formData.category,
        resolved: false,
        created: new Date().toISOString(),
        updated: null,
        context: formData.context,
      });
    }
  });

  // 9. Wire comment panel cancel -> reset select button
  commentPanel.onCancel(() => {
    const btn = ui.getShadowRoot().getElementById('dr-btn-select');
    btn.classList.remove('dr-active');
    btn.textContent = 'Select';
  });

  // 10. React to store changes
  store.onChange((reviews) => {
    badges.render();
    sidebar.render();
    ui.updateBadgeCount(reviews.filter(r => !r.resolved).length);
  });

  // 11. Initial badge count
  ui.updateBadgeCount(store.getAll().filter(r => !r.resolved).length);

  // 12. Handle SPA navigation
  window.addEventListener('popstate', () => {
    badges.cleanup();
    store.loadFromStorage();
    badges.render();
    sidebar.render();
    ui.updateBadgeCount(store.getAll().filter(r => !r.resolved).length);
  });

  console.log('[DOM Review] Extension loaded. Reviews:', store.getAll().length);
})();
