// Generates AppIcon.iconset (a simple dashboard glyph) for the macOS app.
// Run via build-app.sh; produces PNGs that iconutil turns into AppIcon.icns.
import AppKit

func makeIcon(size: CGFloat) -> NSBitmapImageRep {
    let rep = NSBitmapImageRep(
        bitmapDataPlanes: nil, pixelsWide: Int(size), pixelsHigh: Int(size),
        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
        colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    rep.size = NSSize(width: size, height: size)

    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    NSGraphicsContext.current!.cgContext.clear(CGRect(x: 0, y: 0, width: size, height: size))

    // Rounded "squircle" background with a vertical gradient.
    let margin = size * 0.085
    let rect = CGRect(x: margin, y: margin, width: size - 2 * margin, height: size - 2 * margin)
    let radius = rect.width * 0.225
    NSGraphicsContext.saveGraphicsState()
    NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius).addClip()
    NSGradient(colors: [
        NSColor(srgbRed: 0.12, green: 0.16, blue: 0.24, alpha: 1),
        NSColor(srgbRed: 0.043, green: 0.051, blue: 0.071, alpha: 1),
    ])!.draw(in: rect, angle: -90)
    NSGraphicsContext.restoreGraphicsState()

    // 2x2 grid of rounded squares = "dashboard".
    let grid = rect.width * 0.52
    let ox = rect.midX - grid / 2
    let oy = rect.midY - grid / 2
    let gap = grid * 0.14
    let cell = (grid - gap) / 2
    let fg = NSGradient(colors: [
        NSColor(srgbRed: 0.427, green: 0.549, blue: 1.0, alpha: 1),
        NSColor(srgbRed: 0.655, green: 0.545, blue: 0.98, alpha: 1),
    ])!
    for row in 0..<2 {
        for col in 0..<2 {
            let cellRect = CGRect(
                x: ox + CGFloat(col) * (cell + gap),
                y: oy + CGFloat(row) * (cell + gap),
                width: cell, height: cell)
            NSGraphicsContext.saveGraphicsState()
            NSBezierPath(roundedRect: cellRect, xRadius: cell * 0.28, yRadius: cell * 0.28).addClip()
            fg.draw(in: cellRect, angle: -45)
            NSGraphicsContext.restoreGraphicsState()
        }
    }

    NSGraphicsContext.restoreGraphicsState()
    return rep
}

let sizes: [(String, CGFloat)] = [
    ("icon_16x16", 16), ("icon_16x16@2x", 32),
    ("icon_32x32", 32), ("icon_32x32@2x", 64),
    ("icon_128x128", 128), ("icon_128x128@2x", 256),
    ("icon_256x256", 256), ("icon_256x256@2x", 512),
    ("icon_512x512", 512), ("icon_512x512@2x", 1024),
]
let dir = "AppIcon.iconset"
try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
for (name, s) in sizes {
    let data = makeIcon(size: s).representation(using: .png, properties: [:])!
    try! data.write(to: URL(fileURLWithPath: "\(dir)/\(name).png"))
}
print("wrote \(dir)")
