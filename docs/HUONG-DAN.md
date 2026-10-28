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

Danh sách `--apps` là các App ID bạn chọn, theo thứ tự hiển thị. Cách tìm App ID, đặt mã gói riêng và ô cho ứng dụng khác: xem [Cài lên TV khác](TV-KHAC.md). Sau đó mở `.local/launcher.json` và thêm dòng nguồn vào (không bắt buộc):

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

## 10. (Không bắt buộc) Lời chào, âm lịch và ngày riêng

Launcher luôn hiện lời chào theo buổi, ngày âm lịch và đếm ngược tới 2-3 ngày lễ gần nhất (Tết, Trung thu, 20/10, Giáng sinh...).
Thêm vào `.local/launcher.json` nếu muốn:

```json
"greetingName": "nhà An Bình",
"events": [
  {"name": "Sinh nhật Bi", "month": 10, "day": 29},
  {"name": "Giỗ ông", "month": 9, "day": 20, "lunar": true}
]
```

- `greetingName` được ghép vào lời chào, ví dụ "Chào buổi tối, nhà An Bình".
- `events` là ngày riêng; `"lunar": true` nghĩa là ngày âm lịch, launcher tự đổi ra dương lịch mỗi năm.
- Dòng đếm ngược luôn nằm trên một dòng; nếu dài quá, sự kiện xa nhất được bỏ bớt.

## 11. (Không bắt buộc) Service nền: tự quay lại launcher

Mỗi bản build có kèm một service nền nhỏ (`<package>.Service`). Mặc định nó chỉ quan sát, không làm gì.
Muốn launcher tự quay lại khi bấm Home, thêm vào `.local/launcher.json` rồi build, ký, cài lại như bước 9:

```json
"service": {"mode": "guard", "delayMs": 500}
```

Khi bật:

- Bấm **Home** trên launcher: Samsung Home hiện ra, khoảng nửa giây sau launcher mở lại.
- Bấm **Home** khi đang xem ứng dụng mở từ launcher (FPT Play, Stremio, Nuvio, YouTube, Netflix...): launcher cũng quay lại.
- Ứng dụng đang xem **không bị ngắt**, kể cả xem lâu. YouTube phát từ điện thoại cũng không bị ngắt.
- **Không chen vào** Art Mode, chế độ chờ, menu Cài đặt hay Nguồn của Samsung.
- Chọn **Samsung Home ↗** trong Cài đặt, hoặc bấm **Back** ở màn hình chính: service tạm nghỉ 10 phút để bạn dùng Samsung Home.

Service chỉ **đọc** trạng thái TV (API cục bộ `127.0.0.1:8001` và nhóm CPU `cpu/running`, nơi TV đặt ứng dụng đang hiện)
rồi mở launcher. Nó không chặn phím Home/Power, không sửa cài đặt Home hay khởi động. Gỡ launcher là gỡ luôn service.
Muốn tắt: đổi thành `"mode": "observe"` hoặc xoá dòng `service`, rồi cài lại.

`reportUrl` chỉ dùng khi gỡ lỗi (gửi nhật ký về máy tính trong mạng nhà). Bản dùng hằng ngày không nên có dòng này.

## 12. Ghim lên đầu Home

Phím Home vẫn mở Samsung Home (xem phần giới hạn). Để vào launcher nhanh nhất:

1. Bấm **Home**, vào **Apps**, chọn biểu tượng **Cài đặt** (bánh răng) trong màn hình Apps.
2. Chọn **CleanYourTizen**, rồi **Move** (Di chuyển) hoặc **Add to Home** (Thêm vào Home). Tên mục có thể khác tuỳ firmware.
3. Đưa nó tới ô đầu tiên bằng mũi tên trái, bấm OK.

Nên bật chế độ **mở lại ứng dụng cuối cùng khi bật TV** (*Autorun Last App*) trong cài đặt của Samsung, vì service nền không tự chạy lúc bật TV. Với The Frame, hãy kiểm tra nó không làm ảnh hưởng Art Mode.

## 13. Cách dùng

![Màn hình chính](images/launcher-home.png)

- **Thanh trên cùng bên phải:**
  - **Nguồn vào:** chọn thiết bị HDMI (nút OK chuyển sang nguồn đó, nút Back quay về launcher).
  - **Wi-Fi:** tên mạng và độ mạnh tín hiệu.
  - **Cài đặt:** âm lượng (mũi tên trái/phải), tắt tiếng, hình nền, sắp xếp ứng dụng, Samsung Home.
- **Hàng ứng dụng bên dưới:** OK để mở.
- **Phía trên:** lời chào, ngày âm lịch và đếm ngược ngày lễ.
- **Back** khi không mở menu nào: quay về Samsung Home (service nền tạm nghỉ 10 phút).

![Menu nguồn vào](images/launcher-input.png)
![Menu cài đặt](images/launcher-settings.png)

## 14. Cập nhật và gỡ

- **Cập nhật:** build lại, ký lại bằng **cùng Author certificate**, rồi chạy lại `tizen install`. Ký bằng chứng chỉ khác sẽ bị TV từ chối.
- **Gỡ launcher:** `tizen uninstall -p CyTizen001.Home -s 192.168.1.50:26101`. Samsung Home vẫn nguyên vẹn.
- Dùng xong, bạn có thể tắt Developer Mode trong TV.

## 15. Xử lý sự cố

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
| Bấm Home không quay lại launcher | Chưa bật `service.mode: guard`, đang trong 10 phút tạm nghỉ, hoặc chưa mở launcher lần nào từ lúc bật TV | Kiểm tra cấu hình, mở launcher một lần, đợi hết tạm nghỉ |
| Icon vẫn là hình cũ sau khi cập nhật | Samsung Home giữ icon trong bộ nhớ đệm | Tắt TV bằng điều khiển rồi bật lại |

## 16. Giới hạn bạn nên biết

- Service nền chỉ mở lại launcher **sau khi** Samsung Home hiện ra (khoảng nửa giây), không thay thế được phím Home.
- Không thay được phím **Home**, **Power** và phím tắt thương hiệu (Disney+, VieON...). Chúng không nằm trong danh sách phím ứng dụng được phép nhận.
- Không chỉnh được Hình ảnh, Hẹn giờ tắt từ launcher, và không mở được các app Cài đặt của Samsung.
- Một số ứng dụng cài sẵn không gỡ được.
- Kết quả chỉ được kiểm chứng trên một TV. Dòng TV hoặc firmware khác có thể khác. Xem [hồ sơ thiết bị](../profiles/qa55ls03b.json).

Bạn tự chịu trách nhiệm với TV của mình. Dự án không liên kết với Samsung hay Apple.
