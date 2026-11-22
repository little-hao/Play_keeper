package com.local.sgplaykeeper;

import java.util.List;

final class AutomationPackageRegistry {
    private AutomationPackageRegistry() {}

    static List<AutomationPackageDescriptor> packages() {
        return List.of(
                new AutomationPackageDescriptor(
                        "com.playkeeper.sgplay.legacy",
                        "SGPlay 内置自动化",
                        "2.0.8",
                        "http(s)://sgplay.cc",
                        List.of("读取页面", "点击与输入", "同源导航", "人工确认交易"),
                        true,
                        true),
                new AutomationPackageDescriptor(
                        "com.playkeeper.example.readonly",
                        "通用只读示例",
                        "0.1.0",
                        "由实例来源决定",
                        List.of("读取标题", "等待元素", "脱敏日志"),
                        false,
                        false));
    }

    static AutomationPackageDescriptor find(String id) {
        for (AutomationPackageDescriptor descriptor : packages()) {
            if (descriptor.id.equals(id)) return descriptor;
        }
        return null;
    }
}
