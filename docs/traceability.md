# Bản đồ mã nguồn và phạm vi

| Thành phần | Vai trò | Giới hạn |
| --- | --- | --- |
| `src/index.ts` | Handler HTTP cho grant, URL HMAC, request ID/trace, remote gate và fixture cũ | Mô hình demo; không có tài khoản người mua |
| `src/mini.ts` | Trang `/mini.html`, config, phiên mua hàng tổng hợp, đọc đơn, renew và đọc trạng thái token | Capability phiên demo; không đại diện đăng nhập hoặc giao dịch thật |
| `src/fixtures.ts` | Token cố định cho kịch bản lõi và nội dung tệp tổng hợp | Token mini được sinh ngẫu nhiên; không dùng dữ liệu sản phẩm thật |
| `migrations/0001_legacy.sql` | Lược đồ demo tối thiểu trước chính sách dùng một lần | Không phải lược đồ toàn bộ ứng dụng |
| `migrations/0002_single_use.sql` | Thêm trạng thái tiêu thụ, khóa idempotency và phiên bản chính sách | Không chuẩn hóa định dạng thời gian legacy |
| `migrations/0003_mini.sql` | Bảng phiên mini, ánh xạ `orders.session_hash` và dữ liệu cần cho danh sách đơn | Chỉ lưu dữ liệu tổng hợp của demo |
| `tests/` | Kiểm thử handler, mini flow, D1/R2 và trang lab trong Workers runtime | Tách biệt với bộ hồi quy riêng tư của ứng dụng |
| `scripts/network-smoke.mjs` | Ngắt phản hồi qua proxy sau khi D1 đã ghi rồi retry | Loopback có kiểm soát, không phải sự cố cloud thật |
| `scripts/mini-smoke.mjs` | HTTP loopback cho phiên, sở hữu đơn, tải file, renew và cạnh tranh grant | Không gọi deployment hoặc provider thật |
| `scripts/record-evidence.mjs` | Gắn kết quả test, smoke và SHA-256 với commit sạch | Chỉ chứng nhận lần chạy tại commit đó |
| `index.html` | Website demo chung với hai tab Project 1/Project 2; giữ hai giao diện cùng trạng thái, đổi bằng hash hoặc bàn phím | Chỉ tải mỗi giao diện lần đầu; không trộn log mô phỏng với log backend |
| `lab.html` | Sáu mô phỏng Project 1 và Project 2 lab lõi trước đây ở index.html | Script mô phỏng Project 1 giữ nguyên; lab chỉ gửi API tại loopback; bằng chứng nhúng là lần chạy cũ |
| `mini.html` | Giao diện người mua tổng hợp và terminal trace, được mở trong tab Project 2 hoặc trực tiếp `/mini.html` | Dùng API cùng origin; trang tĩnh hiện hướng dẫn backend, không tự gọi localhost |
| `docs/deploy.md`, `wrangler.deploy.example.toml` | Cấu hình remote tùy chọn và hướng dẫn deploy Worker/D1/R2 riêng | Không chứa resource ID hoặc secret thật |
| `docs/evidence/2026-10-30/` | Bằng chứng lịch sử của commit `96b6875` | **18 ca trước mini và remote**; không phải kết quả của mã hiện tại |

## Phạm vi mini

`POST /api/mini/session` tạo capability ngẫu nhiên, lưu hash trong D1, đặt hạn
24 giờ và tạo hai đơn tổng hợp thuộc phiên đó. Một đơn có giá 49.000, một đơn
có giá 0; cả hai dùng trạng thái `paid` để chạy qua cùng grant API. Mỗi đơn có
token tải ngẫu nhiên. `GET /api/mini/orders`, renew và state chỉ trả dữ liệu mà
capability hiện tại sở hữu.

`POST /api/mini/orders/:id/renew` dùng lại token policy 1 còn hạn và chưa tiêu
thụ; nếu token đã dùng hoặc hết hạn, tạo token mới cho đơn `paid` thuộc phiên.
Trang gọi `GET /api/download/:token?idem=<UUIDv4>` và `/api/file` như kịch bản
lõi, nên các điều kiện grant và retry một phút vẫn nằm tại handler hiện hữu.
Mở trang hoặc đọc state không tự tiêu thụ token.

