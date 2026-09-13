package com.privatevpn.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.foundation.clickable
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.TextButton
import androidx.compose.material3.Text
import androidx.compose.material3.AlertDialog
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import com.privatevpn.app.api.AppVersionInfo
import com.privatevpn.app.api.AppVersionService
import com.privatevpn.app.api.ControlAPIClient
import com.privatevpn.app.theme.VPNTheme
import com.privatevpn.app.ui.ForceUpdateScreen
import com.privatevpn.app.ui.LoginScreen
import com.privatevpn.app.ui.MainScreen
import com.privatevpn.app.ui.PaywallScreen
import com.privatevpn.app.ui.SettingsScreen

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val app = application as VPNFlowApp
        setContent {
            VPNFlowRoot(app)
        }
    }
}

@Composable
private fun VPNFlowRoot(app: VPNFlowApp) {
    val authSession by app.authStore.session.collectAsState()
    val isSignedIn = app.authStore.isSignedIn

    var showLogin by remember { mutableStateOf(!isSignedIn) }
    var showPaywall by remember { mutableStateOf(false) }
    var showSettings by remember { mutableStateOf(false) }
    var forcedUpdate by remember { mutableStateOf<AppVersionInfo?>(null) }

    val vpnConsentLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) {
        app.vpnManager.resumeAfterConsent()
    }

    // "Max 3 devices": the server returns the account's device list when the
    // limit is hit, and the user picks one to log out before we retry.
    val deviceLimit = app.vpnManager.deviceLimit.collectAsState().value
    if (deviceLimit != null) {
        DeviceLimitDialog(
            app = app,
            devices = deviceLimit,
            ownDeviceKey = com.privatevpn.app.storage.DeviceIdentity
                .obtainOrCreateKeyPair(app.secureStore).publicKey.toBase64(),
            onLogout = { app.vpnManager.logOutDeviceAndRetry(it) },
            onDismiss = { app.vpnManager.dismissDeviceLimit() },
        )
    }

    // Notification permission (Android 13+), needed for the VPN foreground notification.
    val notifPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { }

    val context = LocalContext.current
    LaunchedEffect(Unit) {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED) {
            notifPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    // Backend-first init: nodes, subscription, force-update gate.
    LaunchedEffect(Unit) {
        app.vpnManager.fetchNodes()
        app.subscriptionStore.syncBackendPremium()
        val info = runCatching { ControlAPIClient().fetchAppVersion() }.getOrNull()
        if (info != null && AppVersionService.isForcedUpdate(info, BuildConfig.VERSION_NAME)) {
            forcedUpdate = info
        }
    }

    LaunchedEffect(authSession) {
        app.subscriptionStore.syncBackendPremium()
        showLogin = !app.authStore.isSignedIn
    }

    // Quyền Premium có thể được cấp trên web SAU lần đăng nhập cuối, còn session thì chỉ được
    // cấp lúc đăng nhập — nên đọc lại khi app khởi động với session sẵn có và ngay sau khi đăng
    // nhập (nút Connect bị khoá theo isSubscribed). Key là `isSignedIn` nên lần lưu session do
    // chính request này gây ra KHÔNG làm request chạy lại. Best-effort: lỗi thì im lặng.
    LaunchedEffect(isSignedIn) {
        if (isSignedIn) app.subscriptionStore.refreshEntitlement(reportFailure = false)
    }

    // Observe pending VpnService consent intent and launch it.
    val consentIntent by app.vpnManager.pendingConsent.collectAsState()
    LaunchedEffect(consentIntent) {
        consentIntent?.let {
            vpnConsentLauncher.launch(it)
        }
    }

    Box(Modifier.fillMaxSize().background(VPNTheme.backgroundGradient)) {
        when {
            forcedUpdate != null -> ForceUpdateScreen(forcedUpdate!!, app.languageStore)
            showLogin -> LoginScreen(
                app = app,
                onDismiss = { showLogin = false },
                onSignedIn = {
                    showLogin = false
                    app.subscriptionStore.syncBackendPremium()
                }
            )
            showPaywall -> PaywallScreen(
                app = app,
                // Đóng paywall = thời điểm khách vừa có thể đã trả tiền trên trang web trong
                // WebView, nên đọc lại quyền ngay (best-effort: lỗi thì im lặng, giữ nguyên
                // quyền đang có — không bao giờ tự hạ khách xuống Free).
                onClose = {
                    showPaywall = false
                    app.subscriptionStore.refreshEntitlement(reportFailure = false)
                },
                onUpgraded = {
                    showPaywall = false
                    app.subscriptionStore.refreshEntitlement(reportFailure = false)
                }
            )
            showSettings -> SettingsScreen(
                app = app,
                onClose = { showSettings = false },
                onShowPaywall = { showSettings = false; showPaywall = true }
            )
            else -> MainScreen(
                app = app,
                onOpenSettings = { showSettings = true },
                onShowPaywall = { showPaywall = true },
                onShowLogin = { showLogin = true },
            )
        }
    }
}

@Composable
private fun DeviceLimitDialog(
    app: VPNFlowApp,
    devices: List<com.privatevpn.app.api.CoordinatorDevice>,
    ownDeviceKey: String,
    onLogout: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    val lang = app.languageStore
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(lang.t(com.privatevpn.app.l10n.LKey.deviceLimitTitle)) },
        text = {
            Column {
                Text(lang.t(com.privatevpn.app.l10n.LKey.deviceLimitBody))
                Spacer(Modifier.height(12.dp))
                devices.forEach { device ->
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 6.dp),
                    ) {
                        Text(device.name ?: "\u2014")
                        val subtitle = listOfNotNull(device.platform, device.createdAt?.take(10))
                            .joinToString(" · ")
                        if (subtitle.isNotEmpty()) {
                            Text(subtitle, fontSize = 12.sp, color = VPNTheme.SecondaryLabel)
                        }
                        if (device.publicKey != null && device.publicKey == ownDeviceKey) {
                            // Never offer to log out the phone in your hand.
                            Text(
                                lang.t(com.privatevpn.app.l10n.LKey.thisDevice),
                                fontSize = 12.sp,
                                color = VPNTheme.SecondaryLabel,
                            )
                        } else {
                            TextButton(onClick = { onLogout(device.deviceId) }) {
                                Text(lang.t(com.privatevpn.app.l10n.LKey.deviceLimitLogout))
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(lang.t(com.privatevpn.app.l10n.LKey.notNow))
            }
        },
    )
}
