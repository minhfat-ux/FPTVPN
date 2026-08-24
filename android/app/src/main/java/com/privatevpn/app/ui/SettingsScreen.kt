package com.privatevpn.app.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.privatevpn.app.Config
import com.privatevpn.app.VPNFlowApp
import com.privatevpn.app.api.ControlAPIClient
import com.privatevpn.app.api.CoordinatorDevice
import com.privatevpn.app.l10n.LKey
import com.privatevpn.app.l10n.LangChoice
import com.privatevpn.app.theme.VPNTheme
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/** Settings — mirrors iOS SettingsView (language, account, devices, subscription, support). */
@Composable
fun SettingsScreen(
    app: VPNFlowApp,
    onClose: () -> Unit,
    onShowPaywall: () -> Unit,
) {
    val lang = app.languageStore
    val auth = app.authStore
    val sub = app.subscriptionStore
    val context = LocalContext.current
    val scope = remember { CoroutineScope(Dispatchers.Main) }

    val choice by lang.choice.collectAsState()
    val isSignedIn = auth.isSignedIn
    val sessionEmail by remember { mutableStateOf(auth.session.value?.user?.email) }
    val isSubscribed by rememberIsSubscribed(sub)

    var devices by remember { mutableStateOf<List<CoordinatorDevice>>(emptyList()) }
    var isLoadingDevices by remember { mutableStateOf(false) }
    var devicesMessage by remember { mutableStateOf<String?>(null) }
    var revokingId by remember { mutableStateOf<String?>(null) }
    var accountMessage by remember { mutableStateOf<String?>(null) }

    fun loadDevices() {
        if (!auth.isSignedIn) return
        val token = auth.accessToken ?: return
        isLoadingDevices = true
        scope.launch {
            try {
                devices = ControlAPIClient().fetchMyDevices(token)
                devicesMessage = null
            } catch (e: Exception) {
                devicesMessage = e.message
            }
            isLoadingDevices = false
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp)
            .padding(top = 10.dp, bottom = 28.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onClose) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = lang.t(LKey.done), tint = Color.White)
            }
            Text(lang.t(LKey.configuration), fontSize = 20.sp, fontWeight = FontWeight.Bold, color = Color.White)
            Spacer(Modifier.weight(1f))
        }

        Spacer(Modifier.height(12.dp))

        // Language
        SectionTitle(lang.t(LKey.language))
        CardContainer {
            LangChoice.entries.forEach { c ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { lang.setChoice(c) }
                        .padding(vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(c.title(lang.language), color = Color.White, fontSize = 15.sp)
                    Spacer(Modifier.weight(1f))
                    if (choice == c) {
                        Icon(Icons.Default.Check, contentDescription = null, tint = VPNTheme.Accent, modifier = Modifier.width(20.dp))
                    }
                }
            }
        }

        Spacer(Modifier.height(12.dp))

        // Account
        SectionTitle(lang.t(LKey.account))
        CardContainer {
            Row(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
                Text(lang.t(LKey.status), color = Color.White.copy(alpha = 0.55f), fontSize = 14.sp)
                Spacer(Modifier.weight(1f))
                Text(
                    if (isSignedIn) lang.t(LKey.signedIn) else lang.t(LKey.signedOut),
                    color = if (isSignedIn) VPNTheme.Accent else Color.White.copy(alpha = 0.6f),
                    fontSize = 14.sp,
                )
            }
            sessionEmail?.let { email ->
                Row(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
                    Text(lang.t(LKey.email), color = Color.White.copy(alpha = 0.55f), fontSize = 14.sp)
                    Spacer(Modifier.weight(1f))
                    Text(email, color = Color.White, fontSize = 14.sp)
                }
            }
            if (isSignedIn) {
                ActionRow(text = lang.t(LKey.signOut), destructive = false) {
                    auth.signOut()
                    devices = emptyList()
                }
                ActionRow(text = lang.t(LKey.deleteAccount), destructive = true) {
                    val token = auth.accessToken ?: return@ActionRow
                    scope.launch {
                        try {
                            ControlAPIClient().deleteAccount(token)
                            auth.signOut()
                            devices = emptyList()
                            accountMessage = lang.t(LKey.deleteAccountDone)
                        } catch (e: Exception) {
                            accountMessage = e.message
                        }
                    }
                }
                accountMessage?.let {
                    Text(it, fontSize = 12.sp, color = Color.White.copy(alpha = 0.6f), modifier = Modifier.padding(top = 6.dp))
                }
            }
        }

        Spacer(Modifier.height(12.dp))

        // Devices
        SectionTitle(lang.t(LKey.devices))
        CardContainer {
            if (isSignedIn) {
                if (isLoadingDevices && devices.isEmpty()) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        CircularProgressIndicator(modifier = Modifier.width(18.dp).height(18.dp), color = VPNTheme.Accent, strokeWidth = 2.dp)
                        Text(lang.t(LKey.loadingDevices), fontSize = 13.sp, color = Color.White.copy(alpha = 0.6f))
                    }
                } else if (devices.isEmpty()) {
                    Text(lang.t(LKey.noDevices), fontSize = 13.sp, color = Color.White.copy(alpha = 0.6f))
                } else {
                    devices.forEach { device ->
                        DeviceRow(
                            device = device,
                            isCurrent = device.publicKey == app.vpnManager.devicePublicKey.value,
                            revoking = revokingId == device.deviceId,
                            onRevoke = {
                                val token = auth.accessToken ?: return@DeviceRow
                                revokingId = device.deviceId
                                scope.launch {
                                    try {
                                        ControlAPIClient().revokeDevice(device.deviceId, token)
                                        devicesMessage = lang.t(LKey.deviceRevoked)
                                        loadDevices()
                                    } catch (e: Exception) {
                                        devicesMessage = e.message
                                    }
                                    revokingId = null
                                }
                            },
                            lang = lang,
                        )
                    }
                }
                devicesMessage?.let {
                    Text(it, fontSize = 12.sp, color = Color.White.copy(alpha = 0.6f), modifier = Modifier.padding(top = 6.dp))
                }
            }
        }

        Spacer(Modifier.height(12.dp))

        // Subscription
        SectionTitle(lang.t(LKey.subscription))
        CardContainer {
            Row(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
                Text(lang.t(LKey.status), color = Color.White.copy(alpha = 0.55f), fontSize = 14.sp)
                Spacer(Modifier.weight(1f))
                Text(
                    if (isSubscribed) lang.t(LKey.premiumActive) else lang.t(LKey.free),
                    color = if (isSubscribed) VPNTheme.Accent else Color.White.copy(alpha = 0.6f),
                    fontSize = 14.sp,
                )
            }
            ActionRow(text = lang.t(LKey.choosePlan)) { onShowPaywall() }
            ActionRow(text = lang.t(LKey.restorePurchases)) { sub.restorePurchases() }
            ActionRow(text = lang.t(LKey.manageSubscription)) {
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(Config.MANAGE_SUBSCRIPTION_URL))
                ContextCompat.startActivity(context, intent, null)
            }
        }

        Spacer(Modifier.height(12.dp))

        // Support
        SectionTitle(lang.t(LKey.support))
        CardContainer {
            ActionRow(text = lang.t(LKey.contactSupport)) {
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(Config.SUPPORT_URL))
                ContextCompat.startActivity(context, intent, null)
            }
            ActionRow(text = lang.t(LKey.privacyPolicy)) {
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(Config.PRIVACY_URL))
                ContextCompat.startActivity(context, intent, null)
            }
            ActionRow(text = lang.t(LKey.eula)) {
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(Config.EULA_URL))
                ContextCompat.startActivity(context, intent, null)
            }
        }
    }
}

