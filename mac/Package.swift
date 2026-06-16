// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "ProjectsDashboard",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(
            name: "ProjectsDashboard",
            path: "Sources/ProjectsDashboard"
        )
    ]
)
