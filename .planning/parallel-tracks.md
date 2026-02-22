# DOM Review — Parallel Implementation Tracks

## Overview

This document splits the DOM Review MVP implementation into parallel tracks that can be executed simultaneously by independent agents/developers. Tracks that share no dependencies run at the same time.

## Dependency Graph

```text
LAYER 0 (no dependencies — all run in parallel):
  +-----------------+  +---------------------+  +------------------+  +-----------------+
  | Track 1:        |  | Track 2:            |  | Track 3:         |  | Track 4:        |
  | Foundation &    |  | Selector Generator  |  | Context Capture  |  | Shadow UI       |
  | Data Store      |  |                     |  |                  |  |                 |
  +-----------------+  +---------------------+  +------------------+  +-----------------+
          |                     |                        |                     |
          v                     v                        v                     v
  window.__domReview    window.__domReview     window.__domReview    window.__domReview
       .store               .selectorGen          .contextCapture         .ui

LAYER 1 (depends on Layer 0 — all run in parallel with each other):
  +-------------------+  +-------------------+  +-------------------+
  | Track 5:          |  | Track 6:          |  | Track 7:          |
  | Selector Mode     |  | Comment Panel     |  | Badges            |
  | needs: ui         |  | needs: ui         |  | needs: store      |
  +-------------------+  +-------------------+  +-------------------+

LAYER 2 (depends on Layer 0 + Layer 1):
  +-------------------+  +-------------------+
  | Track 8:          |  | Track 9:          |
  | Sidebar           |  | Export/Import     |
  | needs: ui, store  |  | needs: store      |
  +-------------------+  +-------------------+

LAYER 3 (depends on ALL above):
  +-------------------------------------------+
  | Track 10: Orchestrator + Popup + Polish    |
  | Wires everything together                  |
  +-------------------------------------------+
```

---

## Shared Contract: `window.__domReview` Namespace

Every module registers itself as an IIFE that attaches its public API to a specific key on `window.__domReview`. The orchestrator (`content-script.js`) expects this namespace to be populated before it runs (guaranteed by the `js` array order in `manifest.json`).

### Namespace Shape

```typescript
interface DomReviewNamespace {
  store: {
    add(review: Review): void;
    get(id: string): Review | undefined;
    getAll(): Review[];
    update(id: string, partial: Partial<Review>): void;
    remove(id: string): void;
    resolve(id: string): void;
    unresolve(id: string): void;
    onChange(callback: (reviews: Review[]) => void): void;
    toJSON(): ReviewData;
    fromJSON(data: ReviewData): void;
    loadFromStorage(): void;
    saveToDOM(): void;
    saveToStorage(): void;
  };

  selectorGen: {
    generate(element: HTMLElement): { css: string; xpath: string };
  };

  contextCapture: {
    capture(element: HTMLElement): ContextObject;
  };

  ui: {
    init(): void;
    getToolbar(): HTMLElement;
    getShadowRoot(): ShadowRoot;
    showPanel(config: PanelConfig): void;
    hidePanel(): void;
    showSidebar(): void;
    hideSidebar(): void;
    updateBadgeCount(n: number): void;
    onSelectClick(callback: () => void): void;
    onReviewsClick(callback: () => void): void;
    onExportClick(callback: () => void): void;
    onImportClick(callback: () => void): void;
  };

  selector: {
    enable(): void;
    disable(): void;
    isActive(): boolean;
    toggle(): void;
    onSelect(callback: (element: HTMLElement) => void): void;
  };

  commentPanel: {
    show(element: HTMLElement, selectorData: SelectorData, context: ContextObject): void;
    showEdit(review: Review): void;
    hide(): void;
    onSave(callback: (formData: FormData) => void): void;
    onCancel(callback: () => void): void;
  };

  badges: {
    render(): void;
    add(review: Review): void;
    remove(id: string): void;
    updateAll(): void;
    cleanup(): void;
  };

  sidebar: {
    show(): void;
    hide(): void;
    toggle(): void;
    render(): void;
    scrollToReview(id: string): void;
  };

  exportImport: {
    exportJSON(): void;
    importJSON(): void;
    importFromData(jsonData: ReviewData): void;
  };
}

interface Review {
  id: string;                // "r_" + timestamp
  selector: string;          // CSS selector
  xpath: string;             // XPath selector
  comment: string;           // User's comment text
  priority: "high" | "medium" | "low";
  category: "style" | "logic" | "a11y" | "text" | "layout" | "remove" | "add";
  resolved: boolean;
  created: string;           // ISO 8601
  updated: string | null;    // ISO 8601 or null
  context: ContextObject;
}

interface ReviewData {
  version: "1.0";
  page: string;              // Full URL
  reviews: Review[];
}

interface SelectorData {
  css: string;
  xpath: string;
}

interface ContextObject {
  tagName: string;
  text: string;
  boundingBox: { x: number; y: number; w: number; h: number };
  styles: {
    color: string;
    backgroundColor: string;
    fontSize: string;
    fontWeight: string;
    padding: string;
    margin: string;
    display: string;
    position: string;
    border: string;
    borderRadius: string;
    opacity: string;
  };
  a11y: {
    role: string;
    label: string;
    ariaDescribedby: string | null;
    ariaExpanded: string | null;
    tabIndex: string | null;
  };
}
```

