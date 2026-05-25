# Button & Card Hover Effects

Pattern from `portfolio.html`.

## Button — Sliding Background

The `::after` pseudo-element slides up from below on hover:

```css
.btn {
    position: relative;
    overflow: hidden;
    /* rest of button styles */
}

.btn::after {
    content: '';
    position: absolute;
    inset: 0;
    background: var(--accent);
    transform: translateY(100%);       /* hidden below */
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    z-index: -1;
}

.btn:hover::after {
    transform: translateY(0);          /* slides up into view */
}

.btn:hover {
    color: var(--bg-primary);
    border-color: var(--accent);
}
```

**Key detail**: Set `z-index: -1` on the pseudo-element so it stays behind the button text.

### Primary Button Variant

```css
.btn-primary {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--bg-primary);
}

.btn-primary::after {
    background: var(--bg-primary);
}

.btn-primary:hover {
    color: var(--accent);
}
```

## Card — Top Border Sweep

A gradient line sweeps across the top edge on hover:

```css
.info-card {
    position: relative;
    overflow: hidden;
    transition: border-color 0.4s, transform 0.4s;
}

.info-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 2px;
    background: linear-gradient(to right, transparent, var(--accent-dim), transparent);
    transform: translateX(-100%);       /* starts off-screen left */
    transition: transform 0.6s;
}

.info-card:hover::before {
    transform: translateX(0);           /* sweeps to visible position */
}

.info-card:hover {
    border-color: var(--accent-dim);
    transform: translateY(-2px);
}
```

The gradient `transparent → accent → transparent` creates a "light beam" effect.

## Contact Link — Bottom Inset Shadow

```css
.contact-link {
    padding: 12px 24px;
    border: 1px solid var(--border-color);
    transition: all 0.3s;
}

.contact-link:hover {
    border-color: var(--accent);
    color: var(--accent);
    box-shadow: inset 0 -2px 0 var(--accent);  /* bottom underline inside border */
}
```
