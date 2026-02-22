# Chrome Extension — Практичний гайд

## 1. Анатомія розширення

```
dom-review-extension/
├── manifest.json            ← Головний конфіг (як package.json для extension)
├── icons/
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
├── popup/
│   ├── popup.html           ← UI при кліку на іконку extension
│   └── popup.js
├── content/
│   ├── content-script.js    ← Інжектиться в кожну сторінку (має доступ до DOM)
│   └── content-style.css
├── background/
│   └── service-worker.js    ← Фоновий процес (не має доступу до DOM)
└── assets/
    └── toolbar.css           ← Стилі для Shadow DOM overlay
```

### Хто що робить:

```
┌─────────────────────────────────────────────────────────┐
│ Content Script (content-script.js)                       │
│ ✅ Бачить DOM сторінки (читає, змінює)                   │
│ ✅ Може інжектити Shadow DOM (ваш toolbar)               │
│ ✅ Слухає кліки, hover, keyboard                         │
│ ❌ Не має доступу до chrome.storage напряму*              │
│ ❌ Не бачить JS-змінних сторінки (ISOLATED world)         │
│                                                          │
│ * — може через chrome.runtime.sendMessage()              │
└──────────────────────┬───────────────────────────────────┘
                       │ chrome.runtime.sendMessage()
                       ▼
┌─────────────────────────────────────────────────────────┐
│ Service Worker (service-worker.js)                        │
│ ✅ Має доступ до всіх Chrome APIs                        │
│ ✅ chrome.storage, chrome.tabs, chrome.scripting          │
│ ❌ Не бачить DOM (немає document, window)                 │
│ ❌ "Засинає" через ~30с неактивності                      │
└──────────────────────┬───────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│ Popup (popup.html + popup.js)                            │
│ ✅ Звичайна HTML-сторінка (свій DOM)                     │
│ ✅ Має доступ до Chrome APIs                             │
│ ❌ Закривається при кліку поза ним                        │
│ ❌ Не бачить DOM основної сторінки                        │
└─────────────────────────────────────────────────────────┘
```

---

## 2. manifest.json — мінімальний приклад для DOM Review

```json
{
  "manifest_version": 3,
  "name": "DOM Review",
  "version": "0.1.0",
  "description": "Visual code review for live UI — leave comments on DOM elements for AI agents",

  "permissions": [
    "activeTab",
    "storage",
    "scripting"
  ],

  "host_permissions": [
    "http://localhost/*",
    "http://127.0.0.1/*"
  ],

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
      "js": ["content/content-script.js"],
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

### Що тут що:

| Поле | Що робить |
|------|-----------|
| `manifest_version: 3` | Обов'язково 3 (2 вже не приймається в Store) |
| `permissions` | Які Chrome API потрібні |
| `host_permissions` | На яких сайтах працює (localhost для dev) |
| `action` | Іконка + popup в toolbar браузера |
| `background.service_worker` | Фоновий скрипт |
| `content_scripts` | Що інжектити і куди |
| `content_scripts.matches` | URL-паттерни де працювати |
| `content_scripts.run_at` | Коли інжектити (`document_idle` = після завантаження) |

---

## 3. Мінімальний робочий приклад

### manifest.json
(див. вище)

### content/content-script.js

```javascript
// Цей скрипт автоматично інжектиться на кожну localhost-сторінку

