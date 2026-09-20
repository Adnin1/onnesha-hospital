# Phase 17 — Mobile Optimization

## Touch & Interaction
- Minimum touch target: 44px × 44px on coarse pointer devices
- Applied to: buttons, links, checkboxes, radios, selects
- Mobile-first responsive utilities: `mobile-full-width`, `mobile-stack`, `mobile-hide`

## Responsive Tables
- `.table-responsive` CSS class for horizontal scroll on mobile
- `-webkit-overflow-scrolling: touch` for smooth scrolling

## Offline Indicator
- Full-width top banner on offline state
- Dismissible with clear Bangla messaging
- Does not block interaction

## PWA Install
- Bottom-positioned install prompt on mobile
- Full-width on small screens, fixed-width on desktop
- Non-intrusive, dismissible

## Reduced Motion
- `prefers-reduced-motion: reduce` disables all animations
- Safe for motion-sensitive users

## Tested Workflows
- Receptionist: patient search, register, billing
- Doctor: queue, patient 360, prescription
- Nurse: IPD, vitals, bed management
- Pharmacy: prescription, stock, dispense
- Cashier: invoice, payment, receipt
- Emergency: triage, rapid actions

## Known Limitations
- Real mobile device testing not performed (browser-verified only)
- Sidebar mobile drawer behavior relies on existing implementation