### Critical Rule for All Tracks

Every module file MUST begin with:

```javascript
(() => {
  window.__domReview = window.__domReview || {};
  // ... module code ...
  window.__domReview.<key> = { /* public API */ };
})();
```

---

## Track 1: Foundation & Data Store

**Layer:** 0 (no dependencies)

### Files

| File | Action |
| ---- | ------ |
| `manifest.json` | Create |
| `background/service-worker.js` | Create |
| `content/modules/review-store.js` | Create |
| `content/content-style.css` | Create |
| `icons/icon-16.png` | Create (placeholder) |
| `icons/icon-48.png` | Create (placeholder) |
| `icons/icon-128.png` | Create (placeholder) |

### Depends On

Nothing. This is a foundation track.

### Produces

- `window.__domReview.store` — central CRUD store API
- `manifest.json` — extension skeleton all tracks depend on
- `content-style.css` — hover highlight styles for `selector-mode.js`
- `service-worker.js` — message relay for `popup.js`

### Steps

**1. Create project directory structure**

All directories: `icons/`, `popup/`, `background/`, `content/`, `content/modules/`, `assets/`.

**2. Create `manifest.json`**

Use the exact manifest from the implementation plan (section 3.1). Create empty stub files for modules not yet implemented:

```javascript
(() => { window.__domReview = window.__domReview || {}; })();
```

**3. Create `background/service-worker.js`**

- `chrome.runtime.onInstalled` listener
- `chrome.runtime.onMessage` handler for `GET_REVIEWS` type
- Uses `chrome.scripting.executeScript` to read `#dom-review-data` from active tab

**4. Create `content/modules/review-store.js`**

IIFE registering on `window.__domReview.store`.

Internal state:

```javascript
let reviews = [];
let listeners = [];
const STORAGE_KEY = `dom-review:${location.origin}${location.pathname}`;
```

Methods:

- `add(review)` — push to array, `_persist()`, `_notify()`
- `get(id)` — find by id
- `getAll()` — return shallow copy
- `update(id, partial)` — merge, set `updated` timestamp, `_persist()`, `_notify()`
- `remove(id)` — filter out, remove `data-review-id` from DOM element, `_persist()`, `_notify()`
- `resolve(id)` / `unresolve(id)` — shortcuts for `update()`
- `onChange(callback)` — subscribe to changes
- `toJSON()` / `fromJSON(data)` — export/import support
- `loadFromStorage()` — restore from localStorage, re-apply `data-review-id` attrs, call `saveToDOM()`
- `saveToDOM()` — create/update `<script type="application/json" id="dom-review-data">` (debounce 300ms)
- `saveToStorage()` — write to localStorage
- `_persist()` — calls `saveToDOM()` + `saveToStorage()`
- `_notify()` — calls all listener callbacks

**5. Create `content/content-style.css`**

```css
[data-dom-review-hover] {
  outline: 2px solid #3b82f6 !important;
  outline-offset: 2px !important;
}
```

**6. Create placeholder icons** (16x16, 48x48, 128x128 PNG)

### Verification

Extension loads in Chrome. `window.__domReview.store` is available in console. `store.add({...})` creates `#dom-review-data`. Reviews survive page reload.

---

## Track 2: Selector Generator

**Layer:** 0 (no dependencies)

### Files

| File | Action |
| ---- | ------ |
| `content/modules/selector-generator.js` | Create |

### Depends On

Nothing. Pure utility module.

### Produces

`window.__domReview.selectorGen` — consumed by orchestrator.

### Steps

**1. Implement `generateCSS(element)`**

- If element has `id` (not starting with `dom-review`) -> `#${CSS.escape(id)}`
- Build chain from element to `body` (max depth 10):
  - Tag name, meaningful classes (filter utility via regex), `nth-of-type` if needed
