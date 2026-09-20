# APPLICATION SHELL & RESPONSIVE NAVIGATION SPECIFICATION
**Project:** Onnesha Hospital Management System (OHMS)  
**Layout:** Desktop-First Responsive Grid with Collapsible Sidebar and Mobile Drawer  

---

## 1. Shell Components Topology

```
┌────────────────────────────────────────────────────────────────────────┐
│ HospitalHeader (Logo, Active Org Context, Clock, Notifications, User) │
├────────────────────────────┬───────────────────────────────────────────┤
│ HospitalSidebar            │ Main Content Workspace                    │
│                            │                                           │
│ ✦ Dashboard                │ ┌───────────────────────────────────────┐ │
│ ✦ Patients Master & EMR    │ │ Breadcrumbs / Page Action Bar         │ │
│ ✦ Appointments & Tokens    │ ├───────────────────────────────────────┤ │
│ ✦ Doctors & Chambers       │ │ Dynamic Route Content (/app/*)        │ │
│ ✦ OPD & IPD Clinic         │ │                                       │ │
│ ✦ Billing & Accounts       │ │ [Loading Skeletons / Empty States]    │ │
│ ✦ Diagnostics & Lab        │ │                                       │ │
│ ✦ Pharmacy (FIFO)          │ │                                       │ │
│ ✦ Wards, Cabins & OT       │ │                                       │ │
│ ✦ HR & Fingerprint Punch   │ │                                       │ │
│ ✦ Enterprise Reports       │ │                                       │ │
│ ✦ Hospital Settings        │ │                                       │ │
│                            │ └───────────────────────────────────────┘ │
└────────────────────────────┴───────────────────────────────────────────┘
```

---

## 2. Dynamic Permission-Aware Navigation
The sidebar navigation items evaluate the authenticated user's permission set:
- If `billing.view` is absent, the Billing & Accounts menu item is not rendered.
- If `lab.view` is absent, Diagnostics & Lab is hidden.
- Regardless of UI visibility, every server action and page loader asserts server-side `requirePermission()` to prevent direct URL manipulation.
