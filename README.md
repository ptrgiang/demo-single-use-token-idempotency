# The Builder Mini · single-use token & idempotency

Ví dụ độc lập để tái lập cơ chế **tiêu thụ token nguyên tử**, **thử lại bằng cùng khóa trong dưới 60 giây**, và **từ chối khóa khác**. Mặc định, Hono chạy trên Workers runtime với D1/R2 cục bộ; không cần tài khoản Cloudflare hoặc thông tin xác thực dịch vụ. Có thể chủ động cấu hình một deployment remote riêng theo hướng dẫn bên dưới.

Đây là mã minh họa thu gọn phục vụ Project 2, tách từ nguyên lý cấp quyền tải của một ứng dụng riêng tư. Repo không chứa toàn bộ ứng dụng, lịch sử Git, dữ liệu khách hàng hoặc bộ hồi quy riêng tư. **Kết quả kiểm thử của demo này độc lập với con số 202/202 trong báo cáo Project 2.**

## Chạy mini web

Cần Node.js **24**, Git và npm. Không cần tài khoản Cloudflare cho local.

```sh
git clone https://github.com/ptrgiang/demo-single-use-token-idempotency.git
cd demo-single-use-token-idempotency
npm ci
npm run db:migrate
npm run dev
```

Mở **http://127.0.0.1:8799/**. Website mặc định mở **Project 1 · Mô phỏng cơ chế**; chuyển sang **Project 2 · Website & backend thật** ngay trên thanh chung phía trên. Hai project giữ trạng thái khi đổi tab: kịch bản, log mô phỏng, đơn/token đang xem, kết quả tải và terminal. Chỉ tải giao diện mỗi project ở lần mở đầu; đổi tab không tải lại trang. Có thể dùng phím mũi tên, Home/End hoặc gửi link `/#project1` / `/#project2`.

Trong Project 2, chọn **Bắt đầu phiên demo**, rồi tải một trong hai đơn mẫu. Website giữ header, font, màu và thẻ đơn hàng theo The Builder. Menu kịch bản nằm bên trái; điện thoại dùng danh sách chọn. Terminal mặc định mở gọn ở đáy, có thể mở/ẩn bằng **Hiện terminal / Ẩn terminal**. URL cũ `/mini` mở cùng website, chọn sẵn Project 2.

Khi chỉ host các file tĩnh (chẳng hạn GitHub Pages), Project 1 vẫn mô phỏng trực tiếp; Project 2 hiện hướng dẫn chạy backend và liên kết bằng chứng đã lưu. Để thao tác tải/renew/kiểm thử thật trong cùng website, chạy Worker local như trên hoặc tự triển khai theo hướng dẫn. Trang tĩnh không gọi localhost hay API production.

- **Đơn hàng của tôi:** phiên riêng có đơn trả phí 49.000 đồng và đơn miễn phí; đều dùng trạng thái paid tổng hợp.
- **Trang tải:** chỉ bấm nút mới cấp quyền. UUID gắn với token được giữ trong sessionStorage để retry dưới 60 giây. Tệp nhận bằng fetch để kiểm tra checksum trước khi người dùng chọn lưu.
- **Menu kịch bản:** mua hàng và tải tệp, thử lại cùng khóa, chặn khóa khác, cấp lại liên kết, 100 yêu cầu đồng thời. Đổi menu giữ nguyên đơn và token đang chọn, không tự gửi yêu cầu kiểm thử. Hướng dẫn, điều kiện và nút chạy nằm cạnh menu; retry/khóa khác chỉ bật sau khi token đã sử dụng.
- **Terminal phía dưới:** các mục Request log, D1 / R2, JSON và hướng dẫn chạy. Trace trả từ handler có request ID; các phép đọc D1 và checksum do client ghi rõ nguồn. Ẩn terminal chỉ thu gọn giao diện, không dừng hay giả lập backend.
- **Bố cục:** website và terminal chia sẻ chiều cao màn hình, mỗi vùng có thể cuộn riêng khi nội dung dài. Trên màn hình cao tối đa 560 px, trang cho phép cuộn tự nhiên để các nút vẫn truy cập được. [Audit và bằng chứng trước/sau](docs/ux-scroll-audit.md).
- **Cấp lại:** phiên sở hữu đơn được dùng token còn chưa tiêu thụ hoặc nhận token mới; phiên khác không đọc/renew đơn đó.

