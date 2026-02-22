# DOM Review — Візуальний Code Review для живого UI

## Концепція

Chrome Extension (Manifest V3), який дозволяє розробнику залишати
коментарі на DOM-елементах прямо в браузері. Коментарі зберігаються
як `data-*` атрибути в DOM, де їх читає AI-агент через Chrome DevTools MCP.

---

## Архітектура

```
┌─────────────────────────────────────────────────┐
│                  Chrome Browser                  │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │              Web Application                │  │
│  │                                             │  │
│  │  <button                                    │  │
│  │    class="btn-primary"                      │  │
│  │    data-review-id="r1"                      │  │  ◄── Extension додає
│  │    data-review="Колір не по дизайну,        │  │      data-атрибути
│  │      має бути #3B82F6, зараз #2563EB"       │  │
│  │    data-review-priority="high"              │  │
│  │    data-review-selector="main > .cta-btn"   │  │
│  │  >                                          │  │
│  │    Buy Now                                  │  │
│  │  </button>                                  │  │
│  │                                             │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ┌──────────────────┐  ┌──────────────────────┐  │
│  │ Content Script    │  │ Shadow DOM Overlay   │  │
│  │ (ISOLATED world)  │  │ - Маркери            │  │
│  │ - Click capture   │  │ - Панель коментарів  │  │
│  │ - DOM annotation  │  │ - Список review      │  │
│  │ - Selector gen    │  │                      │  │
│  └──────────────────┘  └──────────────────────┘  │
│                                                  │
│  ┌──────────────────────────────────────────┐    │
│  │ Chrome DevTools MCP (вже існує)          │    │
│  │ - take_snapshot → бачить data-review-*   │    │
│  │ - evaluate_script → читає всі коментарі  │    │
│  │ - get_page_info → контекст сторінки      │    │
│  └──────────┬───────────────────────────────┘    │
└─────────────┼────────────────────────────────────┘
              │ MCP Protocol
              ▼
┌─────────────────────────┐
│   AI IDE (Cursor, etc.) │
│                         │
│   Промпт:               │
│   "Прочитай всі         │
│    data-review коментарі│
│    на localhost:5173     │
│    і виправ кожен"       │
│                         │
└─────────────────────────┘
```

---

## Формат зберігання коментарів у DOM

### Прихований JSON-блок

```html
<!-- Елемент отримує лише маркер -->
<button class="btn-primary" data-review-id="r001">
  Buy Now
</button>

<!-- Всі коментарі зібрані в одному блоці в кінці body -->
<script type="application/json" id="dom-review-data">
{
  "version": "1.0",
  "page": "http://localhost:5173/checkout",
  "reviews": [
    {
      "id": "r001",
      "selector": "main > section.hero > button.btn-primary",
      "xpath": "/html/body/main/section[1]/button[2]",
      "comment": "Колір фону має бути #3B82F6 замість поточного #2563EB. Перевір змінну --color-primary в tokens.css",
      "priority": "high",
      "category": "style",
      "created": "2026-02-22T14:00:00Z",
      "context": {
        "computedBg": "#2563EB",
        "boundingBox": { "x": 420, "y": 312, "w": 180, "h": 44 },
        "a11yRole": "button",
        "a11yLabel": "Buy Now"
      }
    },
    {
      "id": "r002",
      "selector": "#nav > ul > li:nth-child(3) > a",
      "comment": "Цей пункт меню має бути прихований для неавторизованих юзерів. Перевір v-if directive в NavMenu.vue",
      "priority": "medium",
      "category": "logic",
      "created": "2026-02-22T14:05:00Z",
      "context": {
        "a11yRole": "link",
        "a11yLabel": "Admin Panel",
        "framework": "vue3",
        "component": "NavMenuItem"
      }
    }
  ]
}
</script>
```

**Плюси:**
- Чистий DOM — елементи мають лише `data-review-id`
- Необмежена кількість коментарів
- Структурований JSON — AI-агент парсить одним запитом
- Легко експортувати/імпортувати

**Мінуси:** `<script type="application/json">` — MCP повинен знати, де шукати.

### Як AI-агент читає коментарі

Через Chrome DevTools MCP один evaluate_script запит:

```javascript
// Агент виконує через MCP:
JSON.parse(
  document.getElementById('dom-review-data')?.textContent || '{"reviews":[]}'
)
```

Або через DOM snapshot — MCP бачить `data-review-id` на елементах
і може зрозуміти контекст навколо маркера.

---

## Типи коментарів (categories)

| Category | Опис | Приклад |
|----------|------|---------|
| `style`  | CSS/візуальні проблеми | "Відступ зліва 24px, має бути 16px" |
| `logic`  | Поведінка/бізнес-логіка | "Кнопка має бути disabled поки форма невалідна" |
| `a11y`   | Доступність | "Немає aria-label на іконці" |
| `text`   | Контент/копірайтинг | "Текст помилки незрозумілий для юзера" |
| `layout` | Сітка/розташування | "На mobile ці елементи мають бути в колонку" |
| `remove` | Видалити елемент | "Цей банер більше не потрібен" |
| `add`    | Додати елемент | "Тут має бути tooltip з підказкою" |

---

## User Flow (як це працює для розробника)

### Крок 1: Активація

Розробник відкриває localhost:5173, натискає іконку extension.
З'являється floating toolbar (Shadow DOM, ізольований від стилів додатка).

### Крок 2: Вибір елемента

Натискає "Select" → hover показує outline на елементах (як DevTools inspect).
Клікає на елемент → елемент виділяється, з'являється панель коментаря.

### Крок 3: Коментар

