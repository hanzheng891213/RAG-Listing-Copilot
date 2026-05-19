# Profile Card with Skew Header

Pattern from `profile-card.html`, `portfolio.html`.

## Concept

A profile card where the top section has a diagonal/skewed cutoff. Achieved by applying `skewY()` to a `::before` pseudo-element on the header, with the avatar overlapping the boundary.

## HTML Structure

```html
<div class="shell">
  <div class="head"></div>
  <img class="cover" src="./avatar.jpg" alt="">
  <div class="data">
    <div class="title1">Name<span>Tag</span></div>
    <div class="title2">Role / Title</div>
  </div>
  <div class="foot">
    <div class="tags"><span class="tag">#Skill</span></div>
    <div class="introduce"><p>Bio text</p></div>
  </div>
</div>
```

## CSS — Card Shell

```css
.shell {
    width: 780px;
    height: 580px;
    background: #ffffff;
    position: relative;
}
```

## CSS — Skewed Header

The trick: apply `skewY()` to the `::before` pseudo-element, not to `.head` itself. This prevents all child content from skewing too.

```css
.head {
    height: 340px;
    position: relative;
    overflow: hidden;       /* clip the skewed pseudo-element */
    z-index: 1;
}

.head::before {
    content: '';
    width: 100%;
    height: 100%;
    position: absolute;
    background: url("./profile-img.jpg") center/cover no-repeat;
    z-index: -1;
    transform: skewY(-4deg);       /* the skew happens here */
    transform-origin: 0 0;         /* skew from top-left corner */
}
```

## CSS — Avatar Overlapping the Boundary

```css
.cover {
    position: absolute;
    top: 190px;              /* positioned to overlap the skew boundary */
    left: 25px;
    width: 220px;
    z-index: 2;              /* above both .head and .foot */
    border-radius: 50%;
    border: 10px #fff solid; /* creates separation from the skewed background */
    box-shadow: 0 5px 10px #00000065;
}

.data {
    padding: 190px 0 0 280px;  /* clear the avatar */
    text-shadow: 0 0 20px #000;
}
```

## CSS — Tags

```css
.tag {
    background: rgb(149, 178, 255);
    color: #fff;
    border-radius: 10px;
    padding: 3px 8px;
    font-size: 14px;
    margin-right: 4px;
    line-height: 35px;
    cursor: pointer;
}

.tag:hover {
    background: #eee4ad;
    color: #444;
}
```

## Pitfalls

- Apply `skewY()` to `::before`, not to the element itself, to avoid skewing children.
- The skewed pseudo-element will overflow; the parent needs `overflow: hidden` to clip it.
