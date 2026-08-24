package com.privatevpn.app.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Circle
import androidx.compose.material.icons.filled.WorkspacePremium
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.State
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.privatevpn.app.VPNFlowApp
import com.privatevpn.app.api.ExitNode
import com.privatevpn.app.l10n.LKey
import com.privatevpn.app.theme.VPNState
import com.privatevpn.app.theme.VPNTheme

/** Main screen: one-tap Connect/Disconnect, server list, diagnostics. Mirrors iOS ContentView. */
@Composable
fun MainScreen(
    app: VPNFlowApp,
    onOpenSettings: () -> Unit,
    onShowPaywall: () -> Unit,
    onShowLogin: () -> Unit,
) {
    val lang = app.languageStore
    val vpn = app.vpnManager
    val sub = app.subscriptionStore

    val state by vpn.state.collectAsState()
    val nodes by vpn.remoteNodes.collectAsState()
    val selectedId by vpn.selectedNodeID.collectAsState()
    val usingFallback by vpn.usingFallbackNodes.collectAsState()
    val statusMessage by vpn.statusMessage.collectAsState()
    val isSubscribed by rememberIsSubscribed(sub)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp)
            .padding(top = 10.dp, bottom = 28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        // Settings gear (top-right) — simple row with spacer.
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.End,
        ) {
            IconButton(onClick = onOpenSettings, enabled = !state.isTransitioning) {
                Icon(
                    Icons.Default.Settings,
                    contentDescription = lang.t(LKey.configuration),
                    tint = Color.White.copy(alpha = 0.8f),
                )
            }
        }

        Header(app = app, state = state, isSubscribed = isSubscribed)

        Spacer(Modifier.height(20.dp))

        ServerCard(
            app = app,
            nodes = nodes,
            selectedId = selectedId,
            usingFallback = usingFallback,
            busy = state.isTransitioning,
            onSelect = { vpn.selectNode(it) },
            onRefresh = { vpn.fetchNodes() },
        )

        Spacer(Modifier.height(16.dp))

        if (state.isTransitioning) {
            PreparingBanner(text = lang.t(LKey.preparingPermission))
            Spacer(Modifier.height(16.dp))
        }

        PowerButton(
            app = app,
            state = state,
            isSubscribed = isSubscribed,
            isSignedIn = app.authStore.isSignedIn,
            onConnect = {
                when {
                    state.canDisconnect -> vpn.disconnect()
                    !isSubscribed -> onShowPaywall()
                    !app.authStore.isSignedIn -> onShowLogin()
                    else -> vpn.connect()
                }
            },
        )

        if (state == VPNState.FAILED) {
            Spacer(Modifier.height(16.dp))
            ErrorBanner(statusMessage ?: lang.t(LKey.vpnStartFailure))
        }

        Spacer(Modifier.height(16.dp))

        DiagnosticsCard(app = app, state = state, statusMessage = statusMessage)

        Spacer(Modifier.height(16.dp))

        if (!isSubscribed) {
            SubscriptionStatusCard(
                app = app,
                onUpgrade = onShowPaywall,
            )
        }
    }
}

@Composable
fun rememberIsSubscribed(sub: com.privatevpn.app.billing.SubscriptionStore): androidx.compose.runtime.State<Boolean> {
    val backendPremium by sub.backendPremium.collectAsState()
    val purchased by sub.purchasedProductIDs.collectAsState()
    val isSubscribed = remember(backendPremium, purchased) {
        sub.isSubscribed
    }
    return androidx.compose.runtime.rememberUpdatedState(isSubscribed)
}

/** Header: logo + crown badge + status dot + title + subtitle. */
@Composable
private fun Header(
    app: VPNFlowApp,
    state: VPNState,
    isSubscribed: Boolean,
) {
    val lang = app.languageStore
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(top = 14.dp)) {
        Box(contentAlignment = Alignment.TopStart) {
            AppLogo(modifier = Modifier.size(76.dp))
            if (isSubscribed) {
                Icon(
                    Icons.Default.WorkspacePremium,
                    contentDescription = null,
                    tint = VPNTheme.Yellow,
                    modifier = Modifier
                        .size(20.dp)
                        .padding(0.dp)
                        .align(Alignment.TopStart)
                )
            }
        }

        Spacer(Modifier.height(6.dp))

        // Status dot + label under the logo.
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
            Box(
                Modifier
                    .size(8.dp)
                    .clip(CircleShape)
                    .background(stateColor(state))
            )
            Text(
                lang.stateLabel(state),
                color = stateColor(state),
                fontSize = 12.sp,
            )
        }

        Spacer(Modifier.height(4.dp))

        Text("VPNFlow", fontSize = 26.sp, fontWeight = FontWeight.Bold, color = Color.White)
        Text(
            lang.t(LKey.appSubtitle),
            fontSize = 15.sp,
            color = Color.White.copy(alpha = 0.6f),
            textAlign = TextAlign.Center,
        )
    }
}