Đây là capability demo dùng chung theo phiên, không phải xác thực tài khoản,
quyền mua hàng thật hay quy trình checkout. Không có thanh toán, ngân hàng,
email hoặc tải nội dung do creator sở hữu.

## Liên hệ với cơ chế lõi

Repo công khai minh họa cấp quyền dùng một lần theo token, retry bằng cùng khóa
trong dưới 60 giây, từ chối khóa khác và kiểm tra file trước khi ghi nhận grant.
`COALESCE` giữ nguyên `used_at` cùng khóa đầu tiên; câu `UPDATE` có điều kiện
trên đúng hàng D1. Response JSON mang request ID và trace từ các bước thật đã
chạy; trạng thái trước/sau giúp phân biệt lần cấp đầu với retry hợp lệ.

Kịch bản `/lab#project2` tập trung vào sáu ca lõi. `/mini` thêm phiên/đơn tổng
hợp, renew theo quyền sở hữu và giao diện tải. Hai vùng chia sẻ grant API và
fixture file, nhưng không được tính là bằng chứng cho ứng dụng riêng tư.

## Khác với ứng dụng gốc

1. Không có tài khoản, checkout hay giao dịch thật. Phiên mini chỉ là bearer
   capability ngẫu nhiên, được lưu dạng hash và hết hạn sau 24 giờ.
2. URL tải luôn trỏ tới một tệp mẫu trong binding R2. Không chuyển hướng tới
   `file_url` bên ngoài.
3. Không có KV rate limit hoặc chính sách IP/device/N.
4. Đồng hồ được truyền vào handler rồi bind vào SQL để kiểm thử mốc 59/60/61
   giây. Không có tham số HTTP để người dùng đặt đồng hồ.
5. Proxy ngắt phản hồi và mini smoke là kiểm thử bổ sung của repo; không hồi tố
   vào các ca hoặc điều kiện thực nghiệm trong báo cáo Project 2.

## Local và remote

Local là cấu hình mặc định. `wrangler.deploy.example.toml` dành cho deployment
riêng và bật `DEMO_REMOTE = "true"`. Remote cần `DEMO_ACCESS_TOKEN` cùng
`DEMO_SIGNING_KEY` riêng, mỗi secret dài ít nhất 32 ký tự; không dùng khóa ký
fixture công khai. Nếu thiếu hoặc sai cấu hình, API trả HTTP 503. `/mini` và
`/api/mini/config` công khai; các API khác cần `X-Demo-Access`. API mini còn
cần `X-Mini-Session` cho đơn thuộc phiên. Endpoint reset và state fixture cũ
chỉ dùng local; reset chỉ thay fixture có ID dưới 1000, không xóa dữ liệu mini.

Link file dùng HMAC-SHA-256 trong demo và hết hạn sau năm phút; đây không phải
AWS SigV4. `X-Demo-Access` là cổng demo dùng chung, không phải đăng nhập. Hãy
dùng D1/R2 riêng cho demo và xem [hướng dẫn triển khai](deploy.md); không dùng
tài nguyên hay dữ liệu của marketplace.

## Bằng chứng lịch sử

`docs/evidence/2026-10-30/` ghi lần chạy sạch của commit
[`96b6875`](https://github.com/ptrgiang/demo-single-use-token-idempotency/tree/96b687505e6f6f1d03a941d0b5d79f65d9eeafb2):
18/18 test, typecheck và proxy smoke. Commit này có trước mini web, migration
`0003_mini.sql` và remote gate. Không cộng các test lab/mini hoặc lần dry-run
hiện tại hồi tố vào kết quả đó; cũng không dùng bằng chứng này để nhận dạng
cây mã riêng tư đã chạy bộ hồi quy 202 ca.

## Đối chiếu lần chạy mới

1. Checkout commit cần xác minh, cài bằng `npm ci` và giữ worktree sạch.
2. Chạy `npm run evidence`; script chạy typecheck, test suite, proxy smoke và
   mini HTTP smoke, rồi ghi `testedCommit`, manifest và SHA-256.
3. Đối chiếu `summary.json.testedCommit` với `git rev-parse HEAD`, số test trong
   `vitest.json`, các kết quả trong `network-smoke.json` và `mini-smoke.json`.
4. Đối chiếu SHA-256 trong manifest với các artifact. CI lưu bộ kết quả theo
   commit để tham khảo.
