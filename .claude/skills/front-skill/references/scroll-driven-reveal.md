# Scroll-Driven Animations (CSS view() Timeline)

Pattern from `view-transform.html`, `portfolio.html`.

## Concept

Use the CSS `animation-timeline: view()` to trigger animations as elements scroll into the viewport — no JavaScript needed. Provide an IntersectionObserver fallback for browsers that don't support it.

## CSS — Scroll-Driven Animation

```css
@keyframes slide-fade-in {
    from {
        opacity: 0;
        box-shadow: none;
        transform: scale(.8) translateY(15vh);
    }
}

.card {
    animation: slide-fade-in both;
    animation-timeline: view();            /* driven by scroll position */
    animation-range: contain 0% contain 50%;  /* start when fully in view, end at 50% */
}
```

## Key Parameters

- `animation-timeline: view()` — links animation progress to the element's visibility in the scrollport
- `animation-range` — controls when the animation starts/ends:
  - Format: `<start> <end>`
  - Values: `cover N%` (element starts entering), `contain N%` (element fully visible), `exit N%` (element starts leaving)
  - Example: `contain 0% contain 30%` means "animate from when fully visible until 30% past that point"

## CSS — Staggering Cards with Different Ranges

```css
.card:nth-of-type(1) { animation-range: contain 0% contain 25%; }
.card:nth-of-type(2) { animation-range: contain 0% contain 30%; }
/* etc. */
```

## JavaScript — IntersectionObserver Fallback

```javascript
if (!CSS.supports('animation-timeline: view()')) {
    const cardObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, { threshold: 0.15 });

    document.querySelectorAll('.info-card').forEach(card => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(40px)';
        card.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        cardObserver.observe(card);
    });
}
```
