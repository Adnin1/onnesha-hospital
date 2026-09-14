# Phase 17 — Accessibility

## Improvements Implemented

### Skip Navigation
- Skip-to-content link added to root layout
- `#main-content` landmark target

### Focus Management
- `focus-visible` outline: 2px solid primary color with 2px offset
- Applied globally via CSS

### Touch Targets
- Minimum 44px × 44px on `pointer: coarse` devices
- Applied to buttons, links, checkboxes, radios, selects

### Reduced Motion
- `prefers-reduced-motion: reduce` disables animations/transitions

### Screen Reader Support
- `.sr-only` utility class for visually hidden text
- `role="alert"` for error messages
- `role="status"` for loading states
- `aria-live="assertive"` for network status
- `aria-live="polite"` for toast notifications
- `aria-label` on loading spinners

### Error Boundaries
- `role="alert"` on all error boundaries
- Descriptive Bangla error messages
- Retry action button with focus styles
- No internal error details exposed to users

### Forms
- Error boundary pattern ensures graceful degradation
- Loading states use `role="status"` with `aria-label`

### Print Accessibility
- PWA elements hidden in print (`display: none !important`)
- Print styles preserved from Phase 15

## Known Limitations
- Full WCAG 2.2 AA audit not performed with automated tools (Lighthouse/axe)
- Per-field `aria-invalid` and `aria-describedby` on individual form inputs not yet added across all 34 client pages (incremental improvement)
- Dialog focus trap not yet implemented in existing modal patterns
