# Hướng dẫn cài CleanYourTizen từng bước (tiếng Việt)

Hướng dẫn này đưa bạn từ TV Samsung nguyên bản tới một màn hình chính kính mờ chạy như một ứng dụng bình thường.
Mọi lệnh đều chạy trên máy tính Windows cùng mạng với TV. Đã thử trên The Frame QA55LS03BAKXXV (Tizen 6.5).
Xem [giới hạn đã kiểm chứng](../profiles/qa55ls03b.json) trước khi kỳ vọng: **launcher không thay được phím Home, Power hay các phím tắt Disney+/VieON**.

> Launcher này là một ứng dụng, không sửa firmware, không cần root và không đụng tới Art Mode.
> Muốn gỡ, chỉ cần gỡ ứng dụng đó. Samsung Home vẫn là màn hình chính của TV.

## 0. Bạn cần chuẩn bị

| Thứ | Ghi chú |
|---|---|
| TV Samsung Tizen 6.5 trở lên | Dòng khác (Tizen cũ, Orsay, màn hình thương mại) chưa được hỗ trợ |
| Máy tính Windows cùng mạng LAN với TV | Đã thử trên Windows 11 |
| Tài khoản Samsung | Dùng để tạo chứng chỉ ký ứng dụng |
| Python 3.10+ | Chỉ dùng thư viện chuẩn, không cần `pip install` |
| Node 18+ (không bắt buộc) | Để chạy test và xem trước giao diện bằng `npm run preview` |
| Git | Để tải mã nguồn |

## 1. Bật Developer Mode trên TV

1. Bấm **Home** trên điều khiển, vào **Apps** (Ứng dụng).
2. Bấm lần lượt **1 2 3 4 5** trên điều khiển (hoặc bàn phím số trên màn hình). Hộp thoại Developer mode hiện ra.
3. Chuyển **Developer mode** sang **On**.
4. Ở ô **Host PC IP**, nhập địa chỉ IP của máy tính (xem bằng lệnh `ipconfig` trong Command Prompt).
5. Bấm OK rồi **khởi động lại TV** (tắt bằng điều khiển và bật lại).

Hãy giữ TV và máy tính trong mạng nhà bạn. Đừng mở cổng này ra Internet.

## 2. Cài công cụ ký và cài ứng dụng của Samsung