- Join with ` > `
- Verify uniqueness: `document.querySelector(result) === element`

**2. Implement `generateXPath(element)`**

Walk to root, count same-tag preceding siblings for index.

**3. Utility class filter**

```javascript
const UTILITY_REGEX = /^(mt-|mb-|ml-|mr-|mx-|my-|pt-|pb-|pl-|pr-|px-|py-|p-\d|m-\d|w-|h-|min-|max-|flex|grid|text-|bg-|border-|rounded|shadow|opacity-|overflow-|z-|gap-|space-|col-|row-|hidden|block|inline|absolute|relative|fixed|sticky|sm:|md:|lg:|xl:|dark:|hover:|focus:)/;
```

**4. Public API**

```javascript
window.__domReview.selectorGen = {
  generate(element) { return { css: generateCSS(element), xpath: generateXPath(element) }; }
};
```

---

## Track 3: Context Capture

**Layer:** 0 (no dependencies)

### Files

| File | Action |
| ---- | ------ |
| `content/modules/context-capture.js` | Create |

### Depends On

Nothing. Pure utility module.

### Produces

`window.__domReview.contextCapture` — consumed by orchestrator.

### Steps

**1. Implement `capture(element)`**

Returns `{ tagName, text, boundingBox, styles, a11y }` as defined in the namespace contract.

**2. Defensive handling**

- Wrap in try/catch, return minimal context on error
- Handle null/detached elements
- Handle SVG elements in `getComputedStyle`

---

## Track 4: Shadow UI (Toolbar & Containers)

**Layer:** 0 (no dependencies)

### Files

| File | Action |
| ---- | ------ |
| `content/modules/shadow-ui.js` | Create |
| `assets/shadow-styles.css` | Create (reference) |

### Depends On

Nothing. Foundation track.

### Produces

`window.__domReview.ui` — consumed by selector-mode, comment-panel, sidebar, orchestrator.

### Steps

**1. Create `assets/shadow-styles.css`**

Design tokens:

```css
:host {
  --dr-bg-primary: #1e293b;
  --dr-bg-secondary: #334155;
  --dr-text-primary: #f8fafc;
  --dr-text-secondary: #94a3b8;
  --dr-accent: #3b82f6;
  --dr-danger: #ef4444;
  --dr-warning: #f59e0b;
  --dr-success: #22c55e;
  --dr-radius: 8px;
  --dr-font: system-ui, -apple-system, sans-serif;
}
```

CSS class naming convention (shared contract):

- Layout: `dr-toolbar`, `dr-sidebar`, `dr-comment-panel`, `dr-overlay`
- Components: `dr-btn`, `dr-btn--primary`, `dr-btn--danger`, `dr-textarea`, `dr-select`, `dr-pill`, `dr-pill--high/medium/low`
- States: `dr-hidden`, `dr-active`

**2. Create `content/modules/shadow-ui.js`**

- Create `<div id="dom-review-host">`
- Attach `closed` Shadow DOM
- Inject styles as inline `<style>` (no bundler, so inline the CSS string)
- Create HTML structure:

```html
<div id="dom-review-root">
  <div class="dr-toolbar">
    <span class="dr-toolbar-title">DOM Review</span>
    <button class="dr-btn" id="dr-btn-select">Select</button>
    <button class="dr-btn" id="dr-btn-reviews">
      Reviews <span class="dr-badge" id="dr-count">0</span>
    </button>
    <button class="dr-btn" id="dr-btn-export">Export</button>
    <button class="dr-btn" id="dr-btn-import">Import</button>
  </div>
  <div class="dr-comment-panel dr-hidden" id="dr-comment-panel"></div>
  <div class="dr-sidebar dr-hidden" id="dr-sidebar"></div>
</div>
```

**3. Implement public API** — `init()`, `getShadowRoot()`, `showPanel()`, `hidePanel()`, `showSidebar()`, `hideSidebar()`, `updateBadgeCount()`, `onSelectClick()`, `onReviewsClick()`, `onExportClick()`, `onImportClick()`

### Verification

Dark floating toolbar appears bottom-right on localhost. Buttons visible but no actions yet.

---

## Track 5: Selector Mode

**Layer:** 1

### Files

| File | Action |
| ---- | ------ |
| `content/modules/selector-mode.js` | Create |

### Depends On

- **Track 4 (Shadow UI):** needs `ui.getShadowRoot()` to detect own elements
- **Track 1 (Foundation):** needs `content-style.css` for hover highlight

