# Elliptical SVG Mask Carousel (Array Rotation)

Pattern from `portfolio.html`, `elliptical-rotation-chart-master/index.html`.

## Concept

A horizontal image carousel masked by an elliptical SVG shape so images are only visible through the center lens. Uses JavaScript array rotation for infinite scrolling and SVG data URI for the mask. See `references/mask-svg.md` for the raw SVG and encoding instructions.

## CSS — CSS Custom Properties

```css
:root {
    --post-spacing: 16px;    /* gap between adjacent images */
    --post-size: 260px;      /* width of each image card */
}
```

## CSS — Mask Container

```css
.carousel-stage {
    position: relative;
    width: 100%;
    margin: 0 auto;
    overflow: hidden;
    height: calc(var(--post-size) / 0.72);
    -webkit-mask: url(data:image/svg+xml;base64,...);
    mask: url(data:image/svg+xml;base64,...);
    -webkit-mask-repeat: no-repeat;
    mask-repeat: no-repeat;
    -webkit-mask-position: center;
    mask-position: center;
    -webkit-mask-size: 100%;
    mask-size: 100%;
}
```

Always provide both `-webkit-mask-*` and standard `mask-*` for cross-browser support.

## CSS — Container Placement

```css
.carousel-container {
    display: flex;
    position: relative;
    height: calc(var(--post-size) / 0.72);
    left: max(30px, calc(50% - var(--post-size) / 2));
    transition: left 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}
```

## CSS — Entrance Animation

```css
@keyframes carousel-admission {
    0%   { transform: translateX(min(1200px, 100vw)); }
    100% { transform: translateX(0); }
}

.carousel-container {
    animation: carousel-admission 1.2s cubic-bezier(0.22, 0.61, 0.36, 1);
}
```

## CSS — Image Cards

```css
.carousel-item {
    height: 100%;
    display: inline-block;
    flex-shrink: 0;
    margin-right: var(--post-spacing);
    position: relative;
    cursor: pointer;
    border-radius: 8px;
    overflow: hidden;
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    transition: border-color 0.4s;
}

.carousel-item:hover { border-color: var(--accent-dim); }

.carousel-item img {
    width: var(--post-size);
    height: 100%;
    object-fit: cover;
    object-position: center;
    filter: brightness(0.7);
    transition: filter 0.4s;
}

.carousel-item:hover img { filter: brightness(0.9); }
```

## CSS — Info Overlay

```css
.carousel-item .project-info {
    position: absolute;
    display: flex;
    flex-direction: column;
    justify-content: center;
    left: 0; top: 0;
    height: 100%; width: 100%;
    background: rgba(23, 23, 23, 0.5);
    text-align: center;
    padding: 28px;
}
```

## CSS — Control Buttons with Delayed Reveal

```css
.carousel-controls {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 24px;
    margin-top: 48px;
    opacity: 0;
    transform: translateY(10px);
    transition: opacity 0.8s, transform 0.8s;
}

.carousel-controls.visible {
    opacity: 1;
    transform: translateY(0);
}
```

Add `.visible` class via JavaScript after entrance animation completes:

```javascript
setTimeout(function () {
    controls.classList.add('visible');
}, transitionMs);
```

## JavaScript — Read CSS Variables at Runtime

```javascript
var postSize = parseFloat(getComputedStyle(document.documentElement)
    .getPropertyValue('--post-size'));
var postSpacing = parseFloat(getComputedStyle(document.documentElement)
    .getPropertyValue('--post-spacing'));
var itemStep = postSize + postSpacing;
var translateDist = itemStep * totalItems;
```

`getComputedStyle` returns values with units (e.g., `"260px"`). Use `parseFloat` to extract the number.

## JavaScript — Array Rotation Logic

The carousel maintains an array (`imgBoxList`) mirroring DOM order. Navigation rotates this array and uses `translateX` to position elements visually.

### Initialize

```javascript
imgBoxList.unshift(imgBoxList.pop());  // move last to front
```

### Next (→)

Shift container left, then after transition, move leftmost item to far right, rotate array.

