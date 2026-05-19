# CSS Custom Properties Theme System

Pattern from `portfolio.html`.

## Concept

Define all colors, fonts, and spacing as CSS custom properties on `:root`. Toggle between light and dark themes by changing a class on `<html>`. This makes the entire site theme-switchable from a single class change.

## CSS

```css
:root {
    --bg-primary: #c7fbe4;
    --bg-secondary: #a1e0c6b6;
    --bg-card: #4d979819;
    --text-primary: #303133;
    --text-secondary: #909399;
    --border-color: rgba(0, 0, 0, 0.06);
    --shadow-color: rgba(0, 0, 0, 0.08);
    --accent: #1a7a6e;
    --accent-bright: #28b89d;
    --accent-dim: #0f5c52;
    --accent-coral: #e8785a;
    --accent-glow: rgba(26, 122, 110, 0.18);
    --font-display: 'Abril Fatface', 'Noto Serif SC', serif;
    --font-body: 'Crimson Pro', 'Noto Serif SC', serif;
    --font-mono: 'JetBrains Mono', monospace;
}

html.dark {
    --bg-primary: #1a3f43;
    --bg-secondary: #1e484d;
    --bg-card: #24595e;
    --text-primary: #e0e0e0eb;
    --text-secondary: #a4a9a9e9;
    --border-color: rgba(255, 255, 255, 0.06);
    --shadow-color: rgba(0, 0, 0, 0.3);
    --accent: #80f0b6;
    --accent-glow: rgba(128, 221, 240, 0.2);
}
```

**Key insight**: Never hardcode colors in component CSS. Always reference `var(--name)`. The theme can then be toggled by changing `html` class:

```javascript
document.documentElement.classList.toggle('dark');
```
