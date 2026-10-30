# Mini website: scroll remediation QA

Scope: buyer order → download → scenario menu → backend terminal. Existing The Builder visual language retained; layout intentionally changed to support simultaneous action and observation. See [audit](docs/ux-scroll-audit.md).

## Visual truth and captures

Current-run source screenshots: `docs/evidence/mini-scroll-audit/images/01-start.png` through `05-terminal.png`. Rendered implementation: http://127.0.0.1:8799/mini, final desktop `11-final-desktop.png`, mobile `09-mobile-fixed.png`, race `08-race-fixed.png` in the same directory.

Desktop CSS viewport 1280×720. Old capture pixels 1265×712 (native scrollbar/capture boundary); final 1280×720. Both are native screenshot pixels; comparison uses no stretching, no density scaling, and pads the old image. This is a layout before/after comparison, not a pixel-identical design target. Old download is ready; final download has received bytes and shows success. Scenario selection also differs. These differences are not fidelity defects.

Full-view comparison: `images/comparison.png` (2560×764). Focused card comparison: `images/focused-comparison.png` (1400×510), native crops with gray padding; the entire card and CTA remain visible. Both were opened together and inspected. Mobile CSS viewport/capture 390×844; further 375×844 width check had clientWidth=scrollWidth=375. Short-height check 900×500 enabled document scrolling.

## Findings and comparison history

1. [P1, resolved] Before: expanded download + terminal document height 1362 px; at scrollY642 the download CTA was above the viewport. After: bounded flex workspace, compact card, terminal reserves its own bottom space. Final document height720 at viewport720; download CTA, scenario action and terminal simultaneously visible. Full comparison above verifies this intentional composition change.
2. [P2, resolved] Scenario menu and execution button were separated by the website. Instructions/action now sit directly under desktop menu or next to mobile select, including unmet prerequisites. Verified menu selection preserves the current order and does not run tests.
3. [P2, resolved] Intermediate compact terminal tabs had a stray vertical scrollbar; constrained overflow-y and re-captured `07-download-fixed.png`. Status after a successful grant was too generic; final summary reports HTTP200,67bytes and checksum match. Ordinary traces follow actual new lines only when already near the bottom. Final desktop/mobile captures verify the revised presentation.
4. [P3, accepted] Race traces do not auto-follow while the result grid is shown. This deliberately keeps1/99 counts and all100 cells visible; users can scroll down to the actual trace. Static reviewer suggested removing that condition, but that would push the result grid out of the compact pane. No backend event is discarded.

## Required fidelity surfaces

- Typography: Space Grotesk and fallback retained; brand/headings retain strong source weights. Download title/CTA readable in focused native-pixel comparison. Mobile heading wraps without horizontal overflow. Terminal uses monospace and wraps long details.
- Spacing/layout: compact64px desktop header, two-column download card,220px scenario rail, bottom terminal in flex flow. No overlay on buyer controls. Mobile uses stacked content and native select. Long content scrolls internally; <=560px height uses document scrolling for access at short heights/zoom.
- Colors/tokens: source warm white, yellow, green, black3px borders and hard shadows retained. Dark terminal remains distinct; success feedback is visible next to the action. This was a visual review, not an instrumented contrast certification.
- Image quality/assets: no new image asset, SVG substitute or generated art. Existing native letter marks and synthetic product fallback retained. No creator artwork or records copied.
- Copy/content: duplicate announcement/footer removed from demo flow. Demo account/lab identity remains. Preconditions explain disabled actions. HTTP/byte/checksum summaries originate from completed actual requests; no simulated backend logs or timings added.

## Verification and limits

Browser manual checks: paid67byte download/checksum; same-key retry200; different-key403; renewal and new download;100UUID race1x200/99x403 with D1 winner; desktop/mobile menu selection preserves order; terminal toggle Enter and aria-expanded false/true; D1/R2, JSON/requestId and setup views; focusable terminal region and End scroll to2808px in2958px content;390px and375px mobile widths;900×500 fallback; final console error/warning list empty. OS save completion not asserted. No screen-reader/full WCAG or cross-browser certification.

Automated evidence is recorded separately with exact tested source SHA after a clean source commit. Manual observations do not increase automated counts. Backend, Project1 index.html, marketplace production and report PDFs unchanged.

Implementation checklist: compact layout, adjacent scenario controls, open compact terminal, mobile select, keyboard scroll, real-state summaries and before/after comparison completed. No actionable P0/P1/P2 remains in this scoped review.

final result: passed
