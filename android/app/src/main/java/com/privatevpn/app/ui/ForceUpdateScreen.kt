package com.privatevpn.app.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.privatevpn.app.api.AppVersionInfo
import com.privatevpn.app.l10n.LKey
import com.privatevpn.app.l10n.LanguageStore
import com.privatevpn.app.theme.VPNTheme

/** Force-update gate — mirrors iOS ForceUpdateView. */
@Composable
fun ForceUpdateScreen(info: AppVersionInfo, lang: LanguageStore) {
    val context = LocalContext.current
    Column(
        modifier = Modifier.fillMaxSize().padding(horizontal = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = androidx.compose.foundation.layout.Arrangement.Center,
    ) {
        AppLogo(modifier = Modifier.size(76.dp))
        Spacer(Modifier.height(20.dp))
        Text(lang.t(LKey.updateRequired), fontSize = 24.sp, fontWeight = FontWeight.Bold, color = Color.White)
        Spacer(Modifier.height(10.dp))
        Text(
            lang.t(LKey.updateRequiredDetail),
            fontSize = 15.sp,
            color = Color.White.copy(alpha = 0.65f),
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(24.dp))
        Button(
            onClick = {
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(info.storeUrl))
                ContextCompat.startActivity(context, intent, null)
            },
            shape = RoundedCornerShape(14.dp),
            colors = ButtonDefaults.buttonColors(containerColor = VPNTheme.Accent),
        ) {
            Text(lang.t(LKey.update), color = Color.Black, fontWeight = FontWeight.Bold)
        }
    }
}