(() => {
  // === Shadow DOM toolbar (ізольований від стилів сайту) ===
  const host = document.createElement('div');
  host.id = 'dom-review-host';
  const shadow = host.attachShadow({ mode: 'closed' });

  shadow.innerHTML = `
    <style>
      .toolbar {
        position: fixed;
        bottom: 16px;
        right: 16px;
        z-index: 2147483647;
        background: #1e293b;
        color: #f8fafc;
        padding: 8px 16px;
        border-radius: 8px;
        font-family: system-ui, sans-serif;
        font-size: 14px;
        display: flex;
        gap: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      }
      button {
        background: #3b82f6;
        color: white;
        border: none;
        padding: 6px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 13px;
      }
      button:hover { background: #2563eb; }
      button.active { background: #f59e0b; }
      .badge {
        background: #ef4444;
        color: white;
        border-radius: 50%;
        width: 20px;
        height: 20px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
      }
    </style>
    <div class="toolbar">
      <span>🔍 DOM Review</span>
      <button id="btn-select">Select</button>
      <button id="btn-list">Reviews <span class="badge" id="count">0</span></button>
    </div>
  `;

  document.body.appendChild(host);

  // === Select mode ===
  let isSelectMode = false;
  let hoveredElement = null;

  const btnSelect = shadow.getElementById('btn-select');

  btnSelect.addEventListener('click', () => {
    isSelectMode = !isSelectMode;
    btnSelect.classList.toggle('active', isSelectMode);
    btnSelect.textContent = isSelectMode ? 'Cancel' : 'Select';

    if (!isSelectMode && hoveredElement) {
      hoveredElement.style.outline = '';
      hoveredElement = null;
    }
  });

  // Highlight on hover
  document.addEventListener('mouseover', (e) => {
    if (!isSelectMode) return;
    if (host.contains(e.target)) return; // Ігноруємо наш toolbar

    if (hoveredElement) hoveredElement.style.outline = '';
    hoveredElement = e.target;
    hoveredElement.style.outline = '2px solid #3b82f6';
  });

  // Click to add review
  document.addEventListener('click', (e) => {
    if (!isSelectMode) return;
    if (host.contains(e.target)) return;

    e.preventDefault();
    e.stopPropagation();

    const element = e.target;
    element.style.outline = '';

    // Генеруємо CSS-селектор
    const selector = generateSelector(element);

    // Запитуємо коментар
    const comment = prompt('DOM Review — ваш коментар:');
    if (!comment) return;

    // Зберігаємо
    addReview(element, selector, comment);

    isSelectMode = false;
    btnSelect.classList.remove('active');
    btnSelect.textContent = 'Select';
  }, true); // capture phase — щоб перехопити до обробників сайту

  // === Генерація CSS-селектора ===
  function generateSelector(el) {
    // Якщо є id — найпростіший варіант
    if (el.id) return `#${el.id}`;

    const parts = [];
    let current = el;

    while (current && current !== document.body) {
      let part = current.tagName.toLowerCase();

      if (current.id) {
        parts.unshift(`#${current.id}`);
        break;
      }

      // Додаємо значущі класи (без utility-класів типу "mt-4")
      const classes = Array.from(current.classList)
        .filter(c => !c.match(/^(mt-|mb-|p-|m-|w-|h-|flex|grid|text-|bg-|border-)/))
        .slice(0, 2);

      if (classes.length) {
        part += '.' + classes.join('.');
      }

      // nth-child якщо є однакові siblings
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          s => s.tagName === current.tagName
        );
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          part += `:nth-child(${index})`;
        }
      }

      parts.unshift(part);
      current = current.parentElement;
    }

    return parts.join(' > ');
  }

  // === Збереження review ===
  function addReview(element, selector, comment) {
    const id = `r_${Date.now()}`;

    // Маркер на елементі
    element.setAttribute('data-review-id', id);

    // Збираємо контекст
    const computed = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();

    const review = {
      id,
      selector,
      comment,
      priority: 'medium',
      category: 'general',
      created: new Date().toISOString(),
      context: {
        tagName: element.tagName.toLowerCase(),
        text: element.textContent?.trim().substring(0, 100),
        boundingBox: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          w: Math.round(rect.width),
          h: Math.round(rect.height),
        },
        styles: {
          color: computed.color,
          backgroundColor: computed.backgroundColor,
          fontSize: computed.fontSize,
          padding: computed.padding,
          margin: computed.margin,
        },
        a11y: {
          role: element.getAttribute('role') || element.tagName.toLowerCase(),
          label: element.getAttribute('aria-label') || element.textContent?.trim().substring(0, 50),
        },
      },
    };

    // Зберігаємо в DOM (JSON-блок)
    saveToDOM(review);

    // Зберігаємо в localStorage (persistence)
    saveToStorage(review);

    // Оновлюємо badge
    updateBadge();
  }

  function getReviewData() {
    const el = document.getElementById('dom-review-data');
    if (el) {
      try { return JSON.parse(el.textContent); } catch { /* ignore */ }
    }
    return { version: '1.0', page: location.href, reviews: [] };
  }

  function saveToDOM(review) {
    let el = document.getElementById('dom-review-data');
    if (!el) {
      el = document.createElement('script');
      el.type = 'application/json';
      el.id = 'dom-review-data';
      document.body.appendChild(el);
    }

    const data = getReviewData();
    data.reviews.push(review);
    el.textContent = JSON.stringify(data, null, 2);
  }

  function saveToStorage(review) {
    const key = `dom-review:${location.origin}${location.pathname}`;
    const stored = JSON.parse(localStorage.getItem(key) || '{"reviews":[]}');
    stored.reviews.push(review);
    localStorage.setItem(key, JSON.stringify(stored));
  }

  function updateBadge() {
    const data = getReviewData();
    shadow.getElementById('count').textContent = data.reviews.length;
  }

  // === Відновлення при завантаженні ===
  function restoreReviews() {
    const key = `dom-review:${location.origin}${location.pathname}`;
    const stored = JSON.parse(localStorage.getItem(key) || '{"reviews":[]}');

    if (stored.reviews.length === 0) return;

    stored.reviews.forEach(review => {
      try {
        const el = document.querySelector(review.selector);
        if (el) el.setAttribute('data-review-id', review.id);
      } catch { /* селектор може бути невалідним */ }
      saveToDOM(review);
    });

    updateBadge();
  }

  restoreReviews();
})();
```

### popup/popup.html

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      width: 300px;
      padding: 16px;
      font-family: system-ui, sans-serif;
      font-size: 14px;
    }
    h2 { margin: 0 0 12px; font-size: 16px; }
    .info { color: #64748b; font-size: 12px; }
    button {
      width: 100%;
      padding: 8px;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      margin-top: 8px;
    }
    pre {
      background: #f1f5f9;
      padding: 8px;
      border-radius: 4px;
      font-size: 11px;
      max-height: 200px;
      overflow: auto;
    }
  </style>
</head>
<body>
  <h2>🔍 DOM Review</h2>
  <p class="info">Click "Select" on the page toolbar to start reviewing elements.</p>
  <button id="btn-copy">📋 Copy prompt for AI agent</button>
  <button id="btn-export">💾 Export reviews as JSON</button>

  <script src="popup.js"></script>
</body>
</html>
```

