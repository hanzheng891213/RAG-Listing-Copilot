# Side Navigation with Active Curve

Pattern from `nav-light.html`, `nav-dark.html`, `portfolio.html`.

## Concept

A fixed sidebar that expands on hover via `width` transition. The active navigation item has curved corners created by `::before` and `::after` pseudo-elements — no SVG or clip-path needed.

## HTML Structure

```html
<nav class="shell">
  <ul class="nav">
    <li class="active" id="logo">
      <a href="#">
        <div class="icon">
          <div class="imageBox"><img src="./avatar.jpg" alt=""></div>
        </div>
        <div class="text">Brand Name</div>
      </a>
    </li>
    <li>
      <a href="#section1">
        <div class="icon"><i class="iconfont icon-home"></i></div>
        <div class="text">Home</div>
      </a>
    </li>
  </ul>
</nav>
```

## CSS — Shell (Expandable Container)

```css
.shell {
    position: fixed;
    width: 84px;                /* collapsed width */
    height: 100%;
    background: #fff;
    z-index: 9999;
    transition: width 0.5s;     /* smooth expand */
    padding-left: 10px;
    overflow: hidden;           /* hide text when collapsed */
}

.shell:hover {
    width: 300px;               /* expanded width */
}
```

## CSS — Active State with Curved Corners

The key insight: use `::before` and `::after` on `.active` with `box-shadow` matching the page background to create the illusion of curved cutouts.

```css
.active {
    background: #e4e9f5;                    /* same as page background */
    border-top-left-radius: 50px;
    border-bottom-left-radius: 50px;
}

.active::before {
    content: "";
    position: absolute;
    top: -30px;
    right: 0;
    width: 30px;
    height: 30px;
    border-bottom-right-radius: 25px;
    box-shadow: 5px 5px 0 5px #e4e9f5;     /* matches .active background */
    background: transparent;
}

.active::after {
    content: "";
    position: absolute;
    bottom: -30px;
    right: 0;
    width: 30px;
    height: 30px;
    border-top-right-radius: 25px;
    box-shadow: 5px -5px 0 5px #e4e9f5;    /* matches .active background */
    background: transparent;
}
```

**Why it works**: The pseudo-elements sit above and below the active item, with a `box-shadow` that extends over the nav's right edge. By setting `background: transparent` and using `border-radius` on the appropriate corner, the shadow fills only the area that creates the curve illusion.

## CSS — Icon Active Indicator

```css
.active a .icon::before {
    content: "";
    position: absolute;
    inset: 5px;
    width: 60px;
    background: #fff;
    border-radius: 50%;
    border: 7px solid rgb(110, 90, 240);
    box-sizing: border-box;
}
```

## CSS — Text Reveal on Hover

```css
.nav-text {
    opacity: 0;
    transition: opacity 0.3s 0.1s;  /* delay so text appears after width starts expanding */
}

.shell:hover .nav-text {
    opacity: 1;
}
```

## JavaScript — Click to Set Active

```javascript
let nav = document.querySelectorAll(".nav li");
function activeLink() {
    nav.forEach((item) => item.classList.remove("active"));
    this.classList.add("active");
}
nav.forEach((item) => item.addEventListener("click", activeLink));
```

## JavaScript — Scroll Spy (IntersectionObserver)

```javascript
const navLinks = document.querySelectorAll('.nav-links li');
const sections = document.querySelectorAll('section');

function setActiveNav(id) {
    navLinks.forEach(li => {
        li.classList.toggle('active', li.dataset.section === id);
    });
}

const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            setActiveNav(entry.target.id);
        }
    });
}, { threshold: 0.5 });

sections.forEach(s => observer.observe(s));
```

## Dark Variant

For dark theme, the `box-shadow` color must match the page background:

```css
.shell { background: #000; }
.active { background: #e4e9f5; }
.active::before { box-shadow: 5px 5px 0 5px #e4e9f5; }
.active::after  { box-shadow: 5px -5px 0 5px #e4e9f5; }
```

## Pitfalls

- The `box-shadow` color on `::before`/`::after` MUST match the active item's background color exactly. When using theme variables, use the same variable.
- The sidebar needs `overflow: hidden` to hide text when collapsed. Don't set it on inner elements.
