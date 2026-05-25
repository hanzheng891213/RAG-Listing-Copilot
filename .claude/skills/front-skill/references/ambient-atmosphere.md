# Ambient Background & Accent Details

Pattern from `portfolio.html`.

## Fixed Radial Gradient Overlay

Creates depth without image assets using two overlapping radial gradients on `body::before`:

```css
body::before {
    content: '';
    position: fixed;
    inset: 0;
    z-index: -1;
    pointer-events: none;
    background:
        radial-gradient(ellipse at 60% 0%, var(--accent-glow) 0%, transparent 60%),
        radial-gradient(ellipse at 30% 100%, rgba(0, 0, 0, 0.12) 0%, transparent 50%);
}
```

**Why this works**:
- `position: fixed` — stays in place during scroll
- `pointer-events: none` — clicks pass through to page content
- `z-index: -1` — sits behind everything
- Two overlapping ellipses at opposite corners create natural depth

## Contact Card with Top Accent Line

```css
.contact-card {
    position: relative;
    overflow: hidden;
}

.contact-card::before {
    content: '';
    position: absolute;
    top: -1px;
    left: 20%;
    right: 20%;
    height: 2px;
    background: var(--accent);
}
```

The accent line is horizontally centered (20% from each edge) and sits just inside the card's top border (`top: -1px`).

## Section Hero Glow

A large colored radial gradient behind a hero section:

```css
#home::before {
    content: '';
    position: absolute;
    top: -120px;
    right: -80px;
    width: 500px;
    height: 500px;
    border-radius: 50%;
    background: radial-gradient(circle, var(--accent-glow) 0%, transparent 70%);
    pointer-events: none;
}
```

Position the glow partially off-screen for a subtle atmospheric effect rather than an obvious circle.
