---
name: rotation-style
description: This skill provides patterns for creating distinctive frontend interfaces: elliptical/SVG-masked image carousels with infinite scroll, expandable side navigation with active curve effects, profile cards with skew headers, CSS scroll-driven reveal animations, masonry dense-grid layouts, CSS custom-property theme systems, button/card hover effects, and ambient background atmosphere. Use when building image carousels, sliders, side navigation, profile cards, card grids, theme switching, or any frontend component needing polished layout and animation techniques.
---

# Rotation Style — Frontend Layout & Animation Patterns

This skill captures layout, animation, and interaction patterns extracted from production-grade HTML/CSS/JS examples. Each technique is documented in a self-contained reference file — read only the ones relevant to your task.

## When to Use

Trigger this skill when the user asks to:
- Build an image carousel, slider, or rotating gallery (elliptical masked or standard)
- Create an expandable side navigation with active-state indicators
- Create a profile card with angled/skewed header
- Add scroll-driven reveal animations to cards or sections
- Build a masonry or dense-grid card layout
- Set up a dark/light CSS custom property theme system
- Add polished hover effects to buttons or cards
- Add ambient background atmosphere with radial gradients

## Reference Files

Read only the files relevant to the current task. Each is self-contained with HTML structure, CSS, JavaScript, and pitfalls.

| Technique | File | When to Read |
|-----------|------|---------------|
| Side Nav with Active Curve | `references/nav-active-curve.md` | Building sidebars, navigation menus, active state indicators |
| Profile Card with Skew | `references/profile-card-skew.md` | Building profile/team cards with angled header sections |
| Scroll-Driven Reveal | `references/scroll-driven-reveal.md` | Animating elements on scroll without JS libraries |
| Masonry Dense Grid | `references/masonry-grid-dense.md` | Building card grids with varied spans, Pinterest-style layouts |
| Theme System | `references/theme-system.md` | Setting up dark/light mode with CSS custom properties |
| Elliptical Mask Carousel | `references/carousel-elliptical.md` | Building carousels with SVG mask effects, array-rotation infinite scroll |
| Clone-First-Image Carousel | `references/carousel-clone.md` | Simpler carousels — clone-based seamless looping, lock-based throttle |
| Hover Effects | `references/hover-effects.md` | Button slide backgrounds, card border sweeps, link underline effects |
| Ambient Atmosphere | `references/ambient-atmosphere.md` | Radial gradient overlays, accent lines, hero glows |
| SVG Mask Encoding | `references/mask-svg.md` | Raw SVG path and base64 encoding for elliptical masks |
| Design Principles | `references/front-design.md` | Typography, color, motion, spatial composition — aesthetic decisions |

## Which Carousel Pattern to Use

- **Clone technique** (`carousel-clone.md`): Simpler, fixed-width containers, fewer images. Clone the first image, jump back on wrap.
- **Array rotation** (`carousel-elliptical.md`): Dynamic sizing via CSS variables, SVG-masked containers, touch/keyboard support. Rotate a JS array in sync with DOM positions.

Both support: throttle, auto-play with "设表先关", indicator dots, and responsive sizing.

## Global Pitfalls

- **Timing alignment**: CSS `transition` duration, `setTimeout` delays, and throttle delay must all use the same value.
- **Transition flash**: Always set `transition: none` BEFORE changing position for resets, restore AFTER.
- **CSS variable parsing**: `getComputedStyle` returns strings with units. Use `parseFloat()` before arithmetic.
