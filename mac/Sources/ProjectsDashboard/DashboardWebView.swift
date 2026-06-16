import SwiftUI
import WebKit

/// SwiftUI wrapper around WKWebView. Installs a `openTerminal` message handler
/// so the web app can ask the native app to open Terminal at a project's path.
struct DashboardWebView: NSViewRepresentable {
    let urlString: String

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeNSView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.userContentController.add(context.coordinator, name: "openTerminal")

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        // Persist cookies (the auth session) across launches.
        webView.configuration.websiteDataStore = .default()
        load(webView)
        return webView
    }

    func updateNSView(_ webView: WKWebView, context: Context) {
        if context.coordinator.lastURL != urlString {
            load(webView)
        }
    }

    private func load(_ webView: WKWebView) {
        guard let url = URL(string: urlString) else { return }
        (webView.navigationDelegate as? Coordinator)?.lastURL = urlString
        webView.load(URLRequest(url: url))
    }

    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
        var lastURL: String = ""

        func userContentController(
            _ userContentController: WKUserContentController,
            didReceive message: WKScriptMessage
        ) {
            guard message.name == "openTerminal",
                  let path = message.body as? String,
                  !path.isEmpty else { return }
            openTerminal(at: path)
        }

        private func openTerminal(at path: String) {
            // Guard against shell metacharacters; `open` takes a real path.
            let expanded = (path as NSString).expandingTildeInPath
            var isDir: ObjCBool = false
            guard FileManager.default.fileExists(atPath: expanded, isDirectory: &isDir) else {
                NSLog("openTerminal: path does not exist: \(expanded)")
                return
            }
            let task = Process()
            task.executableURL = URL(fileURLWithPath: "/usr/bin/open")
            task.arguments = ["-a", "Terminal", expanded]
            do {
                try task.run()
            } catch {
                NSLog("openTerminal failed: \(error)")
            }
        }
    }
}