Mỗi phiên demo là capability ngẫu nhiên, lưu dạng hash và hết hạn sau 24 giờ; đây không phải tài khoản người mua. Không có giao dịch mua thật, ngân hàng hoặc email. Local và remote dùng cùng handler/SQL; public repo là bản thu gọn độc lập, không chứa toàn bộ sản phẩm riêng tư. Mã được cấp phép [MIT](LICENSE).

## Tự triển khai

[Hướng dẫn Cloudflare Worker + D1 + R2](docs/deploy.md) gồm cấu hình mẫu, đăng nhập, tạo tài nguyên riêng, migration, secret, kiểm tra local chế độ remote, dry-run và deploy. Remote mặc định **tắt**; cần chủ động bật `DEMO_REMOTE` và đặt `DEMO_ACCESS_TOKEN` cùng `DEMO_SIGNING_KEY` riêng, mỗi giá trị dài ít nhất 32 ký tự. Không dùng khóa ký fixture công khai ở môi trường remote. Mọi API remote, trừ cấu hình công khai, yêu cầu `X-Demo-Access`; các thao tác đơn còn kiểm tra capability của phiên. Mã truy cập chỉ giữ trong bộ nhớ trang.

Repo không tự deploy khi push. Cấu hình tự triển khai không dùng tài nguyên The Builder. Tài liệu và dry-run không phải bằng chứng một bản cloud đã được phát hành.

## Chạy kiểm thử như bản công bố

```sh
npm run check          # TypeScript + cú pháp các script giao diện
npm test               # Workers runtime/D1/R2, core + lab + mini
npm run test:network   # Mất phản hồi sau khi D1 đã ghi, rồi retry
npm run test:mini      # HTTP thật: phiên, sở hữu, tải paid/free, renew, 100 UUID cạnh tranh
```

Hai script HTTP tự khởi động Worker với trạng thái tạm ở cổng 18799/18800, dừng và dọn dữ liệu khi xong; không dùng phiên đang mở ở cổng 8799. Chúng kiểm tra byte thực và checksum, không chỉ HTTP 200. Các mốc 59/60/61 giây dùng đồng hồ kiểm soát trong test, không chờ thời gian thật.

Để đối chiếu đúng phiên bản: checkout commit được dẫn, giữ cây mã sạch, chạy `npm ci` và `npm run evidence`. Lệnh này chạy các kiểm tra trên, ghi `testedCommit`, manifest SHA-256 và artifact vào `evidence/`. CI chạy cùng lệnh và lưu artifact theo SHA. Các dữ liệu đã công bố nằm trong [`docs/evidence/`](docs/evidence/); đọc `testedCommit` trong mỗi bundle, không đồng nhất commit chứa artifact với commit đã kiểm thử. Hướng dẫn thao tác trình duyệt: [docs/browser-checks.md](docs/browser-checks.md).

## Các vùng demo

- `/`: website demo chung; `#project1` là mặc định, `#project2` mở web người mua và terminal. `/mini` và `/mini/` là link tương thích mở Project 2 trong cùng khung.
- `/mini.html`: giao diện Project 2 độc lập; `/lab.html` là giao diện mô phỏng/lab độc lập. Khung chung giữ cả hai giao diện khi chuyển tab, ẩn thanh điều hướng lặp bên trong.
- `/lab#project1`: giữ nguyên sáu mô phỏng lịch sử Project 1; không phải backend thật, một số hành vi như prefetch khác chính sách mới.
- `/lab#project2`: bộ sáu kịch bản lõi, chạy thật trên local hoặc đọc bằng chứng 18 ca đã lưu. Chế độ trang tĩnh không gọi localhost hay API sản phẩm.