@Composable
private fun SectionTitle(text: String) {
    Text(
        text,
        fontSize = 13.sp,
        fontWeight = FontWeight.SemiBold,
        color = Color.White.copy(alpha = 0.5f),
        modifier = Modifier.padding(bottom = 6.dp),
    )
}

@Composable
private fun ActionRow(text: String, destructive: Boolean = false, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text,
            color = if (destructive) VPNTheme.Red else VPNTheme.Accent,
            fontSize = 15.sp,
        )
    }
}

@Composable
private fun DeviceRow(
    device: CoordinatorDevice,
    isCurrent: Boolean,
    revoking: Boolean,
    onRevoke: () -> Unit,
    lang: com.privatevpn.app.l10n.LanguageStore,
) {
    Column(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                device.name ?: device.deviceId,
                fontWeight = FontWeight.Medium,
                color = Color.White,
                fontSize = 14.sp,
                modifier = Modifier.weight(1f),
            )
            if (isCurrent) {
                Text(lang.t(LKey.thisDevice), fontSize = 11.sp, color = Color.White.copy(alpha = 0.6f))
            }
            if (device.isActive && !isCurrent) {
                Spacer(Modifier.width(8.dp))
                Button(
                    onClick = onRevoke,
                    enabled = !revoking,
                    colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent),
                    shape = RoundedCornerShape(8.dp),
                ) {
                    Text(lang.t(LKey.revoke), color = VPNTheme.Red, fontSize = 12.sp)
                }
            }
        }
        val parts = buildList {
            add(if (device.isActive) lang.t(LKey.active) else lang.t(LKey.revoked))
            device.assignedIp?.let { add(it) }
            device.platform?.let { add(it) }
        }
        Text(
            parts.joinToString(" · "),
            fontSize = 12.sp,
            color = if (device.isActive) VPNTheme.Accent else Color.White.copy(alpha = 0.6f),
        )
    }
}
