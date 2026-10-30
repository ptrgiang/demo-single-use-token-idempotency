# Triển khai demo mini

Worker này bổ sung một luồng người mua tổng hợp để xem đơn hàng, nhận lại liên
kết và tải cùng tệp mẫu trong R2. Không có thanh toán, tài khoản thật hay email.

## Cấu hình

1. Cài đúng phiên bản Wrangler đã ghim trong `package.json` bằng `npm ci`.
2. Sao chép cấu hình mẫu rồi đăng nhập Cloudflare và xác nhận đúng tài khoản:

   ```powershell
   Copy-Item wrangler.deploy.example.toml wrangler.deploy.toml
   node node_modules/wrangler/bin/wrangler.js login
   node node_modules/wrangler/bin/wrangler.js whoami
   ```

3. Khi chuẩn bị triển khai, tạo D1 và R2 riêng cho demo. Các lệnh này tạo tài
   nguyên Cloudflare và chỉ dành cho bước provisioning chủ động:

   ```powershell
   node node_modules/wrangler/bin/wrangler.js d1 create replace-with-demo-database-name
   node node_modules/wrangler/bin/wrangler.js r2 bucket create replace-with-demo-r2-bucket
   ```

   Sao chép `database_id` do lệnh D1 trả về vào `wrangler.deploy.toml`; cập nhật
   tên D1/R2 trong cấu hình và các lệnh dưới đây nếu đã chọn tên khác. Không
   dùng DB hoặc bucket của hệ thống thật.
4. Tạo hai secret riêng, mỗi secret dài ít nhất 32 ký tự:
   - `DEMO_ACCESS_TOKEN`: mật khẩu dùng chung để mở API demo.
   - `DEMO_SIGNING_KEY`: khóa riêng để ký URL tệp HMAC.

   Không dùng giá trị fixture `public-demo-fixture-key-not-for-real-files` làm
   khóa ký từ xa. Cấu hình đặt `DEMO_REMOTE = "true"`; khi thiếu hoặc sai secret,
   mọi API đóng với HTTP 503. `/mini` và `/api/mini/config` vẫn công khai.

## Kiểm tra local ở chế độ remote

Đặt hai secret trong `.dev.vars` cục bộ, không commit tệp này, rồi áp dụng
migration và chạy Worker bằng executable Wrangler đã cài từ package lock:

```powershell
node node_modules/wrangler/bin/wrangler.js --version
node node_modules/wrangler/bin/wrangler.js d1 migrations apply replace-with-demo-database-name --local --config wrangler.deploy.toml
node node_modules/wrangler/bin/wrangler.js dev --local --ip 127.0.0.1 --port 8799 --config wrangler.deploy.toml
```

Mở `http://127.0.0.1:8799/mini`. Khi tạo phiên, giao diện gửi
`X-Demo-Access`; Worker lưu hash của `X-Mini-Session` và giữ phiên trong 24 giờ.
Mỗi phiên tự tạo một đơn giá 49.000 và một đơn miễn phí; cả hai liên kết tải
đều trỏ tới tệp tổng hợp trong R2. Gọi `POST /api/mini/session` cũng ghi tệp
mẫu vào bucket, vì vậy không cần seed bằng dữ liệu sản phẩm thật.

Để kiểm tra bundle và bindings trước khi deploy, dùng dry-run cục bộ sau khi đã
điền cấu hình; lệnh này không tạo hoặc cập nhật tài nguyên Cloudflare:

```powershell
node node_modules/wrangler/bin/wrangler.js deploy --dry-run --config wrangler.deploy.toml
```

## Triển khai Cloudflare

Sau khi tạo riêng D1 và R2, cấu hình secret qua Wrangler. Các lệnh dưới đây là
hướng dẫn triển khai, không được chạy như một phần của kiểm tra local:

```powershell
node node_modules/wrangler/bin/wrangler.js secret put DEMO_ACCESS_TOKEN --config wrangler.deploy.toml
node node_modules/wrangler/bin/wrangler.js secret put DEMO_SIGNING_KEY --config wrangler.deploy.toml
node node_modules/wrangler/bin/wrangler.js d1 migrations apply replace-with-demo-database-name --remote --config wrangler.deploy.toml
node node_modules/wrangler/bin/wrangler.js deploy --config wrangler.deploy.toml
```

Sau khi triển khai, mở `/mini`, kiểm tra `/api/mini/config`, rồi tạo phiên đầu
tiên bằng POST `/api/mini/session` với `X-Demo-Access`. Endpoint này tạo dữ liệu
đơn hàng tổng hợp và ghi fixture vào R2; không chạy `POST /api/demo/reset` trên
môi trường từ xa. Reset và state API cũ chỉ dùng local.

## Ranh giới truy cập

`X-Demo-Access` là một cổng demo dùng chung, không phải đăng nhập hay phân quyền
tài khoản. Mỗi người mua tổng hợp còn cần bearer `X-Mini-Session` để đọc đơn,
renew đơn trả phí hoặc xem trạng thái token của chính phiên đó. Mọi API từ xa,
kể cả `/api/file`, cần `X-Demo-Access`. URL tệp dùng HMAC-SHA-256 trong demo và
hết hạn sau năm phút; cơ chế này không phải AWS SigV4.

## Dữ liệu và thời gian sử dụng

Phiên hết quyền sau 24 giờ nhưng các hàng phiên, đơn và token chưa được tự
động xóa khỏi D1. Mỗi lần tạo phiên thêm dữ liệu tổng hợp; demo chưa có tác vụ
dọn định kỳ hoặc giới hạn dung lượng. Khi tự triển khai, dùng tài nguyên demo
riêng và theo dõi dung lượng. Trước khi mở dài hạn cho nhiều người dùng, cần
bổ sung chính sách lưu giữ và dọn dữ liệu đã hết hạn. Xóa tài nguyên demo khi
không còn sử dụng phải do chủ tài khoản chủ động thực hiện.