private fun stateColor(state: VPNState): Color = when (state) {
    VPNState.DISCONNECTED -> Color.White.copy(alpha = 0.55f)
    VPNState.CONNECTING, VPNState.DISCONNECTING -> VPNTheme.Orange
    VPNState.CONNECTED -> VPNTheme.Accent
    VPNState.FAILED -> VPNTheme.Red
}

@Composable
private fun ServerCard(
    app: VPNFlowApp,
    nodes: List<ExitNode>,
    selectedId: String?,
    usingFallback: Boolean,
    busy: Boolean,
    onSelect: (String) -> Unit,
    onRefresh: () -> Unit,
) {
    val lang = app.languageStore
    CardContainer {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                lang.t(LKey.serverLocation),
                style = MaterialTheme.typography.titleMedium,
                color = Color.White,
            )
            Spacer(Modifier.weight(1f))
            IconButton(onClick = onRefresh, enabled = !busy) {
                Icon(
                    Icons.Default.Refresh,
                    contentDescription = lang.t(LKey.refreshLocations),
                    tint = Color.White.copy(alpha = 0.7f),
                )
            }
        }

        if (nodes.isEmpty()) {
            Text(
                lang.t(LKey.loadingLocations),
                color = Color.White.copy(alpha = 0.6f),
                modifier = Modifier.padding(vertical = 8.dp),
            )
        } else {
            LazyColumn(modifier = Modifier.heightIn(max = 220.dp)) {
                items(nodes, key = { it.id }) { node ->
                    ServerRow(
                        node = node,
                        isSelected = node.id == selectedId,
                        busy = busy,
                        onSelect = { onSelect(node.id) },
                        lang = lang,
                    )
                }
            }
            if (usingFallback) {
                Text(
                    lang.t(LKey.usingSavedServers),
                    color = VPNTheme.Orange,
                    fontSize = 12.sp,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
        }
    }
}

@Composable
private fun ServerRow(
    node: ExitNode,
    isSelected: Boolean,
    busy: Boolean,
    onSelect: () -> Unit,
    lang: com.privatevpn.app.l10n.LanguageStore,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp, horizontal = 6.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(if (isSelected) VPNTheme.Accent.copy(alpha = 0.15f) else Color.White.copy(alpha = 0.04f))
            .padding(horizontal = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            if (isSelected) Icons.Default.CheckCircle else Icons.Default.Circle,
            contentDescription = null,
            tint = if (isSelected) VPNTheme.Accent else Color.White.copy(alpha = 0.4f),
            modifier = Modifier.size(18.dp),
        )
        Spacer(Modifier.width(8.dp))
        Text(
            serverTitle(node, lang),
            fontSize = 14.sp,
            maxLines = 1,
            color = Color.White,
            modifier = Modifier.weight(1f),
        )
        Spacer(Modifier.width(8.dp))
        Text(
            lang.t(LKey.select),
            color = VPNTheme.Accent,
            fontWeight = FontWeight.Bold,
            fontSize = 13.sp,
            modifier = Modifier
                .clip(RoundedCornerShape(6.dp))
                .background(if (isSelected) Color.Transparent else Color.Transparent)
                .padding(6.dp),
        )
    }
}

private fun serverTitle(node: ExitNode, lang: com.privatevpn.app.l10n.LanguageStore): String {
    val flag = flagEmoji(node.country)
    val country = if (node.country == "VN") lang.t(LKey.vietnam) else node.country
    return "$flag ${node.city}, $country · ${node.name}"
}

private fun flagEmoji(countryCode: String): String {
    val base = 0x1F1E6
    return countryCode.uppercase().map { c ->
        String(Character.toChars(base + (c.code - 'A'.code)))
    }.joinToString("")
}

@Composable
private fun PreparingBanner(text: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 12.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(VPNTheme.CardBackground)
            .padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        CircularProgressIndicator(
            modifier = Modifier.size(18.dp),
            color = VPNTheme.Accent,
            strokeWidth = 2.dp,
        )
        Text(text, color = Color.White.copy(alpha = 0.75f), fontSize = 13.sp)
    }
}

