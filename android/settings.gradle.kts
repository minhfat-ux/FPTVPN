pluginManagement {
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "VPNFlow"
include(":app")
// App "guard" riêng cho TV không có TUN: giữ proxy hệ thống không trỏ vào cổng chết
// (ROM force-stop VPNFlow thì alarm của app này vẫn nổ).
include(":guard")