## Giao diện kiểm thử Project 2

Sau `npm ci`, chạy `npm run db:migrate` và `npm run dev`, rồi mở **http://127.0.0.1:8799/lab** (hoặc **Kiểm thử cốt lõi** trên thanh demo chung). Worker phục vụ `lab.html`, vì vậy mọi yêu cầu thử nghiệm cùng origin với API local. Chọn Project 2, một trong sáu kịch bản và **Chạy kịch bản đã chọn**.

Mặc định **Thực hiện từng bước** được bật: trang khởi tạo dữ liệu mẫu, đọc D1 rồi chờ bạn gửi yêu cầu cấp quyền, retry, đổi khóa hoặc nhận tệp. Diễn biến chỉ ghi nhận hành động/phản hồi đã xảy ra. Có thể dừng ở bước chờ hoặc bỏ chọn để chạy tự động. Retry dùng đồng hồ thật; hãy thực hiện trước khi cửa sổ dưới 60 giây đóng. Các mốc chính xác 59/60/61 giây vẫn thuộc bộ kiểm thử với đồng hồ kiểm soát.

Danh sách bên trái ghi kết quả kỳ vọng; bên phải ghi phản hồi thực tế, kiểm tra đạt/chưa đạt, D1 trước/sau và JSON. Phép thử 100 UUID cập nhật từng ô khi có phản hồi thật. Phép thử tệp nhận byte rồi so SHA-256 với fixture độc lập. Các trường hợp hết hạn/chưa thanh toán/thiếu tệp nằm trong phần bổ sung. Phép thử proxy ngắt phản hồi chạy bằng `npm run test:network`.

Mỗi lần chạy đặt lại fixture lịch sử có mã nhỏ hơn 1000 của demo local (không xóa phiên, đơn hoặc token của mini). Giao diện chỉ bật chạy thật tại `127.0.0.1` để các tab dùng chung origin và Web Lock; các hostname khác chỉ xem kết quả đã lưu. Không chạy thêm API reset thủ công trong lúc kiểm thử. Cần trình duyệt hiện hành có Web Crypto và Web Locks. Bộ bằng chứng nhúng là lần chạy 18 ca ở commit cũ; các ca lab và mini hiện tại không được cộng hồi tố vào dữ liệu đó.

Vùng `/lab` trình bày cơ chế lõi. Vùng `/mini` bổ sung phiên đơn mẫu, cấp lại link theo quyền phiên, UUID theo token và giao diện người mua. Tài khoản JWT, thanh toán thật và giao diện ứng dụng đầy đủ thuộc bản triển khai riêng. Xem [bản đồ phạm vi](docs/traceability.md) và [kiểm tra giao diện](design-qa.md).

## Chạy lại từ checkout mới

Cần **Node.js 24** và npm. Không cần `.env`, `.dev.vars`, API token, ngân hàng hoặc email. Dùng đúng `package-lock.json` đã lưu:

```sh
git clone https://github.com/ptrgiang/demo-single-use-token-idempotency.git
cd demo-single-use-token-idempotency
npm ci
npm run check
npm test
npm run test:network
npm run test:mini
```

`npm test` chạy trong Workers runtime với D1/R2 cục bộ. Hai lệnh HTTP smoke tự tạo trạng thái tạm và áp dụng các migration của repo; `test:network` dùng cổng `127.0.0.1:18799`, còn `test:mini` dùng `127.0.0.1:18800`. Mỗi lệnh dừng Worker và dọn trạng thái tạm khi xong; cần để trống cả hai cổng. Chúng không dùng trạng thái của phiên demo tương tác.

Để tạo bộ bằng chứng gắn với **commit sạch** đang checkout:

```sh
npm run evidence
```

