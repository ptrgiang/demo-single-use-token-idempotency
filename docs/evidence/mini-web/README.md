# Mini web verification

Tested source: [`90e5528`](https://github.com/ptrgiang/demo-single-use-token-idempotency/tree/90e55282efe4876211c1369526140b728fb90f53).

CI: [run 41005384537](https://github.com/ptrgiang/demo-single-use-token-idempotency/actions/runs/41005384537), successful on Ubuntu with Node 24. These five JSON artifacts are copied byte-for-byte from its downloadable evidence artifact; summary.json hashes the raw results and source manifest. The commit publishing this directory is not the tested source commit.

- 29 Vitest cases (18 core, 3 lab route, 8 mini backend).
- 17 real-loopback mini HTTP checks, including paid/free fixture bytes, renewal and one winner among 100 keys.
- Controlled proxy response loss after D1 commit, same-key recovery, different-key denial and matching bytes.

Browser observations and screenshots are a separate manual local check, recorded in browser-checks.json. They are not a browser automation CI suite. Screenshots contain synthetic identifiers only, with no shared remote access secret or session capability. Cloudflare deploy was checked with dry-run only; no provider resources were created.

Reproduce: checkout the tested source, run npm ci, then npm run evidence. Open /mini using npm run db:migrate and npm run dev. See ../../deploy.md for optional self-deployment.
