# Framework Detector Module — Implementation Plan

## 1. Content Script Isolation (Critical Constraint)

Chrome Manifest V3 content scripts run in an **isolated world** — they share the DOM but NOT JavaScript globals. However, **DOM element properties** set by frameworks (`__reactFiber$`, `__vue__`, `__vueParentComponent`, `__ngContext__`) ARE accessible because content scripts and the page share the same DOM objects.

This means we can probe DOM properties directly without page-world injection for most cases.

## 2. Plugin/Adapter Interface

Every framework adapter must conform to this interface:

```typescript
interface FrameworkAdapter {
  id: string;                    // 'react', 'vue2', 'vue3', 'angular'
  name: string;                  // 'React', 'Vue 2', 'Vue 3', 'Angular'
  detect(): boolean;             // Page-level: is this framework present?
  getComponentInfo(element: HTMLElement): FrameworkComponentInfo | null;
}

interface FrameworkComponentInfo {
  framework: string;             // matches adapter.id
  componentName: string;         // e.g., 'TodoItem', 'AppHeader'
  filePath: string | null;       // e.g., 'src/components/TodoItem.vue'
  props: Record<string, unknown>;
  state: Record<string, unknown>;
  parentComponentName: string | null;
  componentRootElement: string;  // tag name of component root element
}
```

## 3. Extended ContextObject

Non-breaking addition — `framework` is `null` for vanilla HTML:

```typescript
interface ContextObject {
  tagName: string;
  text: string;
  boundingBox: { x: number; y: number; w: number; h: number };
  styles: { /* existing */ };
  a11y: { /* existing */ };
  framework: FrameworkComponentInfo | null;  // NEW
}
```

## 4. Module Structure

Single file: `content/modules/framework-detector.js`

```
framework-detector.js
  ├── Adapter Registry (Map<string, FrameworkAdapter>)
  │     register(adapter), getAdapters()
  ├── Built-in Adapters
  │     ├── ReactAdapter
  │     ├── Vue2Adapter
  │     ├── Vue3Adapter
  │     └── AngularAdapter
  ├── Page Detection Cache
  │     detectFrameworks() -> string[]  (cached after first call)
  ├── Utilities
  │     shallowCapture(obj, maxKeys) — safe top-level clone
  │     summarizeValue(val) — [Function], [Array(n)], [Object], etc.
  └── Public API
        detect(element) -> FrameworkComponentInfo | null
        getPageFrameworks() -> string[]
        registerAdapter(adapter) -> void
```

Registers on `window.__domReview.frameworkDetector`.

## 5. Detection Strategies Per Framework

### 5.1 React

**Page detection:**
- `document.querySelector('[data-reactroot]')`
- Check elements for property key starting with `__reactFiber$` or `__reactInternalInstance$`

**Element extraction:**
- Walk up from element, find `__reactFiber$*` property
- Walk fiber tree up to find non-host component (`typeof fiber.type !== 'string'`)
- `fiber.type.displayName || fiber.type.name` → component name
- `fiber._debugSource?.fileName` → file path (dev builds only)
- `fiber.memoizedProps` → props
- `fiber.memoizedState` → state (class components only; hooks = empty)
- `fiber.return` → parent fiber for parent component name

### 5.2 Vue 2

**Page detection:**
- Check `el.__vue__` on app root / first few elements
- `data-v-*` scoped style attributes

**Element extraction:**
- Walk up, find `el.__vue__`
- `vm.$options.name || vm.$options._componentTag` → name
- `vm.$options.__file` → file path
- `vm.$props` → props
- `vm.$data` → state
- `vm.$parent.$options.name` → parent name

### 5.3 Vue 3

**Page detection:**
- `el.__vue_app__` on app root
- `el.__vueParentComponent` on any element

**Element extraction:**
- Walk up, find `el.__vueParentComponent`
- `instance.type.name || instance.type.__name` → name
- `instance.type.__file` → file path
- `instance.props` → props
- `instance.setupState` (Composition API) or `instance.data` → state
- `instance.parent?.type?.name` → parent name