Lệnh kiểm tra kiểu, chạy lại cả hai nhóm kiểm thử và ghi `evidence/vitest.json`, `network-smoke.json`, `source-manifest.json`, `summary.json`. Thư mục `evidence/` được Git bỏ qua để không làm bẩn mã đã kiểm thử. `summary.json` ghi commit, môi trường, số ca và SHA-256 của các tệp kết quả. Kiểm tra GitHub Actions của đúng commit để xem lần chạy độc lập; workflow lưu bộ bằng chứng thành artifact theo SHA.

## Thử API bằng tay

Ở terminal thứ nhất:

```sh
npm run db:migrate
npm run dev
```

Ở terminal khác, dùng `curl` (trên Windows PowerShell dùng `curl.exe`):

```sh
curl -X POST http://127.0.0.1:8799/api/demo/reset
curl http://127.0.0.1:8799/api/demo/state/a10b20c30d40e50f60718293a4b5c6d7
curl -H "Accept: application/json" "http://127.0.0.1:8799/api/download/a10b20c30d40e50f60718293a4b5c6d7?idem=11111111-1111-4111-8111-111111111111"
```

Gửi lại yêu cầu cuối với cùng khóa trước 60 giây: nhận URL. Đổi khóa thành một UUIDv4 khác: HTTP 403. URL trong trường `downloadUrl` trả tệp tổng hợp `sample-notes.txt`. Mặc định, khi không yêu cầu JSON, API trả HTTP 302. Lệnh reset chỉ xóa và khởi tạo lại fixture lịch sử có mã nhỏ hơn 1000; các phiên, đơn và token mini được giữ nguyên.

## Thuật toán

```text
Kiểm tra token, trạng thái paid, thời hạn và tệp
             |
             v
UPDATE có điều kiện trên cùng một hàng D1
  lần đầu: used_at = thời điểm hiện tại, idempotency_key = khóa
  thử lại: cùng khóa và used_at > hiện tại - 60 giây
             |
             v
200 JSON hoặc 302 -> URL tệp HMAC -> GET byte từ R2 cục bộ
```

- Một token chỉ ghi nhận một khóa đầu tiên; thử lại không đặt lại `used_at`.
- 100 yêu cầu có khóa khác nhau cạnh tranh trên **một token**: kiểm thử kỳ vọng một lượt cấp quyền thắng, 99 bị từ chối. Đây không phải benchmark tải của Cloudflare.
- Token chính sách 0 giữ hành vi mang quyền lặp lại đến hết hạn. Migration không tự sửa định dạng thời gian legacy.
- `HEAD` và GET có `Purpose`/`Sec-Purpose: prefetch` không tiêu thụ token. Một GET bình thường có đầy đủ token/khóa vẫn thay đổi trạng thái.
- Thời gian UTC được chuẩn hóa đến giây. Demo truyền đồng hồ qua `createApp({now})` để kiểm thử chính xác 59/60/61 giây trong handler và D1; đây là khác biệt với ứng dụng gốc dùng `datetime('now')` trong DB.
- Do bỏ phần giây lẻ, cửa sổ có thể đóng sớm hơn 60 giây theo đồng hồ thực một khoảng nhỏ hơn một giây. Các mốc 59/60/61 trong kiểm thử bắt đầu ở giây nguyên; không cam kết đủ 60 000 ms trong mọi lần gọi.

## Thử nghiệm mất phản hồi

`scripts/network-smoke.mjs` đặt một HTTP proxy trên loopback giữa client và Worker. Proxy nhận xong phản hồi cấp quyền, đọc lại hàng D1 để xác nhận đã ghi khóa, rồi đóng kết nối xuống client **trước khi gửi phản hồi**. Client gặp lỗi mạng; gửi lại cùng khóa trực tiếp tới Worker vẫn nhận tệp đúng byte và không đổi `used_at`. Khóa khác bị từ chối.

Đây là ngắt kết nối có kiểm soát ở proxy cục bộ. Không suy rộng kết quả sang mọi dạng timeout, lỗi đa vùng hoặc việc tiếp tục một tệp đang tải dở.

