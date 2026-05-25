# Elliptical Mask SVG Reference

## Raw SVG

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="500" viewBox="0 0 1440 500" id="i">
  <path fill="rgb(200,200,200)" fill-rule="evenodd" d="M0 0s275.04 100 720 100S1440 0 1440 0v500s-275.04-100-720-100S0 500 0 500V0z"/>
</svg>
```

## How the Path Works

The path `d` attribute: `M0 0s275.04 100 720 100S1440 0 1440 0v500s-275.04-100-720-100S0 500 0 500V0z`

- Top edge: starts at (0,0), curves down to center (720,100) using bezier, then curves back up to (1440,0) — creating an arch shape
- Right edge: straight down to (1440,500)
- Bottom edge: curves from (1440,500) inward to center (720,400), then outward to (0,500) — inverted arch
- Left edge: straight back up to (0,0)

The `fill="rgb(200,200,200)"` is the mask fill — in CSS mask mode, the alpha/luminance of this fill determines opacity. Any mid-gray value produces full visibility in the masked region.

## Encoding to Base64 Data URI

To use the SVG as a CSS mask data URI:

1. Minify the SVG (remove unnecessary whitespace)
2. Base64-encode the minified string
3. Use: `mask: url(data:image/svg+xml;base64,<base64-string>)`

### Encoded Version (ready to use)

```
data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNDQwIiBoZWlnaHQ9IjUwMCIgdmlld0JveD0iMCAwIDE0NDAgNTAwIiBpZD0iaiI+CiAgPHBhdGggZmlsbD0icmdiKDIwMCwyMDAsMjAwKSIgZmlsbC1ydWxlPSJldmVub2RkIiBkPSJNMCAwczI3NS4wNCAxMDAgNzIwIDEwMFMxNDQwIDAgMTQ0MCAwdjUwMHMtMjc1LjA0LTEwMC03MjAtMTAwUzAgNTAwIDAgNTAwVjB6Ii8+Cjwvc3ZnPgo=
```

## Customizing the Mask

To adjust the elliptical shape:
- **Width/Height**: Change the `width` and `height` attributes (and corresponding `viewBox`)
- **Curve depth**: Modify the Y-coordinates in the bezier control points (e.g., change `100` to a larger value for a deeper curve)
- **Center point**: The `720` value in the path is the horizontal center (half of 1440). Adjust proportionally when changing width.

## CSS Usage

```css
.masked-container {
    overflow: hidden;
    mask: url(data:image/svg+xml;base64,...);
    mask-repeat: no-repeat;
    mask-position: center;
    mask-size: 100vw; /* or var(--mask-size) */
    /* Safari/legacy WebKit */
    -webkit-mask: url(data:image/svg+xml;base64,...);
    -webkit-mask-repeat: no-repeat;
    -webkit-mask-position: center;
    -webkit-mask-size: 100vw;
}
```