Пише коментар у текстове поле. Обирає категорію та пріоритет.
Extension автоматично збирає контекст:
- CSS-селектор
- Computed styles (тільки релевантні: color, bg, padding, margin, font-size)
- Accessibility role/label
- Framework component name (якщо Vue/React)

### Крок 4: Збереження

Extension додає `data-review-id` на елемент та оновлює JSON-блок у DOM.
На елементі з'являється візуальний маркер (badge з номером).

### Крок 5: Передача агенту

Розробник переходить в IDE (Cursor) і пише:

```
Підключись до localhost:5173 через Chrome DevTools MCP.
Знайди блок #dom-review-data і прочитай всі review-коментарі.
Виправ кожен коментар з priority=high у відповідних файлах проекту.
```

### Крок 6: Верифікація

Агент вносить зміни → розробник оновлює сторінку → перевіряє візуально →
позначає коментар як "resolved" або додає новий.

---

## MVP Scope (Phase 1: 2-3 тижні)

| Feature | Пріоритет | Складність |
|---------|-----------|------------|
| Shadow DOM toolbar | P0 | Низька |
| Click-to-select з highlight | P0 | Низька |
| Панель коментаря (текст + category + priority) | P0 | Низька |
| CSS Selector генерація | P0 | Середня |
| JSON-блок у DOM (`#dom-review-data`) | P0 | Низька |
| Візуальні маркери (badges) на елементах | P0 | Низька |
| Список всіх коментарів у sidebar | P1 | Середня |
| Computed styles auto-capture | P1 | Низька |
| A11y role/label auto-capture | P1 | Низька |
| Export JSON як файл | P1 | Мінімальна |
| Import JSON (завантажити попередні коментарі) | P1 | Низька |
| Resolve/unresolve коментар | P1 | Мінімальна |

**Phase 2 (тижні 4-6):**

| Feature | Пріоритет |
|---------|-----------|
| Vue 3 component name detection | P1 |
| React Fiber component name detection | P2 |
| Скріншот виділеної області (attach до коментаря як base64) | P1 |
| localStorage persistence (коментарі переживають refresh) | P0 |
| Prompt template generator ("Виправ всі high priority reviews") | P1 |
| Keyboard shortcuts (R = review mode, Esc = cancel) | P1 |

**Phase 3 (якщо є попит):**

| Feature | Пріоритет |
|---------|-----------|
| Власний MCP-сервер (extension ↔ IDE напряму) | P2 |
| Multi-user reviews (WebSocket sync) | P3 |
| Інтеграція з Jira/Linear (створення тікетів з reviews) | P3 |
| Diff view: before/after скріншоти | P2 |

---

## Persistence Strategy

### Проблема
DOM-коментарі зникають при перезавантаженні сторінки.

### Рішення: Triple storage

1. **DOM** (runtime) — `#dom-review-data` JSON-блок.
   Це "активний" стан, який бачить MCP.

2. **localStorage** (per-origin) — extension зберігає reviews
   в `localStorage` під ключем `dom-review:{origin}{pathname}`.
   При завантаженні сторінки — content script відновлює
   JSON-блок та data-review-id маркери.

3. **File export** (manual) — кнопка "Export" зберігає
   JSON-файл для version control або передачі колегам.

```
Сторінка завантажується
        │
        ▼
Content Script перевіряє localStorage
        │
        ├── є збережені reviews?
        │         │
        │         ▼ Так
        │   Inject data-review-id на елементи
        │   Створити #dom-review-data блок
        │   Показати маркери
        │
        └── ні → чистий стан
```

---

## Prompt Templates (вбудовані в extension)

Extension може генерувати готовий промпт для AI-агента:

### Template: "Fix All"

```markdown
Connect to Chrome at localhost:5173 using Chrome DevTools MCP.

Execute this script to read review comments:
`JSON.parse(document.getElementById('dom-review-data').textContent)`

You will receive a JSON with review comments attached to DOM elements.
Each review has:
- `selector` — CSS selector of the target element
- `comment` — what needs to be fixed
- `priority` — high/medium/low
- `category` — style/logic/a11y/text/layout/remove/add
- `context` — computed styles, accessibility info, component name

Fix ALL reviews with priority "high" first, then "medium".
For each fix, explain what file you changed and why.
After fixing, I will verify visually and mark reviews as resolved.
```

### Template: "Style Review"

```markdown
Connect to Chrome at localhost:5173 using Chrome DevTools MCP.

Read review data from `#dom-review-data`.
Focus only on reviews with category "style".

For each style issue:
1. Read the current computed styles via MCP
2. Compare with the desired state in the comment
3. Find the CSS file responsible
4. Make the minimal change needed
```

### Template: "Accessibility Audit"

```markdown
Connect to Chrome at localhost:5173 using Chrome DevTools MCP.

Read review data from `#dom-review-data`.
Focus on reviews with category "a11y".

Additionally, run your own accessibility check on elements
near the reviewed ones — the developer may have missed issues.
```

---

## Чому це працює краще за початкову ідею

| Аспект | Початкова ідея | DOM Review |
|--------|---------------|------------|
| **Складність** | Високо (MCP server, structured output, framework reflection) | Низька (data attributes + JSON block) |
| **Time to MVP** | 4-6 тижнів | 2-3 тижні |
| **Залежність від MCP** | Потрібен свій MCP server | Використовує існуючий Chrome DevTools MCP |
| **Workflow** | Один елемент → один промпт | Batch: 10 коментарів → один промпт "виправ все" |
| **Контекст для AI** | Автоматичний (селектори, стилі) | Людський + автоматичний (коментар + контекст) |
| **Двосторонній зв'язок** | Одностороній (browser → AI) | Двосторонній (browser ↔ AI через DOM) |
| **Value prop** | "Бачить що ви бачите" | "Розуміє що ви хочете" |
