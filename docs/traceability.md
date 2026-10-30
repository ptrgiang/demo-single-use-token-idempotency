# Bản đồ mã nguồn và kiểm chứng

## Thành phần

| Thành phần | Vai trò | Giới hạn |
| --- | --- | --- |
| `src/index.ts` | Handler HTTP, điều kiện D1 nguyên tử, URL HMAC và endpoint quan sát/reset | Mô hình demo, không có xác thực người mua |
| `src/fixtures.ts` | Token cố định và nội dung tệp tổng hợp | Không dùng dữ liệu sản phẩm thật |
| `migrations/0001_legacy.sql` | Lược đồ tối thiểu trước chính sách dùng một lần | Không phải lược đồ toàn bộ ứng dụng |
| `migrations/0002_single_use.sql` | Thêm trạng thái tiêu thụ, khóa và phiên bản chính sách | Không chuẩn hóa thời gian cũ |
| `tests/` | Kiểm thử handler với D1/R2 trong Workers runtime | Không phải bộ 202 ca của ứng dụng |
| `scripts/network-smoke.mjs` | Ngắt phản hồi bằng proxy sau khi D1 đã ghi rồi thử lại | Loopback có kiểm soát, không phải sự cố cloud thật |
| `scripts/record-evidence.mjs` | Gắn kết quả và SHA-256 với commit sạch | Kiểm tra byte và lần chạy cụ thể, không chứng nhận môi trường khác |
| `index.html` | Mô phỏng trực quan có sẵn | Nhật ký mô phỏng không phải bằng chứng API |

## Liên hệ với Project 2

Repo công khai minh họa phần cốt lõi: dùng một lần theo token, thử lại cùng khóa dưới 60 giây, tính nguyên tử trên một hàng, tương thích chính sách cũ và kiểm tra tệp trước khi tiêu thụ. Khóa đầu tiên được giữ bằng `COALESCE`; điều kiện trạng thái thanh toán và thời hạn được kiểm tra lại trong câu lệnh cập nhật.

Demo được thu gọn và viết riêng để chia sẻ. Khác ứng dụng gốc:

1. Loại bỏ toàn bộ luồng tài khoản, giao dịch, cấp lại liên kết, dữ liệu và cấu hình sản phẩm.
2. Không cho chuyển hướng ra `file_url` bên ngoài; chỉ có một tệp tổng hợp trong R2 cục bộ.
3. Không dùng KV rate limit; phép thử cạnh tranh đo thẳng điều kiện D1, không cần thay IP.
4. Đồng hồ được truyền vào handler rồi bind vào SQL để kiểm soát các mốc 59/60/61 giây. Không có tham số HTTP cho người dùng đặt đồng hồ.
5. Proxy mất phản hồi là ca bổ sung của demo; không hồi tố thành ca đã chạy trong bộ bằng chứng Project 2 ngày 13/10/2026.

Báo cáo Project 2 vẫn chứa mô tả thiết kế, điều kiện thực nghiệm và giới hạn để đọc độc lập. Repo này cung cấp mã và cách chạy bổ sung. Commit demo không nhận dạng toàn bộ cây mã riêng tư đã chạy 202 ca; hai bộ kết quả phải được dẫn riêng.

## Cách đối chiếu lần chạy

1. Checkout commit được dẫn và cài bằng `npm ci`.
2. Xác nhận `git status --short` sạch.
3. Chạy `npm run evidence`; lỗi kiểm tra kiểu/kiểm thử sẽ làm lệnh thất bại.
4. Đối chiếu `summary.json.testedCommit` với `git rev-parse HEAD`, tổng số ca trong `vitest.json` và trạng thái trước/sau trong `network-smoke.json`.
5. Đối chiếu SHA-256 các tệp kết quả và manifest. GitHub Actions chạy cùng lệnh, lưu artifact theo commit để tham khảo.
