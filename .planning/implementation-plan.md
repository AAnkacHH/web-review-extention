# DOM Review — Implementation Plan (MVP / Phase 1)

## 1. Project Structure

```text
dom-review-extension/
├── manifest.json                  # Manifest V3 config
├── icons/
│   ├── icon-16.png                # Toolbar icon
│   ├── icon-48.png                # Extensions page
│   └── icon-128.png               # Chrome Web Store
├── popup/
│   ├── popup.html                 # Popup UI on extension icon click
│   └── popup.js                   # Popup logic (export, import, copy prompt)
├── background/
│   └── service-worker.js          # Background (messaging, storage relay)
├── content/
│   ├── content-script.js          # Main entry point, orchestrator
│   ├── modules/
│   │   ├── shadow-ui.js           # Shadow DOM: toolbar, panel, sidebar
│   │   ├── selector-mode.js       # Click-to-select + hover highlight
│   │   ├── selector-generator.js  # CSS selector generation
│   │   ├── comment-panel.js       # Comment panel (text + category + priority)
│   │   ├── review-store.js        # CRUD operations for reviews (DOM JSON + localStorage)
│   │   ├── badges.js              # Visual markers on elements
│   │   ├── sidebar.js             # List of all comments
│   │   ├── context-capture.js     # Computed styles + a11y auto-capture
│   │   └── export-import.js       # Export/Import JSON
│   └── content-style.css          # Minimal styles for hover highlight (in host DOM)
└── assets/
    └── shadow-styles.css          # Styles for Shadow DOM (toolbar, panel, sidebar)
```