### popup/popup.js

```javascript
document.getElementById('btn-copy').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Виконуємо скрипт на сторінці щоб дістати reviews
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const el = document.getElementById('dom-review-data');
      return el ? el.textContent : null;
    },
  });

  if (!result?.result) {
    alert('No reviews on this page');
    return;
  }

  const data = JSON.parse(result.result);
  const count = data.reviews.length;

  // Генеруємо промпт
  const prompt = `Connect to Chrome at ${data.page} using Chrome DevTools MCP.

Execute this script to read review comments:
JSON.parse(document.getElementById('dom-review-data').textContent)

There are ${count} review comments. Each has a CSS selector, human comment, and context (styles, accessibility, bounding box).

Fix all reviews starting from highest priority. For each fix explain which file you changed.

Review data:
${JSON.stringify(data.reviews, null, 2)}`;

  await navigator.clipboard.writeText(prompt);
  alert(`Prompt copied! (${count} reviews)`);
});

document.getElementById('btn-export').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const el = document.getElementById('dom-review-data');
      return el ? el.textContent : null;
    },
  });

  if (!result?.result) {
    alert('No reviews on this page');
    return;
  }

  // Скачуємо як файл
  const blob = new Blob([result.result], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dom-review-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});
```

### background/service-worker.js

```javascript
// Поки мінімальний — просто слухає інсталяцію
chrome.runtime.onInstalled.addListener(() => {
  console.log('DOM Review extension installed');
});
```

---

## 4. Локальна розробка (Developer Mode)

### Крок 1: Створіть папку з файлами вище

```bash
mkdir dom-review-extension
cd dom-review-extension
# Створіть manifest.json та всі файли
```

### Крок 2: Завантажте в Chrome

1. Відкрийте `chrome://extensions/`
2. Увімкніть **"Developer mode"** (toggle справа зверху)
3. Натисніть **"Load unpacked"**
4. Оберіть папку `dom-review-extension/`
5. Готово — іконка з'явиться в toolbar

### Крок 3: Розробка