### Produces

`window.__domReview.selector` — consumed by orchestrator.

### Steps

1. State: `isActive`, `hoveredElement`, `selectCallbacks`
2. `enable()` — add mouseover/click(capture)/keydown listeners, set cursor crosshair
3. `disable()` — remove listeners, clear highlight, reset cursor
4. Hover: add `data-dom-review-hover` attr (ignore Shadow DOM host, script/style/meta elements)
5. Click (capture phase): `preventDefault()` + `stopPropagation()` + `stopImmediatePropagation()`, fire callbacks, disable
6. ESC: disable
7. Throttle hover with `requestAnimationFrame`

---

## Track 6: Comment Panel

**Layer:** 1

### Files

| File | Action |
| ---- | ------ |
| `content/modules/comment-panel.js` | Create |

### Depends On

- **Track 4 (Shadow UI):** needs `ui.getShadowRoot()` to render inside `#dr-comment-panel`

### Produces

`window.__domReview.commentPanel` — consumed by orchestrator and sidebar.

### Steps

1. `show(element, selectorData, context)` — render form HTML inside shadow panel container:
   - Element info header
   - Textarea for comment
   - Category pill group (style, logic, a11y, text, layout, remove, add)
   - Priority pill group (high, medium, low)
   - Auto-captured context display
   - Cancel / Save buttons
2. `showEdit(review)` — pre-fill form with existing review data
3. `hide()` — clear panel, add `dr-hidden`
4. Pill group selection logic (toggle `dr-active` class)
5. Panel positioning near selected element (or fixed right if no room)
6. `onSave(callback)` / `onCancel(callback)` — event subscriptions

---

## Track 7: Badges (Visual Markers)

**Layer:** 1

### Files

| File | Action |
| ---- | ------ |
| `content/modules/badges.js` | Create |

### Depends On

- **Track 1 (Data Store):** needs `store.getAll()` to read reviews

### Produces

`window.__domReview.badges` — consumed by orchestrator.

### Steps

1. Create badge container div (`position: fixed`, `pointer-events: none`, z-index 2147483646)
2. `render()` — cleanup, getAll reviews, create badge for each
3. `add(review)` — find element via selector, create badge at `getBoundingClientRect()` position
4. Badge color by priority: high=red, medium=yellow, low=gray, resolved=green
5. `updateAll()` — recalculate positions (called on scroll/resize)
6. Throttled scroll/resize listeners via `requestAnimationFrame`
7. `cleanup()` — remove all badge elements

---

## Track 8: Sidebar

**Layer:** 2

### Files

| File | Action |
| ---- | ------ |
| `content/modules/sidebar.js` | Create |

### Depends On

- **Track 4 (Shadow UI):** needs `ui.getShadowRoot()` for rendering
- **Track 1 (Data Store):** needs `store.getAll()`, `store.resolve()`, `store.remove()`

### Produces

`window.__domReview.sidebar` — consumed by orchestrator.

### Steps

1. `render()` — build review list HTML inside `#dr-sidebar`:
   - Header with count and close button
   - Filter pills: All / Open / Resolved
   - Sort select: Priority / Date / Category
   - Review cards with: number, priority/category pills, selector, comment, date, action buttons
2. Action handlers (event delegation):
   - **Locate:** scroll to element + highlight pulse
   - **Resolve/Unresolve:** `store.resolve(id)` / `store.unresolve(id)`
   - **Edit:** `commentPanel.showEdit(review)`
   - **Delete:** confirm + `store.remove(id)`
3. `show()` / `hide()` / `toggle()` — visibility management
4. `scrollToReview(id)` — scroll sidebar list to specific card
5. Lazy rendering — only render when visible, flag `needsRender` otherwise
6. `escapeHtml()` utility to prevent XSS in user comments

---

## Track 9: Export/Import

**Layer:** 2

### Files

| File | Action |
| ---- | ------ |
| `content/modules/export-import.js` | Create |

### Depends On

- **Track 1 (Data Store):** needs `store.toJSON()` and `store.fromJSON()`

### Produces

`window.__domReview.exportImport` — consumed by orchestrator.

### Steps

1. `exportJSON()` — `store.toJSON()` -> Blob -> download link. Filename: `dom-review-{hostname}-{date}.json`
2. `importJSON()` — create hidden file input, read file, parse JSON, validate, `store.fromJSON()`
3. `importFromData(jsonData)` — validate structure, call `store.fromJSON()`
4. Validation: check `version`, `reviews` array, each review has `id`, `selector`, `comment`

