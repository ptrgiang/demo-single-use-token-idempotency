# Demo UI verification

The current Project 2 entry is `/mini`: a buyer web flow above a backend inspector. The original Project 1 simulator and the six core Project 2 scenarios remain at `/lab`. This review concerns the standalone demo only.

## Mini web

- Visual reference: the existing The Builder purchase history and download page, with yellow navigation, strong black borders, white cards and a green download action. The mini uses HTML/JavaScript rather than copying the private React application.
- The buyer opens two synthetic paid orders (49,000 VND and zero price), opens the download card without consuming its token, then explicitly requests a grant. The inspector sits below the application and separates server trace entries from browser observations.
- Manual browser checks verified session restoration after reload, paid/free file receipt (67 bytes and matching SHA-256), same-key retry without changing the first use time, other-key denial, a new unused token after renewal, and 100 competing UUIDs with one success and 99 denials. The D1 key matched the winner.
- At a 390 × 844 viewport override, content width and scroll width both measured 375 CSS pixels (the scrollbar accounts for the difference). The inspector columns stack; controls and text remain readable. The override was reset after the check.
- The final browser error/warning log was empty. Screenshots and a manual observation record are published separately in `docs/evidence/mini-web/`; they are not automated DOM-test results.
- OS-level completion of the optional save link was not established. Byte receipt and checksum were verified before offering that link.

## Core lab and Project 1

The previous lab review covered explicit manual checkpoints, observed HTTP/D1 state, the live 100-response grid, cancellation, keyboard navigation and narrow-screen layout. Static hosting presents saved evidence and setup instructions. It does not call localhost or the marketplace API. A Web Lock serializes core fixture runs on the canonical `127.0.0.1` origin; direct API reset during a run is unsupported.

The original Project 1 inline simulator is preserved. Its six scenarios are historical simulations rather than a backend implementation. Mini sessions and orders use separate random identifiers, and the core reset only affects historical fixture IDs below 1000.

## Verification boundaries

`npm run evidence` records the tested source commit, Workers/D1/R2 tests, network-response-loss smoke, mini HTTP smoke and source hashes. Browser observations are a separate manual record. Provider deployment and marketplace behavior are outside these local results; self-deployment instructions are in `docs/deploy.md`.
