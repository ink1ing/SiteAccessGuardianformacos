// macOS原生应用 - Touch ID验证
import Foundation
import LocalAuthentication

class TouchIDAuthenticator {
    private let context = LAContext()
    
    func authenticate(reason: String, completion: @escaping (Bool, Error?) -> Void) {
        // 检查生物识别是否可用
        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
            completion(false, error)
            return
        }
        
        // 执行生物识别验证
        context.evaluatePolicy(
            .deviceOwnerAuthenticationWithBiometrics,
            localizedReason: reason
        ) { success, error in
            DispatchQueue.main.async {
                completion(success, error)
            }
        }
    }
}

// Native Messaging Host主程序
class NativeMessagingHost {
    private let authenticator = TouchIDAuthenticator()
    private let stdin = FileHandle.standardInput
    private let stdout = FileHandle.standardOutput
    
    func start() {
        // 监听标准输入
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleStdinData),
            name: .NSFileHandleDataAvailable,
            object: stdin
        )
        
        stdin.waitForDataInBackgroundAndNotify()
        RunLoop.main.run()
    }
    
    @objc func handleStdinData() {
        let data = stdin.availableData
        
        if data.isEmpty {
            exit(0)
        }
        
        // 解析消息
        if let message = parseMessage(data) {
            handleMessage(message)
        }
        
        stdin.waitForDataInBackgroundAndNotify()
    }
    
    private func parseMessage(_ data: Data) -> [String: Any]? {
        guard data.count >= 4 else { return nil }
        
        // 读取消息长度 (前4字节)
        let lengthData = data.prefix(4)
        let length = lengthData.withUnsafeBytes { bytes in
            bytes.load(as: UInt32.self).littleEndian
        }
        
        // 读取JSON消息
        let messageData = data.dropFirst(4)
        guard messageData.count >= length else { return nil }
        
        let jsonData = messageData.prefix(Int(length))
        
        do {
            return try JSONSerialization.jsonObject(with: jsonData) as? [String: Any]
        } catch {
            sendError("JSON解析失败: \(error.localizedDescription)")
            return nil
        }
    }
    
    private func handleMessage(_ message: [String: Any]) {
        guard let action = message["action"] as? String else {
            sendError("缺少action字段")
            return
        }
        
        switch action {
        case "authenticate":
            handleAuthenticate(message)
        default:
            sendError("未知操作: \(action)")
        }
    }
    
    private func handleAuthenticate(_ message: [String: Any]) {
        let domain = message["domain"] as? String ?? "未知网站"
        let reason = message["reason"] as? String ?? "验证网站访问权限"
        
        authenticator.authenticate(reason: reason) { [weak self] success, error in
            let response: [String: Any] = [
                "success": success,
                "error": error?.localizedDescription,
                "domain": domain,
                "timestamp": Date().timeIntervalSince1970
            ]
            
            self?.sendResponse(response)
        }
    }
    
    private func sendResponse(_ response: [String: Any]) {
        do {
            let jsonData = try JSONSerialization.data(withJSONObject: response)
            var length = UInt32(jsonData.count).littleEndian
            
            // 发送消息长度
            let lengthData = Data(bytes: &length, count: 4)
            stdout.write(lengthData)
            
            // 发送JSON数据
            stdout.write(jsonData)
            stdout.synchronizeFile()
            
        } catch {
            sendError("响应序列化失败: \(error.localizedDescription)")
        }
    }
    
    private func sendError(_ message: String) {
        let errorResponse: [String: Any] = [
            "success": false,
            "error": message,
            "timestamp": Date().timeIntervalSince1970
        ]
        
        sendResponse(errorResponse)
    }
}

// 程序入口点
let host = NativeMessagingHost()
host.start()