```javascript
function next() {
    index--;
    // Set transition FIRST, then change position — order is critical
    container.style.transition = 'left 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
    container.style.left = (itemStep * index) + 'px';

    setTimeout(function () {
        container.style.transition = 'none';  // hide the reset

        if (Math.abs(index) === totalItems) {
            index = 0;
            container.style.left = '0';
            imgBoxList.forEach(function (item) {
                item.style.transform = 'none';
            });
        } else {
            imgBoxList[0].style.transform = 'translateX(' + translateDist + 'px)';
        }
        imgBoxList.push(imgBoxList.shift());
    }, transitionMs);

    updateDots();
}
```

### Prev (←)

Rotate array first, position new first item off-screen left, then shift container right.

```javascript
function prev() {
    index++;
    container.style.transition = 'left 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
    imgBoxList.unshift(imgBoxList.pop());
    imgBoxList[0].style.transform = 'translateX(-' + translateDist + 'px)';
    container.style.left = (itemStep * index) + 'px';

    if (Math.abs(index) === totalItems) {
        index = 0;
        setTimeout(function () {
            container.style.transition = 'none';
            container.style.left = '0';
            imgBoxList.forEach(function (item) {
                item.style.transform = 'none';
            });
        }, transitionMs);
    }
    updateDots();
}
```

**Why `index--` for "next"?** The container uses `left` positioning. Moving left → `left` more negative → lower index = items shift left.

## JavaScript — Throttle

```javascript
var timer = null;

function throttle(fn, delay) {
    return function () {
        if (timer) return;
        fn.apply(this, arguments);
        timer = setTimeout(function () { timer = null; }, delay);
    };
}

var throttledNext = throttle(next, transitionMs);
var throttledPrev = throttle(prev, transitionMs);
```

Match the throttle delay to the CSS transition duration.

## JavaScript — Indicator Dots Sync

```javascript
function updateDots() {
    var dots = indicators.querySelectorAll('.dot');
    for (var i = 0; i < dots.length; i++) {
        dots[i].classList.toggle('active', i === index);
    }
}
```

## JavaScript — goTo (Direct Jump)

```javascript
function goTo(targetIndex) {
    targetIndex = ((targetIndex % totalItems) + totalItems) % totalItems;
    if (targetIndex === index) return;

    container.style.transition = 'none';
    index = targetIndex;
    container.style.left = (itemStep * index) + 'px';
    imgBoxList.forEach(function (item) { item.style.transform = 'none'; });
    updateDots();

    setTimeout(function () {
        container.style.transition = 'left 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
    }, 50);
}
```

## JavaScript — Keyboard Navigation

```javascript
document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') throttledNext();
    if (e.key === 'ArrowLeft') throttledPrev();
});
```

## JavaScript — Touch/Swipe Support

```javascript
var startX = 0, startY = 0;
stage.addEventListener('touchstart', function (e) {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
}, { passive: true });

stage.addEventListener('touchend', function (e) {
    var dx = startX - e.changedTouches[0].clientX;
    var dy = startY - e.changedTouches[0].clientY;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
        if (dx > 0) throttledNext();
        else throttledPrev();
    }
});
```

## JavaScript — Auto-Play with "设表先关"

Always clear before setting to prevent timer accumulation:

```javascript
var autoplay = null;

function startAutoPlay() {
    stopAutoPlay();
    autoplay = setInterval(function () { throttledNext(); }, AUTOPLAY_INTERVAL);
}

function stopAutoPlay() {
    if (autoplay !== null) {
        clearInterval(autoplay);
        autoplay = null;
    }
}

stage.addEventListener('mouseenter', stopAutoPlay);
stage.addEventListener('mouseleave', startAutoPlay);
```

## Timing Coordination

All these values must be aligned:

| Element | Timing | Property |
|---------|--------|----------|
| Entrance animation | 1.2s | `animation` |
| Slide transition | 0.5s | `transition: left` |
| Button reveal delay | 0.5s | `setTimeout` |
| Throttle delay | 0.5s | `setTimeout` in throttle |
| Position reset delay | 0.5s | `setTimeout` in click handler |

## Pitfalls

- **Transition flash**: Always set `transition: none` BEFORE changing `left`/`transform`, restore AFTER.
- **Array-DOM sync**: After every `push(shift())` or `unshift(pop())`, visual positions must match.
- **Timing alignment**: CSS `transition` duration, `setTimeout` delays, and throttle delay must use the same value.
