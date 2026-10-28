# CleanYourTizen

[English](README.md) · [Tiếng Việt](README.vi.md)

**Màn hình chính kính mờ kiểu Apple TV cho TV Samsung Tizen**, kèm bộ công cụ cẩn thận để kiểm tra TV và lập kế hoạch dọn ứng dụng
(mặc định chỉ đọc). Launcher chạy như một ứng dụng bình thường: không root, không sửa firmware, Samsung Home và Art Mode giữ nguyên.

![Màn hình chính](docs/images/launcher-home.png)

| Menu nguồn vào | Cài đặt |
|---|---|
| ![Menu nguồn vào](docs/images/launcher-input.png) | ![Cài đặt](docs/images/launcher-settings.png) |

*Ảnh nền trong ảnh chụp màn hình: một ảnh aerial của Apple TV, chỉ dùng để minh hoạ. Quyền thuộc về chủ sở hữu và không nằm trong giấy phép MIT của dự án. Repo không kèm ảnh nền; hãy dùng ảnh bạn có quyền sử dụng.*

## Có gì trong launcher

- Đồng hồ và ngày lớn, lời chào theo buổi, **ngày âm lịch** và một dòng **đếm ngược** 2-3 ngày lễ hoặc ngày riêng của gia đình sắp tới.
- Thanh nhanh **Nguồn vào**, **Wi-Fi**, **Cài đặt**, và hàng ứng dụng yêu thích.
- **Chuyển nguồn vào** với đúng tên thiết bị mà TV báo (ví dụ máy chơi game ở HDMI 4).
- **Wi-Fi** (tên mạng, tín hiệu), **âm lượng và tắt tiếng**, màn hình sắp xếp ứng dụng.
- **Ảnh nền đổi mỗi ngày** từ ảnh của chính bạn, có bảng chọn nhanh xem trước từng ảnh.
- **Service nền (tuỳ chọn)** mở lại launcher khi bấm Home, nhưng không chen vào Art Mode, chế độ chờ hay ứng dụng đang xem. Xem [hướng dẫn, mục 11](docs/HUONG-DAN.md).
- Toàn bộ là HTML/CSS/JS chạy cục bộ, không gọi mạng, không tài khoản, không theo dõi.
- Công cụ dọn dẹp an toàn: kiểm tra, lập kế hoạch, áp dụng có mã băm kế hoạch và xác nhận mất dữ liệu, rồi xác minh.

## Bắt đầu

- **[Hướng dẫn từng bước (Tiếng Việt)](docs/HUONG-DAN.md)** · [Step-by-step guide (English)](docs/GETTING-STARTED.md)
- **[Cài lên TV khác, với ứng dụng của bạn](docs/TV-KHAC.md)** · [Another TV, your own apps](docs/OTHER-TVS.md)
- [Ký ứng dụng và chứng chỉ](docs/SIGNING.md) · [Phạm vi an toàn](docs/SAFETY.md) · [Danh sách nghiệm thu trên TV](docs/ACCEPTANCE.md)

## Đã kiểm chứng trên TV thật

Trên một chiếc The Frame QA55LS03BAKXXV (Tizen 6.5), xem [hồ sơ thiết bị](profiles/qa55ls03b.json):

- Launcher ký bằng chứng chỉ Samsung của chính bạn cài được bằng `tizen install` và mở được ứng dụng.
- Chuyển nguồn vào chạy được (`tvwindow.setSource` cùng nền trang trong suốt) và TV cung cấp tên thiết bị HDMI.
- Đọc được Wi-Fi, chỉnh được âm lượng và tắt tiếng.
- Service nền ở chế độ `guard` đưa launcher trở lại khi bấm Home trên launcher hoặc trong FPT Play, Stremio, Nuvio, YouTube, Netflix mở từ launcher; Art Mode không bị ảnh hưởng.

## Giới hạn (quan trọng)

- **Không thay được phím Home, Power và phím tắt thương hiệu (Disney+, VieON...)**: chúng không nằm trong danh sách phím ứng dụng được nhận.
- Không mở được các app Cài đặt của Samsung (`UnknownError`), không chỉnh được Hình ảnh và Hẹn giờ tắt.
- Ứng dụng cài sẵn thường **không gỡ được** qua Developer Mode (`can not uninstall app`).
- Phím Home vẫn mở Samsung Home trước; service chỉ mở lại launcher sau đó khoảng nửa giây. Service không tự chạy khi bật TV (TV dân dụng không cho), hãy bật *Autorun Last App* (mở lại ứng dụng cuối) của Samsung.
- Chỉ kiểm chứng trên một TV. Dòng TV hoặc firmware khác có thể khác.

> **Tự chịu rủi ro.** Gỡ ứng dụng sẽ xoá dữ liệu và đăng nhập, không hoàn tác được từ công cụ này.
> Dự án không liên kết với Samsung hay Apple. Tên ứng dụng thuộc về chủ sở hữu của chúng.

## Kiểm thử và đóng góp

```sh
python -m unittest discover -s tests -v
npm test
```

Xem [CONTRIBUTING](CONTRIBUTING.md). Đừng đăng token, IP/MAC/DUID, chứng chỉ hay ảnh chụp nội dung riêng tư. Giấy phép: [MIT](LICENSE).