1. Tải **Tizen Studio** từ trang chính thức [developer.tizen.org](https://developer.tizen.org/development/tizen-studio/download) và cài đặt (mặc định vào `C:\tizen-studio`).
   Nếu trang tải có bộ cài **CLI**, hãy chọn nó. Bạn không cần giao diện IDE, chỉ cần Package Manager và các công cụ dòng lệnh.
2. Mở **Package Manager** (`C:\tizen-studio\package-manager\package-manager.exe`). Windows sẽ hỏi quyền quản trị, chọn **Yes**.
3. Cài các thành phần sau:
   - **Main SDK → Tizen SDK Tools → Certificate Manager**
   - **Extension SDK → Samsung Certificate Extension**
   - **Extension SDK → TV Extensions** (Samsung Tizen TV SDK)
4. Thêm hai thư mục này vào biến môi trường **PATH** (hoặc luôn gõ đường dẫn đầy đủ):
   - `C:\tizen-studio\tools` (có `sdb.exe`)
   - `C:\tizen-studio\tools\ide\bin` (có `tizen.bat`)

## 3. Kết nối máy tính với TV

```bat
sdb connect 192.168.1.50
sdb devices
```

Thay `192.168.1.50` bằng IP của TV. Bạn phải thấy một dòng có trạng thái `device` và mã model TV. Nếu không thấy, kiểm tra lại bước 1 (đúng IP máy tính và đã khởi động lại TV).

## 4. Tạo chứng chỉ Samsung (làm một lần)

1. Mở **Certificate Manager** (`C:\tizen-studio\tools\certificate-manager\certificate-manager.exe`).
2. Bấm **+** rồi chọn **Samsung → TV**. Đặt tên profile, ví dụ `CleanYourTizen`.
3. Tạo **Author certificate**: đặt mật khẩu và **lưu bản sao an toàn**. Bạn cần đúng chứng chỉ này để cập nhật launcher về sau.
4. Đăng nhập tài khoản Samsung trong cửa sổ hiện ra. Đừng gửi mật khẩu hay mã xác thực cho ai.
5. Tạo **Distributor certificate**, mức **Public**. Ở bước chọn thiết bị:
   - Giữ TV đang kết nối `sdb` và tick đúng thiết bị TV hiện ra trong danh sách. Nó hiện **DUID** (mã nhận dạng riêng của TV).
   - **Không nhập địa chỉ IP vào ô thiết bị.** Chứng chỉ chỉ có IP sẽ bị TV từ chối với lỗi `Invalid signature`.
   - Có thể lấy DUID bằng `sdb shell 0 getduid` rồi dán vào ô DUID. Đừng đăng DUID lên mạng.

Thư mục chứng chỉ nằm ở `C:\Users\<bạn>\SamsungCertificate`. Đừng đưa vào Git, đừng gửi cho ai.

## 5. Lấy mã nguồn và kiểm tra TV (chỉ đọc)

```bat
git clone https://github.com/ductu3590/cleanyourtizen.git
cd cleanyourtizen
python -m cyt inspect --host 192.168.1.50 --firmware PHIEN-BAN-FIRMWARE --out .local/before.json --sdb "C:/tizen-studio/tools/sdb.exe"
```

- **Firmware** xem trong **Cài đặt → Hỗ trợ → Giới thiệu về TV này**. Đây là giá trị bạn tự điền, không phải TV báo.
- Lệnh này chỉ đọc. Nó ghi danh sách ứng dụng vào `.local/before.json`. Thư mục `.local/` bị Git bỏ qua.
- Mở `.local/before.json` để tìm **App ID** của các ứng dụng bạn muốn đặt trong launcher, ví dụ `9Ur5IzDKqV.TizenYouTube`.

## 6. (Không bắt buộc) Dọn ứng dụng không dùng

Bạn có thể bỏ qua bước này. Nếu làm, hãy đọc [SAFETY](SAFETY.md) trước:

- **Gỡ ứng dụng sẽ xoá dữ liệu và đăng nhập, không khôi phục được.** Chỉ cài lại thủ công từ cửa hàng.
- Nhiều ứng dụng cài sẵn **không gỡ được** qua Developer Mode (TV trả lời `can not uninstall app`). Trên TV đã thử, chỉ gỡ được ứng dụng cài thêm.
- Lập kế hoạch (`plan`) rồi xem lại từng ứng dụng, chạy `apply` với mã băm và cờ `--allow-data-loss`. Xem phần "Apply only after review" trong [README](../README.md).

## 7. Tạo cấu hình launcher

```bat
python -m cyt launcher-config --snapshot .local/before.json --apps ZTpEFWgfa9.FPTPlay 9Ur5IzDKqV.TizenYouTube org.tizen.netflix-app --out .local/launcher.json
```

Danh sách `--apps` là các App ID bạn chọn, theo thứ tự hiển thị. Sau đó mở `.local/launcher.json` và thêm dòng nguồn vào (không bắt buộc):

```json
"inputs": [{"type": "HDMI", "number": 4}]
```

Chỉ các nguồn liệt kê ở đây xuất hiện trong menu **Nguồn vào**. TV tự cung cấp tên thiết bị (ví dụ "PlayStation 4").

## 8. (Không bắt buộc) Ảnh nền đổi mỗi ngày

1. Chuẩn bị ảnh `jpg` hoặc `png`, **1920×1080**, mỗi ảnh tối đa 2,5 MB, tối đa 60 ảnh. Tên file chỉ gồm chữ, số, dấu chấm, gạch ngang hoặc gạch dưới.
2. Đặt tất cả vào một thư mục, ví dụ `.local/wallpapers`.
3. Thêm `--wallpapers .local/wallpapers` vào lệnh build ở bước 9.

Launcher dùng một ảnh mỗi ngày theo thứ tự tên file. Trong **Cài đặt → Hình nền** bạn xem trước từng ảnh, chọn một ảnh cố định hoặc quay lại **Tự động mỗi ngày**.
Dùng ảnh bạn có quyền sử dụng. Repo không kèm ảnh nền.

## 9. Build, ký và cài

```bat
python -m cyt build --config .local/launcher.json --out dist/launcher-v1 --wallpapers .local/wallpapers
tizen package -t wgt -s CleanYourTizen -o .local/signed -- dist/launcher-v1
tizen install -n CleanYourTizen.wgt -s 192.168.1.50:26101 -- .local/signed
```

- `build` chỉ tạo file **chưa ký**. TV không cài được file này.
- `tizen package` ký bằng profile bạn tạo ở bước 4 (đổi `CleanYourTizen` thành tên profile của bạn). Nó hỏi mật khẩu nếu cần.
- `tizen install` mới là bước cài thật. Chờ tới khi thấy `Tizen application is successfully installed.`

Mở thử:

```bat
python -m cyt launch --snapshot .local/before.json --config .local/launcher.json --sdb "C:/tizen-studio/tools/sdb.exe"
```

Hoặc tìm **CleanYourTizen** trong danh sách Apps của TV.

## 10. Ghim lên đầu Home

Phím Home vẫn mở Samsung Home (xem phần giới hạn). Để vào launcher nhanh nhất:

1. Bấm **Home**, vào **Apps**, chọn biểu tượng **Cài đặt** (bánh răng) trong màn hình Apps.
2. Chọn **CleanYourTizen**, rồi **Move** (Di chuyển) hoặc **Add to Home** (Thêm vào Home). Tên mục có thể khác tuỳ firmware.
3. Đưa nó tới ô đầu tiên bằng mũi tên trái, bấm OK.

Tuỳ chọn: bật chế độ **mở lại ứng dụng cuối cùng khi bật TV** trong cài đặt của Samsung. Với The Frame, hãy kiểm tra nó không làm ảnh hưởng Art Mode.

## 11. Cách dùng

![Màn hình chính](images/launcher-home.png)

- **Thanh trên cùng bên phải:**
  - **Nguồn vào:** chọn thiết bị HDMI (nút OK chuyển sang nguồn đó, nút Back quay về launcher).
  - **Wi-Fi:** tên mạng và độ mạnh tín hiệu.
  - **Cài đặt:** âm lượng (mũi tên trái/phải), tắt tiếng, hình nền, sắp xếp ứng dụng, Samsung Home.
- **Hàng ứng dụng bên dưới:** OK để mở.
- **Back** khi không mở menu nào: quay về Samsung Home.

![Menu nguồn vào](images/launcher-input.png)
![Menu cài đặt](images/launcher-settings.png)

## 12. Cập nhật và gỡ

- **Cập nhật:** build lại, ký lại bằng **cùng Author certificate**, rồi chạy lại `tizen install`. Ký bằng chứng chỉ khác sẽ bị TV từ chối.
- **Gỡ launcher:** `tizen uninstall -p CyTizen001.Home -s 192.168.1.50:26101`. Samsung Home vẫn nguyên vẹn.
- Dùng xong, bạn có thể tắt Developer Mode trong TV.

## 13. Xử lý sự cố

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| `sdb devices` không thấy TV | Sai IP máy tính trong Developer Mode, hoặc chưa khởi động lại TV | Làm lại bước 1, kiểm tra IP bằng `ipconfig` |
| `Invalid signature` khi cài | Distributor certificate không có DUID của TV (chỉ nhập IP) | Tạo lại profile, dùng lại Author cũ, tick thiết bị kết nối để có DUID (bước 4) |
| Cài xong, mở app vẫn là bản cũ, hoặc `cyt install` báo app chưa có | `sdb install` chỉ copy file, không cài | Dùng `tizen install` như bước 9 |
| `cyt` báo `Inventory changed since snapshot` | Danh sách ứng dụng trên TV đã khác snapshot | Chạy lại `inspect` và `plan`, không chạy lại kế hoạch cũ |
| Package Manager không cài được | Cần quyền quản trị | Chạy với quyền Administrator |
| `can not uninstall app` | Ứng dụng cài sẵn của hệ thống | Không gỡ được qua Developer Mode. Dùng cách ẩn trong Samsung Home nếu TV cho |
| Nút mở Cài đặt/Hình ảnh/Âm thanh của Samsung không hoạt động | TV không cho ứng dụng ngoài mở các app hệ thống (`UnknownError`) | Là giới hạn của nền tảng, không phải lỗi cài đặt |
| Ảnh nền không đổi sang ngày mới | TV đặt sai múi giờ hoặc chưa bấm phím nào | Bấm một phím bất kỳ, launcher kiểm tra lại ngày |
| Icon vẫn là hình cũ sau khi cập nhật | Samsung Home giữ icon trong bộ nhớ đệm | Tắt TV bằng điều khiển rồi bật lại |

## 14. Giới hạn bạn nên biết

- Không thay được phím **Home**, **Power** và phím tắt thương hiệu (Disney+, VieON...). Chúng không nằm trong danh sách phím ứng dụng được phép nhận.
- Không chỉnh được Hình ảnh, Hẹn giờ tắt từ launcher, và không mở được các app Cài đặt của Samsung.
- Một số ứng dụng cài sẵn không gỡ được.
- Kết quả chỉ được kiểm chứng trên một TV. Dòng TV hoặc firmware khác có thể khác. Xem [hồ sơ thiết bị](../profiles/qa55ls03b.json).

Bạn tự chịu trách nhiệm với TV của mình. Dự án không liên kết với Samsung hay Apple.
