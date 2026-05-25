# Masonry Grid with grid-auto-flow: dense

Pattern from `view-transform.html`, `portfolio.html`.

## Concept

Use CSS Grid with `grid-auto-flow: dense` and varying `grid-column`/`grid-row` spans to create a masonry-like layout where cards fill gaps naturally.

## CSS

```css
.cards {
    display: grid;
    gap: 2rem;
    grid-auto-flow: dense;                 /* fill gaps with later items */
    grid-template-columns: repeat(4, 1fr);
}

.card:nth-of-type(4n) {
    grid-column: span 2;                   /* every 4th card spans 2 columns */
}

.card:nth-of-type(5n) {
    grid-column: span 2;                   /* every 5th card spans 2 columns */
}

.card:nth-of-type(7n) {
    grid-row: span 2;                      /* every 7th card spans 2 rows */
}
```

**Why `dense` matters**: Without `dense`, Grid places items in source order and leaves gaps when an item doesn't fit. With `dense`, Grid backfills those gaps with later items that do fit, creating a tighter packed layout.

## Responsive Adjustments

```css
@media (max-width: 1024px) {
    .cards { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 480px) {
    .cards { grid-template-columns: 1fr; }
    /* Reset all spans for single-column layout */
    .card:nth-of-type(1),
    .card:nth-of-type(4),
    .card:nth-of-type(5),
    .card:nth-of-type(6) {
        grid-column: span 1;
    }
}
```