### 5.4 Angular

**Page detection:**
- `document.querySelector('[ng-version]')`

**Element extraction:**
- Walk up, find `el.__ngContext__` (LView array)
- Search array for objects with constructors (component instances)
- `component.constructor.name` → name
- Props/state: public properties on component instance
- File path: not available from DOM (always `null`)

## 6. Integration Points

### 6.1 `context-capture.js` (MODIFY)

Add framework detection call inside `capture()`:

```javascript
const { frameworkDetector } = window.__domReview;
const framework = frameworkDetector ? frameworkDetector.detect(element) : null;
// Add to return object: framework
```

Update `fallback()` to include `framework: null`.

### 6.2 `manifest.json` (MODIFY)

Add `framework-detector.js` **before** `context-capture.js`:

```json
"content/modules/framework-detector.js",
"content/modules/context-capture.js",
```

### 6.3 `comment-panel.js` (MODIFY — optional)

Display framework context in "Captured Context" section:
- `framework: vue3`
- `component: SubmitButton`
- `file: src/components/SubmitButton.vue`

### 6.4 `content-script.js` — NO CHANGES

Framework info flows automatically through `contextCapture.capture()`.

## 7. Data Format for AI Agent (MCP)

What an AI agent sees in `#dom-review-data`:

```json
{
  "context": {
    "tagName": "button",
    "text": "Place Order",
    "styles": { "..." },
    "a11y": { "..." },
    "framework": {
      "framework": "vue3",
      "componentName": "SubmitButton",
      "filePath": "src/components/SubmitButton.vue",
      "props": { "disabled": false, "label": "Place Order" },
      "state": { "isLoading": false },
      "parentComponentName": "CheckoutForm",
      "componentRootElement": "button"
    }
  }
}
```

## 8. Performance

- Page detection cached after first call → O(1)
- Element detection walks up only (max 30 ancestors) → O(depth)
- Short-circuit: no frameworks detected → immediate `null`
- `shallowCapture()`: max 20 keys, skips `_`/`$` prefixed, summarizes complex values
- Runs on-demand (element selection only), no background overhead

## 9. Extensibility: Adding New Framework

To add Svelte support — one adapter object:

```javascript
window.__domReview.frameworkDetector.registerAdapter({
  id: 'svelte',
  name: 'Svelte',
  detect() {
    return !!document.querySelector('[class*="svelte-"]');
  },
  getComponentInfo(element) {
    // Walk up, find el.__svelte_meta
    // Return FrameworkComponentInfo or null
  }
});
```

Can be inside `framework-detector.js` or a separate file.

## 10. Files to Create / Modify

| File | Action | Description |
|------|--------|-------------|
| `content/modules/framework-detector.js` | **CREATE** | Adapter registry + 4 built-in adapters |
| `content/modules/context-capture.js` | **MODIFY** | Add `framework` field to `capture()` |
| `manifest.json` | **MODIFY** | Add new file to content_scripts |
| `content/modules/comment-panel.js` | **MODIFY** | Display framework info in UI |
| `.planning/parallel-tracks.md` | **MODIFY** | Update namespace contract |

## 11. Implementation Sequence

1. Create `framework-detector.js` with registry + 4 adapters
2. Update `manifest.json` — add file before context-capture
3. Modify `context-capture.js` — call detector, add `framework` field
4. Modify `comment-panel.js` — show component name/file in panel
5. Update namespace contract docs

## 12. Known Limitations

- **React hooks state**: Stored as linked list, not capturable → `state: {}`
- **Production builds**: `filePath` unavailable (but extension targets localhost = dev)
- **Angular file paths**: Never available from DOM → always `null`
- **Angular `__ngContext__` structure**: Internal, may vary between versions
- **Multiple frameworks**: Handled — tries all detected adapters, first match wins