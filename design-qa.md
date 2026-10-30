# Mini website / terminal UI verification

Source visual truth: https://thebuilder.work/ (public header capture in evidence/mini-ui/site-reference.png). Source code reference: The Builder Header, MyPurchases and index.css, read without modifying the marketplace. The source homepage and mini buyer order page intentionally have different content/auth states; only the shared shell is compared visually. Order cards follow the source MyPurchases layout. This is not a pixel-identical homepage clone.

Rendered implementation: http://127.0.0.1:8799/mini. Desktop viewport1280x720; source capture1268x720, mini1265x720 (native scrollbar differences). No density scaling for focused header comparison. Full comparison canvas2560x760 puts both captures together at native scale. Full download/terminal capture1265x1362. Mobile override390x844 produced375CSS-pixel client and scroll widths; override reset.

## Comparison history

- First comparison: evidence/mini-ui/comparison-new.png plus header-comparison-new.png. [P2] Brand size/weight was lighter than the live header. Set desktop wordmark24px/900 and source-style B mark20px; use900 for headings/order titles. Re-captured both views and regenerated combined evidence.
- Final focused comparison: evidence/mini-ui/header-comparison-new.png; final full comparison: evidence/mini-ui/comparison-new.png. Source and mini share Space Grotesk, warm off-white #FDFBF7, yellow #FFD23F, green #0EAD69, black3px borders and hard button shadows. Shell proportions and card spacing follow the source vocabulary. No actionable P0/P1/P2 visual finding remains for the requested mini buyer scope.
- Static reviewer found [P2] old race cells could reappear after session reset. resetObservation now clears both grid and counts. Re-tested a100-request run, created a fresh session, selected race using Enter: hidden=true, cells=0. Follow-up review found no remaining introduced issue.

## Required fidelity surfaces

- Typography: Space Grotesk loaded like the source, with local system fallback; display and action hierarchy checked in desktop/mobile renders. Wordmark weight corrected after comparison.
- Spacing/layout:80px website header, centered buyer content, white bordered stacked cards,80px desktop product fallback, green right-aligned actions. Lab navigation is outside the website; narrow screens wrap order actions and scroll scenario menu within its own container.
- Color/tokens: exact source palette above, neutral lab chrome, separate dark terminal. Request log blue/neutral text and success summary green have readable contrast.
- Assets: source Header/MyPurchases use native B letter marks; the mini follows that actual fallback. No creator artwork or production product records copied, and no generated imagery used.
- Copy/content: synthetic two-order flow and demo account stated explicitly. Menu actions describe preconditions and expected results; no fabricated completion or backend timing. Website links to Marketplace/Features open the actual public website in a separate tab. Those product pages are outside the mini.

## Interaction verification

Browser manual checks: paid67-byte receipt with matching SHA256; same UUID200 retry and unchanged D1 time/key; other UUID403 and unchanged D1; free67-byte receipt/checksum while terminal hidden; open/close terminal via keyboard; all four terminal views; menu changes preserve selected order and do not execute tests;100requests gave1x200/99x403, D1 winner matched; fresh-session stale-result regression fixed; session restored after reload. Mobile menu and document width checked. Final captured error/warning console empty. OS completion of optional save link not asserted.

Syntax/typecheck,29Workers/D1/R2 tests and17real-HTTP checks passed. The HTTP page marker was updated from removed heading copy to the stable terminal-toggle identifier. CI source evidence records exact tested revision separately. Manual observations are not counted as automated DOM tests.

Project1 index.html and backend implementation unchanged. No marketplace deploy or cloud resource provisioning. Previous immutable evidence under docs/evidence/mini-web remains historical; refreshed screenshots and checks are published under docs/evidence/mini-ui-refresh. The report PDF and Week7 report were not revised for this UI-only request.

final result: passed
