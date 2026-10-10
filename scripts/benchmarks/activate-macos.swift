// Activate only the disposable benchmark process; never select another Svelto instance.
import AppKit
import Foundation

guard CommandLine.arguments.count == 2,
      let pid = Int32(CommandLine.arguments[1]),
      let target = NSRunningApplication(processIdentifier: pid) else {
    exit(1)
}
let requested = target.activate(options: [])
RunLoop.current.run(until: Date().addingTimeInterval(0.5))
let frontmost = NSWorkspace.shared.frontmostApplication?.processIdentifier == pid
let data = try JSONSerialization.data(withJSONObject: ["requested": requested, "frontmost": frontmost])
print(String(data: data, encoding: .utf8)!)
exit(frontmost ? 0 : 1)
