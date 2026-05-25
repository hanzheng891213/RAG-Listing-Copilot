# Clone-First-Image Seamless Carousel

Pattern from `轮播图学习.html`. A simpler alternative to the array-rotation approach.

## Concept

Clone the first image and append it to the end. When reaching the clone, instantly jump back to index 0 with `transition: none`.

## HTML

```html
<div id="wrap">
  <div class="img-list">
    <img src="1.jpg" />
    <img src="2.jpg" />
    <img src="3.jpg" />
    <img src="4.jpg" />
    <img src="5.jpg" />
  </div>
  <div class="arrow">
    <a href="javascript:;" class="left"><</a>
    <a href="javascript:;" class="right">></a>
  </div>
  <ul class="circle-list">
    <li class="circle active" data-n="0"></li>
    <!-- one dot per real image -->
  </ul>
</div>
```

## CSS

```css
#wrap {
    overflow: hidden;
    position: relative;
    width: 1226px;
    height: 580px;
}

#wrap .img-list {
    display: flex;
    position: relative;
    left: 0px;
    transition: 0.5s ease;
}

#wrap .img-list img {
    width: 100%;
    cursor: pointer;
}
```

## JavaScript — Initialize

```javascript
let oImgList = document.querySelector(".img-list");

// Clone first image and append to end
let clonefirstImg = oImgList.firstElementChild.cloneNode();
oImgList.appendChild(clonefirstImg);

let index = 0;
let lock = true;
```

## JavaScript — Next (Right)

```javascript
function handleRightBtn() {
    if (!lock) return;
    index++;
    oImgList.style.left = index * -1226 + "px";
    oImgList.style.transition = "0.5s ease";

    if (index === 5) {         // reached the clone
        index = 0;
        setTimeout(() => {
            oImgList.style.left = 0;
            oImgList.style.transition = "none";  // instant jump back
        }, 500);               // must match CSS transition duration
    }

    setCircles();
    lock = false;
    setTimeout(() => { lock = true; }, 500);
}
```

## JavaScript — Prev (Left)

```javascript
oLeft.addEventListener("click", () => {
    if (!lock) return;
    index--;
    if (index === -1) {
        // Jump to clone position, then slide to real last image
        oImgList.style.left = 5 * -1226 + "px";
        oImgList.style.transition = "none";        // instant jump
        index = 4;
        setTimeout(() => {
            oImgList.style.left = index * -1226 + "px";
            oImgList.style.transition = "0.5s ease";  // then slide
        }, 0);
    } else {
        oImgList.style.left = index * -1226 + "px";
    }
    setCircles();
    lock = false;
    setTimeout(() => { lock = true; }, 500);
});
```

## JavaScript — Lock-Based Throttling

An alternative to timer-based throttle — use a boolean lock:

```javascript
let lock = true;

function handleClick() {
    if (!lock) return;
    // ... do the work ...
    lock = false;
    setTimeout(() => { lock = true; }, 500);
}
```

## JavaScript — Event Delegation for Indicators

```javascript
const oCircle = document.querySelector(".circle-list");
oCircle.addEventListener("click", (e) => {
    if (e.target.nodeName.toLowerCase() === "li") {
        const n = Number(e.target.getAttribute("data-n"));
        index = n;
        setCircles();
        oImgList.style.left = index * -1226 + "px";
    }
});
```

## Clone vs Array-Rotation

| Aspect | Clone (this file) | Array-Rotation (`carousel-elliptical.md`) |
|--------|-------------------|-------------------------------------------|
| Complexity | Lower | Higher |
| DOM manipulation | Clone first image once | Rotate array on each slide |
| Best for | Fixed-width containers, simple carousels | Dynamic/responsive sizing, masked containers |
| Image count | Fixed at build time | Can be dynamic |
