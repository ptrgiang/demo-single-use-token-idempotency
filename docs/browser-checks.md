# Kiểm tra luồng trình duyệt

Chạy npm ci, npm run db:migrate, npm run dev; mở http://127.0.0.1:8799/. Trang chính mở Project 1 trước. Chọn tab Project 2 để thực hiện các bước tải bên dưới; URL cũ /mini chọn sẵn Project 2 trong cùng website.

1. Bắt đầu phiên demo. Có hai đơn tổng hợp giá49.000/0. Mở đơn trả phí; D1 used_at/idempotency_key vẫn NULL khi chỉ xem trang.
2. Bấm Tải xuống. Chờ nhận67byte, SHA-256 khớp fixture. JSON inspector ghi đúng requestId của trace máy chủ và before/after có khóa đầu tiên.
3. Gửi lại cùng khóa ngay trong dưới60giây:200, used_at và khóa giữ nguyên. Thử UUID khác:403, D1 giữ nguyên. Nút lưu tệp chỉ có sau khi byte thực nhận và checksum khớp.
4. Yêu cầu link mới cho cùng đơn: token mới, used_at NULL; có thể tải tiếp. Mở đơn miễn phí và kiểm tra tương tự byte/checksum.
5. Kiểm thử100yêu cầu: lưới cập nhật theo response;1x200/99x403, khóa thắng trùng D1. Đây là kiểm tra cạnh tranh, không phải benchmark.
6. Tải lại trang: khôi phục cùng hai đơn qua sessionStorage. Remote yêu cầu nhập lại mã môi trường; sau đó khôi phục phiên cũ, không ghi mã môi trường vào storage.
7. Kiểm tra bàn phím và màn hình375px: nút thao tác có focus, các vùng đọc được, không tràn ngang. Kiểm tra console không có lỗiscript.
8. Đổi qua năm mục trong menu kịch bản: đơn/token và kết quả tải vẫn giữ nguyên; chưa bấm nút chạy thì chưa có yêu cầu kiểm thử. Dùng Tab/Enter để chọn menu.
9. Mở/ẩn terminal; chuyển Request log, D1 / R2, JSON, hướng dẫn chạy. Kết quả tiếp tục được ghi khi terminal đóng. Kiểm tra `aria-expanded` khớp trạng thái mở/ẩn.
10. Sau phép thử 100 yêu cầu, tạo phiên mới hoặc mở đơn khác rồi quay lại menu 100 yêu cầu: kết quả cũ không được hiện lại. Trên điện thoại, chọn kịch bản qua danh sách chọn, không làm trang tràn ngang.
11. Terminal mặc định mở gọn. Ở 1280×720, nút tải, nút chạy kịch bản và terminal cùng hiện trong màn hình; document không cần cuộn. Ở 375×844, không tràn ngang; nội dung dài cuộn trong website/terminal. Ở 900×500, trang cho phép cuộn tự nhiên và không mất nút.
12. Dùng Enter mở/ẩn terminal; Tab tới vùng nội dung backend rồi PageDown/End để đọc log hoặc JSON dài. Tóm tắt HTTP vẫn hiện khi thu gọn. Log theo dòng mới khi đang ở cuối; phép thử 100 yêu cầu giữ lưới kết quả ở đầu vùng terminal, có thể cuộn xuống đọc trace.
13. Chạy thao tác mô phỏng Project 1, chuyển Project 2 rồi quay lại: token, kịch bản và log mô phỏng giữ nguyên. Tải tệp trong Project 2, đổi sang Project 1 rồi quay lại: đơn, kết quả byte/checksum, log và trạng thái terminal giữ nguyên. Chuyển project không tự gửi grant hay tạo phiên mới.
14. Dùng mũi tên/Home/End đổi project, kiểm tra aria-selected và focus. Back/Forward khôi phục project từ hash. Link bỏ qua điều hướng tập trung nội dung mà không đổi project. Kiểm tra root mặc định Project 1; /mini và /mini/ mở Project 2, đường dẫn con đúng.
15. Host tĩnh chỉ có file: Project 1 vẫn chạy; Project 2 hiện hướng dẫn backend, nút thử kết nối và bằng chứng đã lưu. Không xuất log cấp quyền giả hoặc tự kết nối localhost. Kiểm tra cả đường dẫn có thư mục con.

Kết quả trình duyệt công bố là quan sát riêng, không tự cộng vào sốtest Vitest. scripts/mini-smoke.mjs chạy lại phần HTTP/D1/R2 bằng CLI; nó không giả lập các thao tác DOM. Lưu tệp xuống hệ điều hành và thử trênprovider được báo cáo riêng nếu đã thực hiện.
