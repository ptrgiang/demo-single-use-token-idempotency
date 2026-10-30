# Kiểm tra luồng trình duyệt

Chạy npm ci, npm run db:migrate, npm run dev; mở http://127.0.0.1:8799/mini.

1. Bắt đầu phiên demo. Có hai đơn tổng hợp giá49.000/0. Mở đơn trả phí; D1 used_at/idempotency_key vẫn NULL khi chỉ xem trang.
2. Bấm Tải xuống. Chờ nhận67byte, SHA-256 khớp fixture. JSON inspector ghi đúng requestId của trace máy chủ và before/after có khóa đầu tiên.
3. Gửi lại cùng khóa ngay trong dưới60giây:200, used_at và khóa giữ nguyên. Thử UUID khác:403, D1 giữ nguyên. Nút lưu tệp chỉ có sau khi byte thực nhận và checksum khớp.
4. Yêu cầu link mới cho cùng đơn: token mới, used_at NULL; có thể tải tiếp. Mở đơn miễn phí và kiểm tra tương tự byte/checksum.
5. Kiểm thử100yêu cầu: lưới cập nhật theo response;1x200/99x403, khóa thắng trùng D1. Đây là kiểm tra cạnh tranh, không phải benchmark.
6. Tải lại trang: khôi phục cùng hai đơn qua sessionStorage. Remote yêu cầu nhập lại mã môi trường; sau đó khôi phục phiên cũ, không ghi mã môi trường vào storage.
7. Kiểm tra bàn phím và màn hình375px: nút thao tác có focus, các vùng đọc được, không tràn ngang. Kiểm tra console không có lỗiscript.

Kết quả trình duyệt công bố là quan sát riêng, không tự cộng vào sốtest Vitest. scripts/mini-smoke.mjs chạy lại phần HTTP/D1/R2 bằng CLI; nó không giả lập các thao tác DOM. Lưu tệp xuống hệ điều hành và thử trênprovider được báo cáo riêng nếu đã thực hiện.
