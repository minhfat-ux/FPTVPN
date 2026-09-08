package com.privatevpn.app.ui

import android.annotation.SuppressLint
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.privatevpn.app.Config
import com.privatevpn.app.VPNFlowApp
import com.privatevpn.app.l10n.LKey
import com.privatevpn.app.theme.VPNTheme

/**
 * Paywall — mirrors iOS PaywallView and macOS MacPaywallView: a header bar with
 * title + close, and a WebView that loads the web buy page (meetflowai.site/buy).
 * The buy page handles plan selection and payment (bank QR / WeChat / Alipay);
 * Premium is activated server-side on the signed-in account, so the app only
 * needs to re-sync its session after the user pays.
 */
@Composable
fun PaywallScreen(
    app: VPNFlowApp,
    onClose: () -> Unit,
    onUpgraded: () -> Unit,
) {
    val lang = app.languageStore

    Column(modifier = Modifier.fillMaxSize().background(VPNTheme.backgroundGradient)) {
        // Header bar: title + close
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(VPNTheme.BackgroundTop)
                .padding(horizontal = 8.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onClose) {
                Icon(
                    Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = lang.t(LKey.notNow),
                    tint = VPNTheme.SecondaryLabel,
                )
            }
            Spacer(Modifier.width(2.dp))
            Text(
                lang.t(LKey.paywallTitle),
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                color = VPNTheme.Label,
            )
            Spacer(Modifier.weight(1f))
            Text(
                lang.t(LKey.notNow),
                fontSize = 14.sp,
                color = VPNTheme.SecondaryLabel,
                modifier = Modifier
                    .padding(horizontal = 12.dp, vertical = 8.dp)
                    .androidClickable { onClose() },
            )
        }

        // The buy page handles plans, payment and invoice delivery. Localize
        // the paywall to the in-app language via ?lang= (mirrors iOS/macOS).
        BuyWebView(
            url = Config.BUY_URL + "?lang=" + lang.language.code,
            modifier = Modifier.fillMaxSize(),
        )
    }
}

/** Minimal Android WebView wrapper that loads the web buy page. */
@Composable
private fun BuyWebView(url: String, modifier: Modifier = Modifier) {
    AndroidView(
        factory = { ctx ->
            WebView(ctx).apply {
                @SuppressLint("SetJavaScriptEnabled")
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                setBackgroundColor(Color.Transparent.toArgb())
                webViewClient = WebViewClient()
                loadUrl(url)
            }
        },
        modifier = modifier,
    )
}

private fun Modifier.androidClickable(onClick: () -> Unit): Modifier = this.clickable(
    onClick = onClick,
    interactionSource = MutableInteractionSource(),
    indication = null,
)
