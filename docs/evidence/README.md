# Bằng chứng được lưu

Thư mục `2026-10-30/` lưu nguyên tệp kết quả của lệnh `npm run evidence`, chạy trên Windows/Node.js 24.14.1 tại commit sạch:

`96b687505e6f6f1d03a941d0b5d79f65d9eeafb2`

- Kiểm tra kiểu: đạt.
- Workers/D1/R2: **18/18 ca**, không có ca thất bại.
- Proxy HTTP ngắt phản hồi sau khi D1 ghi token: client gặp lỗi mạng, thử lại cùng khóa đạt, `used_at` không đổi; khóa khác bị từ chối; byte tệp khớp fixture.
- SHA-256 của từng tệp nguồn trong manifest đã đối chiếu với byte Git của commit trên. `summary.json` ghi mã băm của ba tệp kết quả/manifest còn lại.

Các tệp được thêm vào repo **sau lần chạy**; `testedCommit` nhận dạng mã đã kiểm thử, không phải commit lưu bằng chứng. Đây không phải bằng chứng của bộ 202 ca trong ứng dụng riêng tư. Đường dẫn máy local trong JSON của Vitest chỉ chỉ vị trí checkout repo công khai lúc chạy.

Để tái lập chính xác, checkout commit trên, chạy `npm ci` rồi `npm run evidence`. Lần chạy mới tạo dấu thời gian, UUID và mã băm kết quả mới; so sánh điều kiện và kết quả, không kỳ vọng toàn bộ JSON trùng byte.
