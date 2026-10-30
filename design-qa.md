# Unified Project 1 / Project 2 demo QA

Scope: one shared demo website; state-preserving switch between the existing Project1 simulator and Project2 buyer/backend UI. Root defaults to Project1 per user; /mini aliases open Project2. The underlying simulator and grant/session policies are retained.

## Visual target and comparison

Existing visual target: the compact The Builder mini, captured in `docs/evidence/mini-scroll-audit/images/11-final-desktop.png` (1280×720). This is the retained UI target, not a new audit of that historical capture. Implementation: http://127.0.0.1:8799/, `docs/evidence/unified-demo/images/project2-unified.png` (1280×720). Both CSS and image dimensions1280×720, deviceScaleFactor1; no density scaling or stretching. Full-view comparison `comparison.png` (2560×760 with40px caption) and focused native header comparison `header-comparison.png` (1280×200) were opened together and inspected.

Intended differences: global header now has two persistent project tabs instead of links between separate pages; active scenario04 versus01 and trace/session values differ. Both download captures show actual successful67byte receipt. The buyer header/card and bottom terminal retain their visual language. Project1 standalone header/tab bar hidden only when embedded; its existing six-scenario UI remains. `project1-desktop.png` verifies the initial Project1 state. Mobile captures390×844 and375×844 verify the shared header and native scenario select. Manual Huashu Chrome capture `project2-desktop.png` was1534×911; it is separate observational evidence, not used for pixel comparisons.

## Findings and iterations

- [P2, resolved] Same-origin iframe404 may emit load without error; validate the child marker before dismissing recovery UI. Retry now changes the child reload query to force a fresh navigation. Forced404 → visible retry → successful recovery verified in headless Chromium.
- [P3, resolved] Standalone child navigation used root-relative URLs; replaced with relative index/lab links. Parent resolves child/direct/core links from its own directory, including /mini/ aliases. A static /preview/ subpath test verified child URLs and backend setup help.
- [P2, resolved] Keyboard/iframe scrolling could move the shared chrome outside the viewport during an intermediate capture. Fixed outer body to the viewport; root scrollY0/header y0 verified after download. Final capture re-taken after the reveal animation settled.
- [P2, resolved] Skip-navigation anchor could change project through hash routing; intercept it to focus main without changing hash. Keyboard skip keeps Project2 active; ArrowLeft/End change tabs and focus as expected.

No actionable P0/P1/P2 remains for this integration. Previous compact-layout audit remains in `docs/ux-scroll-audit.md`; historical evidence folders are preserved.

## Fidelity surfaces

- Fonts/typography: shared utility bar uses system UI; existing buyer Space Grotesk and strong headings remain inside its surface. Project1 keeps its own existing font. Intentional distinction between demo controls and buyer website; native header comparison confirms readable project labels/subtitles.
- Spacing/layout:60px desktop and88px mobile shared header; one active full-height project region. Project2 retains adjacent scenario controls and compact open terminal. Content scrolls within the active interface, while the switch stays available. Project1 panels permit internal scrolling in embedded mode.
- Colors/tokens: dark neutral utility bar, yellow active project underline, existing buyer warm white/yellow/green/black borders unchanged. Focus outline visible. No instrumented contrast certification asserted.
- Assets: no new imagery or generated art; original simulator icons and buyer letter-mark/product fallback retained. No creator records or artwork copied.
- Copy/content: explicit “Mô phỏng cơ chế” versus “Website & backend thật”; existing simulation scope warning retained. Static hosting explains the required backend and links saved evidence; it does not invent grant results or call localhost. Direct core lab is a secondary separate tool.

## Interaction and proof

Manual Huashu Chrome: started Project1 simulated download, switched to Project2, then observed identical Project1 token and performance.timeOrigin with accumulated logs. Created real Project2 session, opened paid order, began grant, switched away/back: same frame timeOrigin, selected download screen and HTTP200/67byte/SHA success remained. Root navigation count1. This proves switching retains mounted interfaces, not persistence across a full page reload.

Focused headless Chromium checks: state snapshot unchanged across switch; arrows/Home/End, skip focus, Back/Forward; /mini/ correctly resolves children and selects Project2;390/375px root and child scrollWidth equal viewport width; terminal open; forced iframe404/retry; static/subpath backend help; pageerror list empty. See `browser-qa.json`. Browser observations are separate from Vitest/HTTP counts. Full screen-reader/WCAG, OS save and cross-browser certification not asserted.

The original Project1 simulator script is byte-identical to the pre-integration source (SHA2564876e28a6cb2538cd2e8c7301002a22d4d4550b391f64114d590729871d6a0f2). Server edits only change HTML serving routes/imports. APIs, schema, auth and grant policies unchanged. Production and report PDFs untouched.

Checklist: shared root/switch; preserved state; responsive nav; direct aliases and subpaths; keyboard/history; truthful unavailable-backend help; recovery; inspected final comparisons completed. Automated clean-source evidence is published with its exact tested revision separately.

final result: passed
