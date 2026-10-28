# Cài lên TV khác, với ứng dụng của bạn

[English](OTHER-TVS.md) · Tiếng Việt

Launcher không gắn cứng với FPT Play, Stremio hay Nuvio. Bạn chọn ứng dụng có trên TV của mình (VieON, TV360, Prime Video,
Disney+, Spotify...). Trang này nói những gì khác đi khi cài lên TV khác; các bước chung (Developer Mode, chứng chỉ, build, ký, cài)
vẫn theo [hướng dẫn từng bước](HUONG-DAN.md).

## 1. Mỗi TV cần chứng chỉ riêng

- Không dùng được file `.wgt` người khác đã ký. Distributor certificate chứa **DUID** của từng TV, TV không có trong đó sẽ từ chối
  (`Invalid signature`). Hãy tạo chứng chỉ của chính bạn ([hướng dẫn, bước 4](HUONG-DAN.md)).
- Có nhiều TV trong nhà: khi tạo Distributor certificate, kết nối `sdb` tới từng TV và tick tất cả. Một file ký dùng được cho mọi TV đã tick.
- Giữ cùng Author certificate cho mọi lần cập nhật.

## 2. Tìm App ID của ứng dụng bạn muốn

Chạy `inspect` (chỉ đọc) như bước 5 của hướng dẫn, rồi liệt kê ứng dụng kèm tên:

```bat
python -c "import json; [print(a['id'], '|', a['name']) for a in json.load(open('.local/before.json', encoding='utf-8'))['apps']]"
```

Thêm `| findstr /i vieon` vào cuối để lọc theo tên. Một vài điểm cần biết:

- Ứng dụng tải từ cửa hàng có App ID dạng **10 ký tự, dấu chấm, tên**, ví dụ `9Ur5IzDKqV.TizenYouTube`.
  App ID giống nhau trên mọi TV, nhưng hãy lấy từ chính TV của bạn để chắc chắn.
- Ứng dụng cài sẵn của Samsung có dạng `com.samsung.tv...` hoặc `org.tizen...`.
- Tên trong danh sách đôi khi là tên nội bộ, không phải tên bạn thấy trên TV. Nếu không chắc, mở ứng dụng trên TV
  rồi chạy lại `inspect`, hoặc thử từng App ID bằng `cyt launch`.
- Ứng dụng phải có trong ảnh chụp `before.json`; cài thêm ứng dụng mới thì chạy lại `inspect`.

## 3. Tạo cấu hình với ứng dụng của bạn

```bat
python -m cyt launcher-config --snapshot .local/before.json --apps APPID_1 APPID_2 APPID_3 --package NhaAnBinh1 --out .local/launcher.json
```

- `--apps`: các App ID theo thứ tự hiển thị. **5 ứng dụng là đẹp nhất** (một hàng). Từ 6 tới 10 sẽ thành hai hàng; nhiều hơn sẽ chật màn hình.
  Thứ tự đổi lại được trên TV trong **Cài đặt → Sắp xếp ứng dụng**.
- `--package`: nên đặt mã riêng gồm **đúng 10 chữ hoặc số**, ví dụ `NhaAnBinh1`.
  Mã mặc định `CyTizen001` chỉ dành cho thử nghiệm. Đổi mã sau này nghĩa là cài thành ứng dụng mới, mất thứ tự và hình nền đã chọn.
- Sau đó thêm vào `.local/launcher.json` các mục tuỳ chọn: `inputs` (nguồn HDMI, bước 7), `greetingName`, `events` (bước 10),
  `service` (bước 11).

## 4. Ô ứng dụng trông thế nào

- FPT Play, Stremio, Nuvio, YouTube và Netflix có ô thiết kế sẵn (nhận theo tên ứng dụng).
- Ứng dụng khác có ô xanh xám, chữ lớn là **hai chữ cái đầu** của tên, bên dưới là tên đầy đủ.
- Tên lấy từ TV. Muốn ngắn gọn hơn, sửa trường `"name"` của ứng dụng đó trong `.local/launcher.json` rồi build lại;
  đừng sửa `"id"`.
- Muốn có ô riêng có màu thương hiệu: thêm một dòng trong hàm `brand()` ở `launcher/app.js` và một lớp CSS trong
  `launcher/style.css`. Chỉ dùng chữ và màu, không chép logo của hãng. Rất hoan nghênh đóng góp ([CONTRIBUTING](../CONTRIBUTING.md)).

## 5. Service nền với ứng dụng của bạn

Bật `"service": {"mode": "guard", "delayMs": 500}` như [bước 11](HUONG-DAN.md). Cách service hoạt động với ứng dụng khác:

- **Ứng dụng mở từ launcher (bất kỳ ứng dụng nào):** service theo dõi đúng App ID đó. Đang xem thì không bị ngắt.
  Bấm Home trong ứng dụng thì launcher quay lại.
- **Ứng dụng mở từ chỗ khác** (từ Samsung Home, phát từ điện thoại...): service để yên nếu đó là ứng dụng cửa hàng (App ID 10 ký tự),
  YouTube hoặc Netflix.
- **Ứng dụng cài sẵn của Samsung mở từ chỗ khác** (Samsung TV Plus, Gallery, trình duyệt...) có thể bị launcher che sau khoảng nửa giây.
  Cách tránh: thêm ứng dụng đó vào launcher và mở từ launcher, hoặc chọn **Samsung Home ↗** trong Cài đặt (service nghỉ 10 phút).
- **Art Mode** chỉ được kiểm chứng trên The Frame QA55LS03B (2022). TV không phải The Frame thì không có Art Mode.
  Với The Frame đời khác, hãy thử ngay sau khi cài: bấm Power để vào Art Mode, đợi 10 giây. Nếu launcher hiện đè lên Art Mode,
  đổi `"mode": "observe"` rồi cài lại, và báo lại cho dự án (kèm model và firmware, không kèm IP/DUID).
- Kiểm tra đầy đủ theo [danh sách nghiệm thu](ACCEPTANCE.md), mục *Guard service*.

## 6. Nếu TV không giống TV đã thử

| Hiện tượng | Ý nghĩa | Làm gì |
|---|---|---|
| `inspect` báo `not a TV` hoặc không kết nối | Không phải TV Tizen, hoặc Developer Mode chưa đúng | Xem lại bước 1-3 |
| Cài được nhưng màn hình trắng | Có thể là Tizen cũ hơn 6.5 (chưa thử) | Chưa hỗ trợ; báo lại model và firmware |
| Nút Nguồn vào không đổi nguồn | TV không cho ứng dụng đổi nguồn | Bỏ mục `inputs`, dùng phím Source |
| Bấm Home không quay lại launcher dù đã bật guard | TV không cho đọc `cpu/running`, hoặc Samsung Home có App ID khác | Xem `samsungHome` trong `launcher.json`; báo lại cho dự án |
| Launcher che một ứng dụng bạn đang xem | Ứng dụng cài sẵn mở từ ngoài launcher (mục 5) | Mở nó từ launcher, hoặc dùng Samsung Home ↗ |

Muốn đóng góp hồ sơ cho TV mới, xem [profiles/qa55ls03b.json](../profiles/qa55ls03b.json) làm mẫu: ghi đúng model, firmware và những gì đã thử.
Không gửi IP, MAC, DUID, chứng chỉ hay ảnh chụp nội dung riêng tư.