- Змінили `content-script.js` → натисніть 🔄 на картці extension
  в `chrome://extensions/`, потім перезавантажте сторінку
- Змінили `popup.html` → просто перевідкрийте popup
- Змінили `manifest.json` → обов'язково 🔄 reload extension
- Помилки → натисніть "Errors" на картці extension
  або F12 в popup для його DevTools

### Крок 4: Debug

```
Content script console    → F12 на сторінці де extension працює
Popup console             → Right-click popup → Inspect
Service worker console    → chrome://extensions/ → "Inspect views: service worker"
```

---

## 5. Іконки

Потрібні 3 розміри PNG:
- 16×16 — в toolbar
- 48×48 — на сторінці extensions
- 128×128 — в Chrome Web Store

Можна згенерувати одну SVG і конвертувати. Для MVP — будь-яка іконка.

---

## 6. Публікація в Chrome Web Store

### Крок 1: Реєстрація розробника

1. Перейдіть на https://chrome.google.com/webstore/devconsole
2. Увійдіть з Google-акаунтом
3. Сплатіть **одноразовий збір $5** (реєстрація розробника)
4. Підтвердіть email

### Крок 2: Підготовка ZIP

```bash
cd dom-review-extension

# Видаліть непотрібне (.git, node_modules, .DS_Store)
# ZIP повинен містити manifest.json в корені

zip -r dom-review.zip . \
  -x "*.git*" \
  -x "*node_modules*" \
  -x "*.DS_Store" \
  -x "*.map"
```

**Важливо:** `manifest.json` має бути в **корені** ZIP, не в підпапці.

### Крок 3: Завантаження

1. У Developer Dashboard натисніть **"New item"**
2. Завантажте ZIP
3. Заповніть:
   - **Назва:** DOM Review
   - **Опис:** Visual code review for live UI...
   - **Категорія:** Developer Tools
   - **Мова:** English (обов'язково)
   - **Скріншоти:** мінімум 1 (1280×800 або 640×400)
   - **Іконка Store:** 128×128 PNG
   - **Tile image** (необов'язково): 440×280

### Крок 4: Privacy Practices

Chrome Store вимагає заповнити:
- **Які дані збираєте** — для DOM Review: "Personally identifiable info: No"
- **Single purpose** — опис однією фразою
- **Host permissions justification** — чому потрібен доступ до localhost

### Крок 5: Публікація

1. Натисніть **"Submit for review"**
2. Review Google займає **1-7 днів** (зазвичай 1-3)
3. Після схвалення — extension доступний за посиланням
4. Юзер натискає **"Add to Chrome"** → встановлено

### Часті причини відхилення:

| Причина | Рішення |
|---------|---------|
| "Broad host permissions" | Використовуйте `activeTab` замість `<all_urls>` |
| "Missing privacy policy" | Додайте URL на privacy policy |
| "Remote code execution" | Не завантажуйте JS з зовнішніх серверів |
| "Missing single purpose" | Опишіть extension одним реченням |
| "Deceptive behavior" | Не робіть нічого, що не описано в описі |

---

## 7. Оновлення

1. Збільшіть `version` в `manifest.json` (`"0.1.0"` → `"0.2.0"`)
2. Створіть новий ZIP
3. У Developer Dashboard → ваш extension → **"Package"** → **"Upload new package"**
4. Submit for review
5. Після схвалення — Chrome автоматично оновить у всіх юзерів

---

## 8. Build pipeline (якщо потрібен TypeScript/bundler)

Для MVP — чистий JS без bundler. Для Phase 2:

```bash
npm init -y
npm install -D typescript vite @crxjs/vite-plugin

# vite.config.ts — спеціальний плагін для Chrome Extensions
# @crxjs/vite-plugin читає manifest.json і робить все автоматично
```

**Але для DOM Review MVP — bundler НЕ потрібен.**
Чистий JS + manifest.json — це все що треба.

---

## 9. Корисні посилання

- Документація: https://developer.chrome.com/docs/extensions/
- Manifest V3 guide: https://developer.chrome.com/docs/extensions/develop/
- Developer Dashboard: https://chrome.google.com/webstore/devconsole
- Chrome Extension Samples: https://github.com/nicedoc/nicedoc
- MV3 migration: https://developer.chrome.com/docs/extensions/develop/migrate/