@Composable
private fun PowerButton(
    app: VPNFlowApp,
    state: VPNState,
    isSubscribed: Boolean,
    isSignedIn: Boolean,
    onConnect: () -> Unit,
) {
    val disabled = when (state) {
        VPNState.DISCONNECTING, VPNState.CONNECTING -> true
        VPNState.CONNECTED -> false
        VPNState.DISCONNECTED, VPNState.FAILED -> false // always allow: control plane provisions
    }
    val color = when (state) {
        VPNState.CONNECTED -> VPNTheme.Accent
        VPNState.CONNECTING, VPNState.DISCONNECTING -> VPNTheme.Orange
        VPNState.DISCONNECTED, VPNState.FAILED -> VPNTheme.Red
    }

    Box(
        modifier = Modifier
            .size(132.dp)
            .clip(CircleShape)
            .background(color.copy(alpha = if (disabled) 0.45f else 1f))
            .clickable(enabled = !disabled, onClick = onConnect),
        contentAlignment = Alignment.Center,
    ) {
        if (state.isTransitioning) {
            CircularProgressIndicator(
                modifier = Modifier.size(44.dp),
                color = Color.White,
                strokeWidth = 4.dp,
            )
        } else {
            Text(
                "⏻",
                fontSize = 44.sp,
                color = Color.White,
            )
        }
    }
}

@Composable
private fun ErrorBanner(message: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(VPNTheme.Red.copy(alpha = 0.15f))
            .padding(14.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Icon(
            Icons.Default.Warning,
            contentDescription = null,
            tint = VPNTheme.Red,
        )
        Spacer(Modifier.width(10.dp))
        Text(
            message,
            color = Color.White.copy(alpha = 0.9f),
            fontSize = 13.sp,
        )
    }
}

@Composable
private fun DiagnosticsCard(
    app: VPNFlowApp,
    state: VPNState,
    statusMessage: String?,
) {
    val lang = app.languageStore
    val vpn = app.vpnManager
    CardContainer {
        Text(
            lang.t(LKey.diagnostics),
            style = MaterialTheme.typography.titleMedium,
            color = Color.White,
        )
        Spacer(Modifier.height(10.dp))
        DiagRow(lang.t(LKey.state), lang.stateLabel(state), stateColor(state))
        DiagRow(lang.t(LKey.location), nodeDisplay(vpn.selectedNode), Color.White.copy(alpha = 0.85f))
        statusMessage?.let {
            DiagRow(lang.t(LKey.message), it, Color.White.copy(alpha = 0.85f))
        }
    }
}

private fun nodeDisplay(node: com.privatevpn.app.api.ExitNode?): String =
    node?.let { "${it.city}, ${it.country}" } ?: "—"

@Composable
private fun DiagRow(title: String, value: String, valueColor: Color) {
    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Text(title, color = Color.White.copy(alpha = 0.55f), fontSize = 14.sp)
        Spacer(Modifier.weight(1f))
        Text(value, color = valueColor, fontSize = 14.sp, textAlign = TextAlign.End)
    }
}

@Composable
private fun SubscriptionStatusCard(
    app: VPNFlowApp,
    onUpgrade: () -> Unit,
) {
    val lang = app.languageStore
    CardContainer {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(
                    lang.t(LKey.premiumRequired),
                    style = MaterialTheme.typography.titleMedium,
                    color = Color.White,
                )
                Text(
                    lang.t(LKey.choosePlanToStart),
                    fontSize = 14.sp,
                    color = Color.White.copy(alpha = 0.6f),
                )
            }
            Button(
                onClick = onUpgrade,
                colors = ButtonDefaults.buttonColors(containerColor = VPNTheme.Accent),
                shape = RoundedCornerShape(50),
            ) {
                Text(lang.t(LKey.upgrade), color = Color.Black, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
fun CardContainer(content: @Composable () -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = VPNTheme.CardBackground,
        border = BorderStroke(1.dp, VPNTheme.CardStroke),
    ) {
        Column(Modifier.padding(16.dp)) { content() }
    }
}

@Composable
fun AppLogo(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(18.dp))
            .background(Color(0xFF0E2A4A)),
        contentAlignment = Alignment.Center,
    ) {
        Text("VPN", color = VPNTheme.Accent, fontWeight = FontWeight.Bold, fontSize = 22.sp)
    }
}
