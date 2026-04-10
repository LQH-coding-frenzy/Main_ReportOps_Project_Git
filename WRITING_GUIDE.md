# 📝 Bảng Hướng dẫn Trình bày Báo cáo (ReportOps)

Để đảm bảo báo cáo cuối cùng khi được Leader "Merge" từ nhiều Section sẽ trở thành một Document hoàn chỉnh, chuyên nghiệp và không bị vỡ layout, tất cả các thành viên **bắt buộc** phải tuân thủ các quy tắc định dạng dưới đây.

---

## 1. Cấu trúc Heading (Tiêu đề)
Hệ thống sử dụng các thẻ Heading để tự động sinh Mục lục (Table of Contents). Hãy dùng đúng cấp độ Heading:

- 🟢 **Heading 1 (Tiêu đề chính):** Tên của Section (Ví dụ: `1.1.1 Ensure mounting of cramfs filesystems is disabled`)
- 🟢 **Heading 2 (Thành phần phụ):** Các đề mục tiêu chuẩn bên trong một Section phải luôn luôn được đặt tên chính xác như sau:
  - `Profile Applicability:`
  - `Description:`
  - `Rationale:`
  - `Audit:`
  - `Remediation:`
  - `Default Value:`
- ❌ **Tuyệt đối không dùng Heading 1 cho các đề mục phụ.** Điều này sẽ làm hỏng mục lục của báo cáo.

---

## 2. Định dạng Văn bản
- **Code, Lệnh (Commands) & Cấu hình (Configs):** Bắt buộc phải đưa vào Khối định dạng (Blockquote hoặc Code block) với phông chữ Monospace (Courier New hoặc Consolas).
  - *Ví dụ:* `cat /etc/passwd`
- **Tên file & Đường dẫn:** Sử dụng định dạng in nghiêng hoặc in đậm.
  - *Ví dụ:* mở file **/etc/ssh/sshd_config**
- **Căn lề (Alignment):** Tất cả nội dung văn bản mặc định phải được **Căn thẳng lề trái (Align Left)** hoặc **Căn đều hai bên (Justify)**. Không được thụt lề đầu dòng bằng phím Space.

---

## 3. Bảng biểu (Tables)
Nếu bạn cần lập bảng so sánh hoặc thông số:
- Sử dụng tính năng "Insert Table" trên Editor.
- Chỉnh độ rộng của bảng là **100% (Fit to Page)**.
- Hàng đầu tiên (Header Row) phải in đậm chữ và có màu nền nhạt (Light Gray) để phân biệt.

---

## 4. Ghi chú & Cảnh báo
Đối với các nội dung cần đặc biệt chú ý, hãy sử dụng bôi đậm cùng với tiền tố sau:
- **[NOTE]:** Thông tin bổ sung hữu ích.
- **[WARNING]:** Những thiết lập có thể ảnh hưởng đến kết nối hoặc làm treo dịch vụ. Thay đổi phải cực kỳ cẩn thận.

---

## 5. Những Lỗi Thường Gặp Cần Tránh
- ⛔ Chép/Dán (Copy/Paste) rác từ website (CSS ẩn, bảng lồng ẩn). Hãy dùng "Paste as Plain Text" rồi format lại.
- ⛔ Xuống dòng quá nhiều bằng nút Enter để tạo khoảng trống. 
- ⛔ Chèn ảnh quá khổ (Hãy crop ảnh vừa đủ để nhìn rõ nội dung, chiều rộng tối đa nên là 16cm).

> 💡 **Khẩu quyết:** "Giữ mọi thứ Đơn Giản, Rõ Ràng và Tuân Thủ Cấu Trúc."
