# CleanYourTizen

[English](README.md) · [Tiếng Việt](README.vi.md)

**Màn hình chính kính mờ kiểu Apple TV cho TV Samsung Tizen**, kèm bộ công cụ cẩn thận để kiểm tra TV và lập kế hoạch dọn ứng dụng
(mặc định chỉ đọc). Launcher chạy như một ứng dụng bình thường: không root, không sửa firmware, Samsung Home và Art Mode giữ nguyên.

![Màn hình chính](docs/images/launcher-home.png)

| Menu nguồn vào | Cài đặt |
|---|---|
| ![Menu nguồn vào](docs/images/launcher-input.png) | ![Cài đặt](docs/images/launcher-settings.png) |

## Có gì trong launcher

- Đồng hồ và ngày lớn, thanh nhanh **Nguồn vào**, **Wi-Fi**, **Cài đặt**, và hàng ứng dụng yêu thích.
- **Chuyển nguồn vào** với đúng tên thiết bị mà TV báo (ví dụ máy chơi game ở HDMI 4).
- **Wi-Fi** (tên mạng, tín hiệu), **âm lượng và tắt tiếng**, màn hình sắp xếp ứng dụng.
- **Ảnh nền đổi mỗi ngày** từ ảnh của chính bạn, có bảng chọn nhanh xem trước từng ảnh.
- Toàn bộ là HTML/CSS/JS chạy cục bộ, không gọi mạng, không tài khoản, không theo dõi.
- Công cụ dọn dẹp an toàn: kiểm tra, lập kế hoạch, áp dụng có mã băm kế hoạch và xác nhận mất dữ liệu, rồi xác minh.

## Bắt đầu

- **[Hướng dẫn từng bước (Tiếng Việt)](docs/HUONG-DAN.md)** · [Step-by-step guide (English)](docs/GETTING-STARTED.md)
- [Ký ứng dụng và chứng chỉ](docs/SIGNING.md) · [Phạm vi an toàn](docs/SAFETY.md) · [Danh sách nghiệm thu trên TV](docs/ACCEPTANCE.md)

## Đã kiểm chứng trên TV thật

Trên một chiếc The Frame QA55LS03BAKXXV (Tizen 6.5), xem [hồ sơ thiết bị](profiles/qa55ls03b.json):

- Launcher ký bằng chứng chỉ Samsung của chính bạn cài được bằng `tizen install` và mở được ứng dụng.
- Chuyển nguồn vào chạy được (`tvwindow.setSource` cùng nền trang trong suốt) và TV cung cấp tên thiết bị HDMI.
- Đọc được Wi-Fi, chỉnh được âm lượng và tắt tiếng.

## Giới hạn (quan trọng)

- **Không thay được phím Home, Power và phím tắt thương hiệu (Disney+, VieON...)**: chúng không nằm trong danh sách phím ứng dụng được nhận.
- Không mở được các app Cài đặt của Samsung (`UnknownError`), không chỉnh được Hình ảnh và Hẹn giờ tắt.
- Ứng dụng cài sẵn thường **không gỡ được** qua Developer Mode (`can not uninstall app`).
- Chỉ kiểm chứng trên một TV. Dòng TV hoặc firmware khác có thể khác.

> **Tự chịu rủi ro.** Gỡ ứng dụng sẽ xoá dữ liệu và đăng nhập, không hoàn tác được từ công cụ này.
> Dự án không liên kết với Samsung hay Apple. Tên ứng dụng thuộc về chủ sở hữu của chúng.

## Kiểm thử và đóng góp

```sh
python -m unittest discover -s tests -v
npm test
```

Xem [CONTRIBUTING](CONTRIBUTING.md). Đừng đăng token, IP/MAC/DUID, chứng chỉ hay ảnh chụp nội dung riêng tư. Giấy phép: [MIT](LICENSE).
