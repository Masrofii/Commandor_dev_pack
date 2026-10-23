# Accessibility Statement for Commandor Dev Pack

At **Commandor Dev Pack**, we believe that developer tools, cloud infrastructure dashboards, and communication interfaces should be accessible and usable by everyone, including operators and contributors with disabilities, motor impairments, low vision, color blindness, or situational limitations.

This document details our current accessibility features, design practices, assistive technology considerations, known limitations, and how to report accessibility barriers.

---

## 🎯 Our Accessibility Goals

Our goal is to build an inclusive self-hosted control plane that:
- Supports complete keyboard navigation without requiring a pointing device.
- Leverages semantic HTML elements and accessible rich internet application (ARIA) semantics.
- Delivers robust contrast across both light mode and dark mode themes.
- Supports screen readers on desktop and mobile platforms.
- Naturally accommodates right-to-left (RTL) reading flows for languages like Arabic and Urdu alongside left-to-right (LTR) flows.

> [!NOTE]
> While we continuously test against recognized accessibility principles (such as WCAG 2.1 Level AA criteria), we do not claim formal third-party certification. We treat accessibility as an ongoing engineering commitment.

---

## ⌨️ Keyboard Navigation & Focus Behavior

The Commandor Dev Pack web dashboard is structured for full keyboard operability:

- **Logical Tab Order**: Interactive elements (navigation links, buttons, inputs, dropdown menus, table actions) follow a natural left-to-right (or right-to-left in RTL mode) and top-to-bottom tab sequence.
- **Visible Focus Rings**: All interactive controls feature high-visibility focus indicators using Tailwind focus rings (`focus:outline-none focus:ring-2 focus:ring-indigo-500/60 dark:focus:ring-cyan-500/50`).
- **Modal & Drawer Controls**:
  - The mobile navigation drawer can be toggled via keyboard and dismissed by pressing the close button or clicking the backdrop.
  - Dropdown menus (such as the language selector) close when an option is selected or when focus moves away.
- **No Keyboard Traps**: Focus can move into and out of all forms, wizards, and interactive widgets without getting trapped.

---

## 🔊 Screen-Reader Support & Semantic HTML

We build our UI with standard semantic HTML structures:

- **Landmark Elements**: The dashboard uses `<header>`, `<nav>`, `<aside>`, and `<main>` landmarks, enabling screen-reader users (such as NVDA, JAWS, VoiceOver, and Orca) to quickly jump to primary sections.
- **Icon Buttons**: Icon-only buttons (such as the mobile drawer toggle, theme toggle, and delete icons) provide descriptive `aria-label` or `title` attributes (e.g. `aria-label="Open sidebar"`, `title="Switch to Dark mode"`).
- **Status Indicators**: Dynamic status badges (such as `Live` / `Offline` websocket sync indicators) include accompanying textual status descriptions, ensuring information is not conveyed by color alone.
- **Live Notifications**: Asynchronous alerts (such as newly arrived emails or action completions) utilize `react-hot-toast` with live-region announcements so screen readers detect updates without page reloads.

---

## 🎨 Color Contrast & Readable Typography

- **Contrast-Calibrated Palettes**:
  - **Light Theme**: Built with high-contrast slate typography (`text-slate-900`) against crisp, subtle backgrounds (`bg-white` and `bg-slate-50`).
  - **Dark / Cyber Theme**: Utilizes deep navy/slate backgrounds (`bg-cyber-950` and `bg-cyber-900`) with bright, high-contrast text (`text-white` and `text-slate-100`) and cyan accent highlights.
- **Information Not Solely by Color**: Error states, success messages, and critical alerts pair distinct icons with text labels, not just color shifts.
- **Scalable Typography**: UI font sizes use rem-based scales that gracefully adapt to user-configured browser zoom levels up to 200% without overlapping text.

---

## 📝 Forms, Validation & Error Handling

- **Explicit Form Labels**: Input fields include visible labels, descriptive placeholders, and contextual helper text.
- **Code & Monospace Fields**: Critical technical inputs (such as API keys, SSH fingerprints, domain names, and OTP codes) use clear monospace font families (`font-mono`) to prevent confusing ambiguous characters (such as `1`, `l`, `I`, `0`, and `O`).
- **Clear Error Messaging**: Validation errors are presented directly adjacent to the input field or communicated via accessible toast notifications.

---

## 🌐 Responsive Layout & Language Direction (RTL)

Commandor Dev Pack is built with internationalization and bidirectional layout support:

- **Native RTL Support**: When an RTL language like Arabic (`ar`) or Urdu (`ur`) is selected, the application automatically sets `<html dir="rtl">`.
- **Bidirectional Layout Mirroring**: The sidebar anchors to the right, navigation items mirror naturally, and arrows rotate 180 degrees (`rtl:rotate-180`) to represent correct reading direction.
- **Code Isolation**: Technical identifiers, email addresses, monospace codes, URLs, and server commands are protected with `unicode-bidi: isolate; direction: ltr;` rules so technical syntax is not distorted in RTL contexts.

---

## ⚠️ Known Limitations & Ongoing Improvements

Based on our internal audits, we are actively working on the following accessibility areas:

1. **Topology & Infrastructure Maps**: Complex SVG/Canvas diagrams representing cluster node connections and reverse proxy topologies have basic textual fallbacks, but do not yet provide full keyboard navigation through individual diagram nodes.
2. **Real-Time Log Streamers**: High-frequency terminal log outputs can generate high volumes of live announcements for screen readers. We are designing throttling and pause controls for terminal viewports.
3. **Complex Data Tables**: Multi-column server inventory tables are responsive, but horizontal scrolling on very narrow mobile viewports may require additional table orientation headers.

---

## 🤝 Feedback & Reporting Barriers

If you encounter an accessibility barrier or have suggestions for improving accessibility across the web dashboard, Telegram bot, or documentation:

- **GitHub Issue**: Submit an issue on [GitHub Issues](https://github.com/Masrofii/Commandor_dev_pack/issues) using the `bug_report.yml` template and tag it with `accessibility`.
- **Maintainer Contact**: `[INSERT MAINTAINER CONTACT EMAIL OR ACCESSIBILITY CHANNEL]`

When reporting an accessibility issue, please specify:
- The page, modal, or component where the issue occurred.
- The assistive technology used (e.g. NVDA on Firefox, VoiceOver on Safari, keyboard only).
- A description of the barrier and what would make the interaction smoother.

We welcome feedback and contributions from the community to help us make Commandor Dev Pack accessible to all developers.