---

## Track 10: Orchestrator, Popup & Integration

**Layer:** 3

### Files

| File | Action |
| ---- | ------ |
| `content/content-script.js` | Create |
| `popup/popup.html` | Create |
| `popup/popup.js` | Create |

### Depends On

ALL previous tracks (1-9). Final assembly.

### Produces

The fully wired, working extension.

### Steps

**1. `content/content-script.js` — Orchestrator**

```javascript
(() => {
  const { store, ui, selector, selectorGen, contextCapture,
          commentPanel, badges, sidebar, exportImport } = window.__domReview;

  // 1. Load persisted reviews
  store.loadFromStorage();

  // 2. Init Shadow DOM UI
  ui.init();

  // 3. Render badges for restored reviews
  badges.render();

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

  // 9. React to store changes
  store.onChange((reviews) => {
    badges.render();
    sidebar.render();
    ui.updateBadgeCount(reviews.filter(r => !r.resolved).length);
  });

  // 10. Initial badge count
  ui.updateBadgeCount(store.getAll().filter(r => !r.resolved).length);

  // 11. Handle SPA navigation
  window.addEventListener('popstate', () => {
    badges.cleanup();
    store.loadFromStorage();
    badges.render();
    sidebar.render();
    ui.updateBadgeCount(store.getAll().filter(r => !r.resolved).length);
  });
})();
```

**2. `popup/popup.html` + `popup/popup.js`**

- Status: "N reviews on this page"
- Copy prompt button with template dropdown (Fix All / Style Review / A11y Audit)
- Export/Import buttons
- Dark theme matching toolbar

**3. Integration testing checklist**

- Extension loads without errors
- Toolbar appears on localhost
- Select mode: hover highlights, click captures
- Comment panel: form works, save persists
- Badges appear on reviewed elements
- Sidebar: filter/sort/locate/resolve/edit/delete
- Export downloads JSON, Import restores reviews
- Reviews survive page reload
- Popup: count, copy prompt, export/import

---

## Execution Schedule

```text
Time    Track 1    Track 2    Track 3    Track 4
  |     Foundation SelectorGen Context   Shadow UI
  |     ========== ========== ========  =========
  v     (Layer 0 — all 4 in parallel)
        ------------------------------------------>

Time    Track 5    Track 6    Track 7
  |     Selector   Comment    Badges
  |     ========   ========   ======
  v     (Layer 1 — all 3 in parallel)
        ------------------------------------------>

Time    Track 8    Track 9
  |     Sidebar    Export/Import
  |     ========   =============
  v     (Layer 2 — both in parallel)
        ------------------------------------------>

Time    Track 10
  |     Orchestrator + Popup + Polish
  |     ==============================
  v     (Layer 3 — final assembly)
        ------------------------------------------>
                                              DONE
```

**Max parallelism:** 4 agents (L0) -> 3 agents (L1) -> 2 agents (L2) -> 1 agent (L3)

**Estimated wall-clock time: ~7 days** (vs. 14 days sequential)

---

## File-to-Track Mapping

| File | Track | Layer |
| ---- | ----- | ----- |
| `manifest.json` | Track 1 | 0 |
| `icons/icon-*.png` | Track 1 | 0 |
| `background/service-worker.js` | Track 1 | 0 |
| `content/modules/review-store.js` | Track 1 | 0 |
| `content/content-style.css` | Track 1 | 0 |
| `content/modules/selector-generator.js` | Track 2 | 0 |
| `content/modules/context-capture.js` | Track 3 | 0 |
| `content/modules/shadow-ui.js` | Track 4 | 0 |
| `assets/shadow-styles.css` | Track 4 | 0 |
| `content/modules/selector-mode.js` | Track 5 | 1 |
| `content/modules/comment-panel.js` | Track 6 | 1 |
| `content/modules/badges.js` | Track 7 | 1 |
| `content/modules/sidebar.js` | Track 8 | 2 |
| `content/modules/export-import.js` | Track 9 | 2 |
| `content/content-script.js` | Track 10 | 3 |
| `popup/popup.html` | Track 10 | 3 |
| `popup/popup.js` | Track 10 | 3 |

---

## Merge Strategy

1. **Track 1 owns `manifest.json`.** Other tracks do NOT modify it.
2. **Track 4 owns `assets/shadow-styles.css`.** Tracks 6 and 8 may append styles to a clearly marked section, or define styles inline within their modules.
3. **`window.__domReview` namespace is append-only** — each track adds its own key and never modifies another track's key.