## Phạm vi và giới hạn

- Các bảng demo gồm sản phẩm, đơn mẫu, lượt cấp quyền và capability phiên mini lưu dạng hash. Không có tài khoản người mua, xác thực tài khoản, thanh toán, email, KV rate limit hoặc chính sách IP/device/N.
- Endpoint lõi `GET /api/download/:token` ghi trạng thái tiêu thụ. Luồng mini có `POST /api/mini/orders/:id/renew` để đơn thuộc phiên dùng lại token chưa tiêu thụ hoặc nhận token mới.
- Local dùng **khóa fixture công khai** cho URL HMAC; remote yêu cầu khóa riêng cấu hình bởi người triển khai. URL chỉ trỏ tới tệp mẫu. HMAC không phải AWS SigV4 và demo không xác nhận ACL của bucket Cloudflare.
- Token và khóa có thể được chuyển tiếp; URL đã cấp còn dùng được đến khi hết hạn dù trạng thái đơn sau đó thay đổi. Không ngăn sao chép tệp hoặc chứng minh nhận tệp đúng một lần.
- Trong local, endpoint reset và đọc trạng thái fixture cũ mở để quan sát và chỉ nhận loopback; giới hạn này **không phải xác thực**. Ở remote, mọi API trừ config công khai cần `X-Demo-Access`; endpoint reset/state cũ bị tắt. Capability `X-Mini-Session` giới hạn đọc/renew đơn mini, nhưng không phải đăng nhập người mua.
- Cấu hình local mặc định không có tài nguyên cloud thật; database ID là giá trị giả. Mẫu tự triển khai riêng nằm trong `wrangler.deploy.example.toml`, bật remote có chủ đích; không có workflow tự deploy.

## Trích dẫn

Tác giả: **Phạm Trường Giang**. Tên: *Demo single-use token và idempotency*. URL: <https://github.com/ptrgiang/demo-single-use-token-idempotency>.

Khi trích dẫn, dùng permalink `https://github.com/ptrgiang/demo-single-use-token-idempotency/tree/<full-commit-sha>` thay cho nhánh có thể thay đổi. Ghi rõ đây là demo độc lập, commit đã kiểm thử và thời điểm thu bằng chứng; không dùng kết quả demo để thay thế bộ hồi quy ứng dụng riêng tư.

Xem [bản đồ mã nguồn và kiểm chứng](docs/traceability.md) để đối chiếu phạm vi.

## Lần xác minh được lưu

Ngày 30/10/2026, commit [`96b6875`](https://github.com/ptrgiang/demo-single-use-token-idempotency/tree/96b687505e6f6f1d03a941d0b5d79f65d9eeafb2), trước luồng mini và cấu hình remote, được chạy trên trạng thái sạch: kiểm tra kiểu đạt, **18/18 ca** đạt và thử nghiệm mất phản hồi qua proxy đạt. [Bộ bằng chứng](docs/evidence/README.md) lưu kết quả gốc cùng trạng thái D1 trước/sau và SHA-256. Đây là lần chạy demo độc lập, không phải kết quả kiểm thử của các thay đổi mini hiện tại.

## Kết quả mini web công khai

Commit [`90e5528`](https://github.com/ptrgiang/demo-single-use-token-idempotency/tree/90e55282efe4876211c1369526140b728fb90f53) có **29/29 ca**, **17 kiểm tra HTTP mini**, và phép thử mất phản hồi qua proxy đạt trên [GitHub Actions](https://github.com/ptrgiang/demo-single-use-token-idempotency/actions/runs/41005384537). [Bộ bằng chứng mini web](docs/evidence/mini-web/) lưu artifact CI nguyên gốc cùng quan sát trình duyệt riêng. Các con số này thay thế số 18 ca lịch sử khi đánh giá bản mini; chúng không đại diện bộ hồi quy ứng dụng riêng tư.
