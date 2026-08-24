package com.privatevpn.app.ui

import android.content.Intent
import android.net.Uri
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Wifi
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.android.billingclient.api.ProductDetails
import com.privatevpn.app.Config
import com.privatevpn.app.VPNFlowApp
import com.privatevpn.app.l10n.LKey
import com.privatevpn.app.theme.VPNTheme

/** Paywall — mirrors iOS PaywallView (close, benefits, monthly/yearly, restore, legal). */
@Composable
fun PaywallScreen(
    app: VPNFlowApp,
    onClose: () -> Unit,
    onUpgraded: () -> Unit,
) {
    val lang = app.languageStore
    val sub = app.subscriptionStore
    val context = LocalContext.current
    val products by sub.products.collectAsState()
    val isLoading by sub.isLoading.collectAsState()
    val errorMessage by sub.errorMessage.collectAsState()

    LaunchedEffect(Unit) { sub.start() }

    Box(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp)
                .padding(top = 28.dp, bottom = 34.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // Close (X)
            Row(modifier = Modifier.fillMaxWidth()) {
                IconButton(onClick = onClose, modifier = Modifier.align(Alignment.Top)) {
                    Icon(Icons.Default.Close, contentDescription = lang.t(LKey.notNow), tint = Color.White.copy(alpha = 0.7f))
                }
            }

            AppLogo(modifier = Modifier.size(76.dp))
            Text("VPNFlow Premium", fontSize = 28.sp, fontWeight = FontWeight.Bold, color = Color.White)
            Text(
                lang.t(LKey.paywallSubtitle),
                fontSize = 15.sp,
                color = Color.White.copy(alpha = 0.65f),
                textAlign = TextAlign.Center,
            )

            // Benefits
            CardContainer {
                BenefitRow(Icons.Default.Shield, lang.t(LKey.benefitTunnel))
                BenefitRow(Icons.Default.Wifi, lang.t(LKey.benefitWifi))
                BenefitRow(Icons.Default.Bolt, lang.t(LKey.benefitFast))
            }

            // Plans
            CardContainer {
                if (isLoading && products.isEmpty()) {
                    CircularProgressIndicator(
                        modifier = Modifier.padding(vertical = 24.dp).align(Alignment.CenterHorizontally),
                        color = VPNTheme.Accent,
                    )
                }
                products.forEach { product ->
                    PlanRow(
                        product = product,
                        enabled = !isLoading,
                        onClick = { sub.purchase(context as android.app.Activity, product) },
                    )
                }
                if (products.isEmpty() && !isLoading) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth().padding(vertical = 16.dp)) {
                        Text(lang.t(LKey.noPlans), fontWeight = FontWeight.Bold, color = Color.White)
                        Text(
                            lang.t(LKey.noPlansDetail),
                            fontSize = 13.sp,
                            color = Color.White.copy(alpha = 0.6f),
                            textAlign = TextAlign.Center,
                        )
                    }
                }
                errorMessage?.let {
                    Text(it, color = VPNTheme.Orange, fontSize = 13.sp, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 4.dp))
                }
            }

            // Restore
            Button(
                onClick = { sub.restorePurchases() },
                enabled = !isLoading,
                colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent),
            ) {
                Text(lang.t(LKey.restorePurchases), color = VPNTheme.Accent, fontWeight = FontWeight.Bold)
            }

            // Legal links
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.Center,
            ) {
                LegalLink(lang.t(LKey.privacy), Config.PRIVACY_URL)
                Spacer(Modifier.width(14.dp))
                LegalLink(lang.t(LKey.support), Config.SUPPORT_URL)
                Spacer(Modifier.width(14.dp))
                LegalLink(lang.t(LKey.eula), Config.EULA_URL)
            }

            Text(
                lang.t(LKey.subscriptionDisclosure),
                fontSize = 12.sp,
                color = Color.White.copy(alpha = 0.55f),
                textAlign = TextAlign.Center,
            )

            Text(
                lang.t(LKey.notNow),
                color = Color.White.copy(alpha = 0.55f),
                fontSize = 14.sp,
                modifier = Modifier
                    .padding(top = 4.dp)
                    .clickableText(onClose),
            )
        }
    }
}

@Composable
private fun BenefitRow(icon: ImageVector, title: String) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = VPNTheme.Accent, modifier = Modifier.size(22.dp))
        Spacer(Modifier.width(12.dp))
        Text(title, fontWeight = FontWeight.Bold, color = Color.White)
    }
}

@Composable
private fun PlanRow(product: ProductDetails, enabled: Boolean, onClick: () -> Unit) {
    val price = product.subscriptionOfferDetails?.firstOrNull()?.pricingPhases?.pricingPhaseList
        ?.firstOrNull()?.formattedPrice ?: "—"
    val name = product.subscriptionOfferDetails?.firstOrNull()?.pricingPhases?.pricingPhaseList
        ?.firstOrNull()?.billingPeriod?.let { periodName(it) } ?: product.name
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
        shape = RoundedCornerShape(16.dp),
        colors = ButtonDefaults.buttonColors(containerColor = Color.White.copy(alpha = 0.08f)),
    ) {
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(name, fontWeight = FontWeight.Bold, color = Color.White)
                Text(product.title, fontSize = 12.sp, color = Color.White.copy(alpha = 0.58f), maxLines = 1)
            }
            Text(
                price,
                color = Color.Black,
                fontWeight = FontWeight.Bold,
                modifier = Modifier
                    .background(VPNTheme.Accent, CircleShape)
                    .padding(horizontal = 14.dp, vertical = 9.dp),
            )
        }
    }
}

private fun periodName(billingPeriod: String): String = when (billingPeriod) {
    "P1M" -> "Monthly"
    "P1Y" -> "Yearly"
    else -> billingPeriod
}

@Composable
private fun LegalLink(text: String, url: String) {
    val context = LocalContext.current
    Text(
        text,
        color = Color.White.copy(alpha = 0.65f),
        fontSize = 13.sp,
        modifier = Modifier.clickableText {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
            ContextCompat.startActivity(context, intent, null)
        },
    )
}

private fun Modifier.clickableText(onClick: () -> Unit): Modifier =
    this.clickable(onClick = onClick, interactionSource = androidx.compose.foundation.interaction.MutableInteractionSource(), indication = null)
