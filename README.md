# Single-use token and idempotency demo

Ví dụ độc lập để tái lập cơ chế **tiêu thụ token nguyên tử**, **thử lại bằng cùng khóa trong dưới 60 giây**, và **từ chối khóa khác**. Phần thực thi dùng Hono, Cloudflare Workers runtime, D1 và R2 giả lập cục bộ; không cần tài khoản Cloudflare hoặc thông tin xác thực dịch vụ.

Đây là mã minh họa thu gọn phục vụ Project 2, tách từ nguyên lý cấp quyền tải của một ứng dụng riêng tư. Repo không chứa toàn bộ ứng dụng, lịch sử Git, dữ liệu khách hàng hoặc bộ hồi quy riêng tư. **Kết quả kiểm thử của demo này độc lập với con số 202/202 trong báo cáo Project 2.**

## Hai cách xem

- `index.html`: trang mô phỏng trực quan có sẵn. Mở tệp bằng trình duyệt; hiệu ứng và nhật ký được tạo bằng JavaScript, không phải kết quả Worker/D1. Một số kịch bản lịch sử, như prefetch tiêu thụ token, khác API thực thi hiện tại.
- `src/index.ts` cùng `tests/`: mã chạy thật trên runtime cục bộ, truy vấn D1 và nhận byte từ R2. Dùng phần này để kiểm chứng thuật toán và trích dẫn mã.

## Chạy lại từ checkout mới

Cần **Node.js 24** và npm. Không cần `.env`, `.dev.vars`, API token, ngân hàng hoặc email. Dùng đúng `package-lock.json` đã lưu:

```sh
git clone https://github.com/ptrgiang/demo-single-use-token-idempotency.git
cd demo-single-use-token-idempotency
npm ci
npm run check
npm test
npm run test:network
```

`npm test` chạy trong Workers runtime với D1/R2 cục bộ. `test:network` tự tạo trạng thái tạm, áp dụng hai migration, khởi động Wrangler trên `127.0.0.1:18799`, chạy thử nghiệm HTTP rồi dừng dịch vụ và xóa trạng thái tạm. Cổng 18799 cần đang trống. Lệnh này không dùng trạng thái của phiên demo tương tác.

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

Gửi lại yêu cầu cuối với cùng khóa trước 60 giây: nhận URL. Đổi khóa thành một UUIDv4 khác: HTTP 403. URL trong trường `downloadUrl` trả tệp tổng hợp `sample-notes.txt`. Mặc định, khi không yêu cầu JSON, API trả HTTP 302. Lệnh reset xóa **các bảng demo cục bộ** và khởi tạo lại dữ liệu mẫu.

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

- Các bảng chỉ gồm sản phẩm, trạng thái đơn hàng mẫu và lượt cấp quyền. Không có tài khoản, xác thực người mua, thanh toán, cấp lại token, email, KV rate limit hoặc chính sách IP/device/N.
- GET hiện thay đổi trạng thái; tách bước đổi token sang POST là hướng thiết kế tiếp theo, chưa được thực hiện ở đây.
- URL HMAC dùng **khóa fixture công khai** và chỉ trả tệp mẫu. Đây không phải AWS SigV4 và không kiểm chứng ACL/bucket Cloudflare thật.
- Token và khóa có thể được chuyển tiếp; URL đã cấp còn dùng được đến khi hết hạn dù trạng thái đơn sau đó thay đổi. Không ngăn sao chép tệp hoặc chứng minh nhận tệp đúng một lần.
- Endpoint reset và đọc trạng thái cố ý mở để quan sát demo. Ràng buộc hostname loopback chỉ tránh truy cập nhầm, **không phải xác thực**. Không dùng repo này để phân phối dữ liệu thật hoặc deploy nguyên trạng.
- Không có tài nguyên cloud thật trong cấu hình; database ID là giá trị giả. Không có lệnh hay workflow triển khai.

## Trích dẫn

Tác giả: **Phạm Trường Giang**. Tên: *Demo single-use token và idempotency*. URL: <https://github.com/ptrgiang/demo-single-use-token-idempotency>.

Khi trích dẫn, dùng permalink `https://github.com/ptrgiang/demo-single-use-token-idempotency/tree/<full-commit-sha>` thay cho nhánh có thể thay đổi. Ghi rõ đây là demo độc lập, commit đã kiểm thử và thời điểm thu bằng chứng; không dùng kết quả demo để thay thế bộ hồi quy ứng dụng riêng tư.

Xem [bản đồ mã nguồn và kiểm chứng](docs/traceability.md) để đối chiếu phạm vi.
