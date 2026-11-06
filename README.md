# Từ vựng Anh–Việt cho Firefox

Extension Firefox MV3 dùng JavaScript thuần. Từ vựng được lưu trên thiết bị bằng `browser.storage.local`; website chỉ được đọc khi bạn bật riêng website đó.

## Phát triển và kiểm tra

Yêu cầu Firefox 142 trở lên, Node.js và npm.

```sh
npm install
npm test
npm run lint:manifest
npm run build
```

Gói thử được tạo trong `artifacts/`. Khi phát triển, có thể nạp thư mục extension tại `about:debugging` → **This Firefox** → **Load Temporary Add-on…** → chọn `manifest.json`. Extension tạm sẽ cần nạp lại sau khi Firefox khởi động.

## Dùng extension

1. Bấm biểu tượng extension trên website HTTP/HTTPS rồi chọn **Bật**. Firefox sẽ hỏi quyền cho hostname đó.
2. Thêm từ/cụm từ cùng loại từ và nghĩa tiếng Việt trong popup hoặc trang quản lý.
3. Rê chuột lên từ được tô sáng để xem các nghĩa. Popup cũng liệt kê từ tìm thấy và cho phép điều hướng đến từ trên trang.
4. Bôi đen chữ trên trang rồi mở menu chuột phải để nhập loại từ và nghĩa ngay trên trang. Nếu trang không cho phép extension chèn giao diện, form sẽ mở trong trang quản lý.
5. Xuất JSON định kỳ để sao lưu; nhập JSON sẽ gộp nghĩa mới, không thay thế danh sách cũ.

Với mục có loại **Động từ**, chỉ cần lưu từ nguyên mẫu: extension tự highlight dạng ngôi thứ ba, V-ing, quá khứ và quá khứ phân từ phổ biến. Ví dụ: `work → works / working / worked`, `write → writes / writing / wrote / written`, `take off → takes off / taking off / took off / taken off`. Hover các dạng này vẫn hiển thị nghĩa của từ nguyên mẫu. Danh từ cũng được khớp dạng số nhiều theo quy tắc thông thường. Nếu một dạng biến thể đã được lưu riêng, mục lưu riêng được ưu tiên.

Định dạng JSON mẫu nằm tại `vocabulary.example.json`.

## Cài lâu dài

Firefox bản phát hành yêu cầu extension được Mozilla ký. Tạo tài khoản Firefox Add-ons Developer Hub, gửi gói XPI ở chế độ **unlisted**, rồi cài XPI đã ký. Extension dùng ID cố định riêng `tu-vung-anh-viet-ac633b31-4ba5-4d8b-9552-933b06d0bc13@personal.local`; giữ nguyên ID này khi phát hành bản cập nhật.

## Giới hạn v1

Để giảm tải cho Firefox, extension gộp các thay đổi DOM trùng nhau, quét thành từng đợt nhỏ và nhường thời gian cho trình duyệt giữa các đợt. Highlight có thể xuất hiện dần sau khi trang thay đổi. Mỗi trang giới hạn tối đa **10.000 vị trí highlight**, và mỗi khối văn bản chỉ quét **50.000 ký tự đầu**; nội dung vượt giới hạn sẽ không được tô sáng. Khi tắt website, các đợt quét đang chạy cũng bị hủy.

Highlight hoạt động trên văn bản HTML của trang chính được bật. Không hỗ trợ PDF, nội dung ảnh/canvas, iframe, Shadow DOM hoặc trang Firefox hạn chế extension. Việc khớp không phân biệt hoa thường và ưu tiên cụm dài nhất. Nhận diện biến thể dựa trên quy tắc chính tả và danh sách động từ bất quy tắc có sẵn, chưa bao phủ mọi ngoại lệ hoặc biến thể Anh–Mỹ; extension không đoán nghĩa hay phân biệt loại từ theo ngữ cảnh. Với cụm động từ, phần biến đổi là từ đầu tiên của cụm. Tắt website sẽ thu hồi quyền truy cập website đó.
