// Bằng chứng link + chạy cho slice macOS của framework do build.sh sinh ra.
// Chỉ dùng symbol khai báo trong Headers/Mobile.objc.h.
#import <Foundation/Foundation.h>
#import <Hysteria/Hysteria.h>

int main(void) {
  @autoreleasepool {
    NSLog(@"hysteria-apple: linked Hysteria.framework (static archive)");
    // Chưa Connect() nên Serve() phải trả lỗi "hysteria not connected": test này
    // chứng minh Go runtime + cầu nối lỗi sang NSError chạy thật.
    NSError *err = nil;
    BOOL ok = MobileServe(0, 0, @"", @"", &err);
    NSLog(@"MobileServe -> ok=%d err=%@", (int)ok, err.localizedDescription ?: @"(nil)");
    MobileStop();
    NSLog(@"MobileStop ok (Go runtime alive & callable)");
  }
  return 0;
}