**Architecture decision:** No bundler needed for MVP. Modules are implemented as IIFE functions in separate files, loaded via the `content_scripts.js` array in manifest.json. Modules communicate through the global `window.__domReview` namespace pattern (Manifest V3 content scripts don't support ES modules).

---

## 2. Implementation Order

### Phase A: Skeleton (day 1-2)

1. `manifest.json` — base config
2. `service-worker.js` — minimal stub
3. `content-script.js` — entry point with namespace init
4. `shadow-ui.js` — Shadow DOM host + toolbar
5. Icons (placeholder 16/48/128)

**Result:** Extension loads, toolbar is visible on localhost.

### Phase B: Core Selection (day 3-4)

1. `selector-mode.js` — hover highlight + click capture
2. `selector-generator.js` — CSS selector generation
3. `context-capture.js` — computed styles + a11y collection

**Result:** Can select an element, see selector and context in console.

### Phase C: Comment Flow (day 5-7)

1. `comment-panel.js` — Shadow DOM panel (text + category + priority)
2. `review-store.js` — CRUD: add, get, update, delete reviews in DOM + localStorage
3. `badges.js` — visual markers on elements

**Result:** Full cycle: select -> comment -> save -> badge.

### Phase D: Sidebar + Management (day 8-10)

1. `sidebar.js` — list of all reviews with filters
2. Resolve/unresolve functionality (in review-store + sidebar UI)
3. `export-import.js` — export JSON + import JSON

**Result:** Can see all comments, manage them, export.

### Phase E: Popup + Polish (day 11-14)

1. `popup.html` + `popup.js` — prompt copy, export, status
2. Integration testing
3. Bug fixes, edge cases

**Result:** Complete MVP.

---

## 3. Detailed Steps for Each Component

### 3.1 manifest.json

```json
{
  "manifest_version": 3,
  "name": "DOM Review",
  "version": "0.1.0",
  "description": "Visual code review for live UI — leave comments on DOM elements for AI agents",
  "permissions": ["activeTab", "storage", "scripting"],
  "host_permissions": ["http://localhost/*", "http://127.0.0.1/*"],
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "icons/icon-16.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    }
  },
  "background": {
    "service_worker": "background/service-worker.js"
  },
  "content_scripts": [
    {
      "matches": ["http://localhost/*", "http://127.0.0.1/*"],
      "js": [
        "content/modules/review-store.js",
        "content/modules/selector-generator.js",
        "content/modules/context-capture.js",
        "content/modules/shadow-ui.js",
        "content/modules/comment-panel.js",
        "content/modules/badges.js",
        "content/modules/sidebar.js",
        "content/modules/selector-mode.js",
        "content/modules/export-import.js",
        "content/content-script.js"
      ],
      "css": ["content/content-style.css"],
      "run_at": "document_idle"
    }
  ],
  "icons": {
    "16": "icons/icon-16.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  }
}
```

**Key decisions:**

- `run_at: "document_idle"` — wait for full DOM load
- `host_permissions` only localhost — dev-tool scope
- Modules in `js` array ordered by dependencies (review-store first)

---

### 3.2 shadow-ui.js — Shadow DOM Toolbar + Container

**Responsibility:** Creates Shadow DOM host, toolbar, and containers for comment panel and sidebar.

**Key details:**

- `mode: 'closed'` — closed Shadow DOM, page styles don't leak in
- Z-index `2147483647` — above everything
- Toolbar fixed to bottom-right corner
- Buttons: "Select", "Reviews (N)", "Export", "Import"

**API on `window.__domReview.ui`:**

- `getToolbar()` — returns toolbar element
- `getShadowRoot()` — returns shadow root for other modules
- `showPanel(config)` — show comment panel
- `hidePanel()` — hide panel
- `showSidebar()` / `hideSidebar()` — toggle sidebar
- `updateBadgeCount(n)` — update review counter

**Styles (inside shadow):**

- Dark theme (bg `#1e293b`, text `#f8fafc`)
- System UI font
- Border-radius 8px
- Box-shadow for "floating" effect

**Shadow DOM structure:**

```html
<div id="dom-review-root">
  <div class="dr-toolbar">...</div>
  <div class="dr-comment-panel" hidden>...</div>
  <div class="dr-sidebar" hidden>...</div>
</div>
```

---

### 3.3 selector-mode.js — Element Selection Mode

**Algorithm:**

1. User clicks "Select" on toolbar
2. `isSelectMode = true`
3. `mouseover` listener adds outline to element (`2px solid #3b82f6`)
4. Ignore our Shadow DOM elements (check `host.contains(e.target)`)
5. `click` listener (capture phase!) intercepts click
6. `preventDefault()` + `stopPropagation()` — block default behavior
7. Calls `context-capture` and `comment-panel.show()`
8. ESC cancels select mode

**Edge cases:**

- Ignore `<script>`, `<style>`, `<link>`, `<meta>` elements
- Ignore our SVG markers and Shadow DOM host

**API on `window.__domReview.selector`:**

- `enable()` / `disable()` / `isActive()` / `onSelect(callback)`

---

### 3.4 selector-generator.js — CSS Selector Generation

**Algorithm:**

1. If element has id -> `#id` (simplest)
2. Otherwise build chain from element to body:
   - Tag name (lowercase)
   - Meaningful classes (filter out Tailwind/Bootstrap utility classes)
   - nth-child if there are same-type siblings
   - Stop at element with id
3. Join with ` > ` (direct child)
4. Verify: `document.querySelector(selector) === element`
5. If not unique — add nth-of-type

**Utility class filter:**

```javascript
const UTILITY_REGEX = /^(mt-|mb-|ml-|mr-|mx-|my-|pt-|pb-|pl-|pr-|px-|py-|p-|m-|w-|h-|min-|max-|flex|grid|text-|bg-|border-|rounded|shadow|opacity-|overflow-|z-|gap-|space-|col-|row-|hidden|block|inline|absolute|relative|fixed|sticky)/;
```

**Also generates XPath:** `/html/body/main/section[1]/button[2]`

**API:** `window.__domReview.selectorGen.generate(element)` -> `{ css, xpath }`

---

### 3.5 context-capture.js — Automatic Context Collection

```javascript
function captureContext(element) {
  const computed = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return {
    tagName: element.tagName.toLowerCase(),
    text: element.textContent?.trim().substring(0, 100),
    boundingBox: {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      w: Math.round(rect.width),
      h: Math.round(rect.height)
    },
    styles: {
      color: computed.color,
      backgroundColor: computed.backgroundColor,
      fontSize: computed.fontSize,
      fontWeight: computed.fontWeight,
      padding: computed.padding,
      margin: computed.margin,
      display: computed.display,
      position: computed.position,
      border: computed.border,
      borderRadius: computed.borderRadius,
      opacity: computed.opacity
    },
    a11y: {
      role: element.getAttribute('role') || element.tagName.toLowerCase(),
      label: element.getAttribute('aria-label')
             || element.getAttribute('alt')
             || element.textContent?.trim().substring(0, 50),
      ariaDescribedby: element.getAttribute('aria-describedby'),
      ariaExpanded: element.getAttribute('aria-expanded'),
      tabIndex: element.getAttribute('tabindex')
    }
  };
}
```

**API:** `window.__domReview.contextCapture.capture(element)` -> context object

---

### 3.6 comment-panel.js — Comment Panel

**UI elements (in Shadow DOM):**

```text
+-------------------------------------------+
| Review Element: <button.btn-primary>       |
| Selector: main > section.hero > button     |
+-------------------------------------------+
| Comment:                                    |
| [   textarea 3 rows                  ]     |
+-------------------------------------------+
| Category: [style|logic|a11y|text|          |
|            layout|remove|add]              |
| Priority: [high|medium|low]               |
+-------------------------------------------+
| Context (auto-captured):                    |
|  bg: #2563EB  font: 14px  role: button     |
+-------------------------------------------+
| [Cancel]                     [Save Review] |
+-------------------------------------------+
```

**Categories:** style, logic, a11y, text, layout, remove, add

**Priorities:** high (red badge), medium (yellow badge), low (gray badge)

**Behavior:**

1. Panel appears after selecting an element
2. Selector and context are auto-filled
3. User writes comment, picks category/priority
4. "Save" -> calls `review-store.add()`
5. "Cancel" -> closes panel
6. Panel positioned near selected element (or fixed right if no room)

**API on `window.__domReview.commentPanel`:**

- `show(element, selector, context)` — open for new review
- `showEdit(review)` — open for editing
- `hide()`
- `onSave(callback)` — callback with form data
- `onCancel(callback)`

---

### 3.7 review-store.js — Central CRUD Store

**Data structure:**

```javascript
{
  version: "1.0",
  page: "http://localhost:5173/checkout",
  reviews: [{
    id: "r_1708600000000",       // "r_" + timestamp
    selector: "main > section.hero > button.btn-primary",
    xpath: "/html/body/main/section[1]/button[2]",
    comment: "Background color should be #3B82F6 instead of #2563EB",
    priority: "high",            // high | medium | low
    category: "style",           // style | logic | a11y | text | layout | remove | add
    resolved: false,
    created: "2026-02-22T14:00:00Z",
    updated: null,
    context: { /* from context-capture */ }
  }]
}
```

**Methods:**

- CRUD: `add()`, `get()`, `getAll()`, `update()`, `remove()`
- Resolve: `resolve()`, `unresolve()`
- Persistence: `saveToDOM()`, `saveToStorage()`, `loadFromStorage()`
- Events: `onChange(callback)` — subscription for changes (for badges, sidebar, etc.)
- Export/Import: `toJSON()`, `fromJSON(data)`

**Key details:**

- Every `add`/`update`/`remove` automatically calls `saveToDOM()` + `saveToStorage()`
- `saveToDOM()` creates/updates `<script type="application/json" id="dom-review-data">`
- localStorage key: `dom-review:{origin}{pathname}`
- ID generated as `r_${Date.now()}`

---

### 3.8 badges.js — Visual Markers

- Badge — overlay div with `position: fixed`
- Position calculated via `getBoundingClientRect()`
- Updated on `scroll` and `resize` (with throttle)
- Color by priority: high = red, medium = yellow, low = gray
- Resolved = green with checkmark

**API on `window.__domReview.badges`:**

- `render()`, `add()`, `remove()`, `updateAll()`, `cleanup()`

---

### 3.9 sidebar.js — Review List

**UI (in Shadow DOM):**

- Filter: All | Open | Resolved
- Sort: Priority | Date | Category
- Each review: number, priority badge, category, selector, comment, dates, buttons [Resolve] [Edit] [Delete]
- Click on review -> scroll to element + highlight
- Fixed right panel, 350px wide

**API on `window.__domReview.sidebar`:**

- `show()`, `hide()`, `toggle()`, `render()`, `scrollToReview(id)`

---

### 3.10 export-import.js

**Export:** `review-store.toJSON()` -> Blob -> download link. Filename: `dom-review-{hostname}-{date}.json`

**Import:** File input -> JSON parse -> validate -> `review-store.fromJSON()` -> restore attrs + badges + sidebar

**API on `window.__domReview.exportImport`:**

- `exportJSON()` — saves JSON file
- `importJSON()` — opens file picker
- `importFromData(jsonData)` — imports from object

---

### 3.11 content-script.js — Orchestrator

```javascript
(() => {
  window.__domReview = window.__domReview || {};

  // 1. Init store + restore from localStorage
  store.loadFromStorage();

  // 2. Init Shadow UI (toolbar)
  ui.init();

  // 3. Render badges for restored reviews
  badges.render();

  // 4. Wire toolbar -> select mode
  ui.onSelectClick(() => {
    window.__domReview.selector.toggle();
  });

  // 5. Wire toolbar -> sidebar
  ui.onReviewsClick(() => {
    window.__domReview.sidebar.toggle();
  });

  // 6. Wire select -> comment panel
  window.__domReview.selector.onSelect((element) => {
    const selectorData = window.__domReview.selectorGen.generate(element);
    const context = window.__domReview.contextCapture.capture(element);
    window.__domReview.commentPanel.show(element, selectorData, context);
  });

  // 7. Wire comment panel save -> store
  window.__domReview.commentPanel.onSave((formData) => {
    store.add({
      ...formData,
      id: `r_${Date.now()}`,
      created: new Date().toISOString(),
      resolved: false,
    });
  });

  // 8. React to store changes
  store.onChange(() => {
    window.__domReview.badges.render();
    window.__domReview.sidebar.render();
    ui.updateBadgeCount(store.getAll().length);
  });

  // 9. Initial badge count
  ui.updateBadgeCount(store.getAll().length);
})();
```

---

### 3.12 service-worker.js

Minimal for MVP: message relay for popup <-> content script via `chrome.scripting.executeScript`.

```javascript
chrome.runtime.onInstalled.addListener(() => {
  console.log('DOM Review extension installed');
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_REVIEWS') {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const el = document.getElementById('dom-review-data');
          return el ? el.textContent : null;
        }
      }).then(([result]) => {
        sendResponse(result?.result);
      });
    });
    return true; // async response
  }
});
```

---

### 3.13 popup.html + popup.js

- Status: "N reviews on this page"
- Button: "Copy prompt for AI agent" — copies template from spec
- Button: "Export reviews as JSON"
- Button: "Import reviews from JSON"
- Dropdown: prompt template selection (Fix All / Style Review / A11y Audit)

---

## 4. Architecture Decisions

| Decision | Why |
|----------|-----|
| No bundler | Simple setup, no build step, easier debugging |
| Shadow DOM `closed` | Style/JS isolation from host page |
| Event capture phase | Intercept clicks BEFORE site's own handlers |
| Hybrid data attrs + JSON block | Lightweight markers + structured data for AI |
| localStorage per-page | Comments are bound to specific URL |
| Namespace pattern | Manifest V3 content scripts don't support ES modules |

---

## 5. Technical Considerations

### Performance

- Throttle hover highlight (60fps)
- Throttle badge position updates on scroll
- Lazy render sidebar — only when visible
- JSON block update — debounce 300ms

### Edge Cases

1. **Element removed from DOM** (SPA re-render): check `querySelector`, mark as "orphaned"
2. **iframe**: MVP does not support iframe elements
3. **Dynamic content**: listen to `popstate`, re-init on SPA navigation
4. **Large DOM**: limit selector depth to 10 levels
5. **Conflicts**: prefix `data-review-` is sufficiently unique

### Security

- `closed` Shadow DOM — site JS cannot access our UI
- Content script in ISOLATED world — doesn't see site's JS variables
- No external JS loaded (Chrome Store requirement)
- Export — local download only, no network requests

### Restoration on Page Load

1. Content scripts injected (`document_idle`)
2. `review-store` loads from localStorage
3. For each review: `document.querySelector(selector)` -> add `data-review-id`
4. Create JSON block `#dom-review-data`
5. Render badges + toolbar count

---

## 6. Timeline

| Component | File | Complexity | Day |
|-----------|------|------------|-----|
| Manifest + skeleton | manifest.json, service-worker.js | Low | 1 |
| Shadow DOM toolbar | shadow-ui.js, shadow-styles.css | Low | 1-2 |
| Select mode + highlight | selector-mode.js | Low | 3 |
| CSS Selector generation | selector-generator.js | Medium | 3-4 |
| Context capture | context-capture.js | Low | 4 |
| Comment panel UI | comment-panel.js | Medium | 5-6 |
| Review store (CRUD + DOM + localStorage) | review-store.js | Medium | 5-6 |
| Visual badges | badges.js | Low | 7 |
| Sidebar | sidebar.js | Medium | 8-9 |
| Resolve/unresolve | (in review-store + sidebar) | Minimal | 9 |
| Export/Import | export-import.js | Low | 10 |
| Popup | popup.html, popup.js | Low | 11 |
| Orchestrator | content-script.js | Medium | 11-12 |
| Testing + polish | — | Medium | 13-14 |

**Total estimate: 14 working days (2-3 weeks as per spec).**
