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
        app.subscriptionStore.start()
        val info = runCatching { ControlAPIClient().fetchAppVersion() }.getOrNull()
        if (info != null && AppVersionService.isForcedUpdate(info, BuildConfig.VERSION_NAME)) {
            forcedUpdate = info
        }
    }

    LaunchedEffect(authSession) {
        app.subscriptionStore.syncBackendPremium()
        showLogin = !app.authStore.isSignedIn
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
                onClose = { showPaywall = false },
                onUpgraded = { showPaywall = false }
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
