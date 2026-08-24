package com.privatevpn.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.privatevpn.app.VPNFlowApp
import com.privatevpn.app.api.ControlAPIClient
import com.privatevpn.app.l10n.LKey
import com.privatevpn.app.theme.VPNTheme
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/** Dedicated email-code sign-in screen (mirrors iOS LoginView). */
@Composable
fun LoginScreen(
    app: VPNFlowApp,
    onDismiss: () -> Unit,
    onSignedIn: () -> Unit,
) {
    val lang = app.languageStore
    var email by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var codeRequested by remember { mutableStateOf(false) }
    var isSending by remember { mutableStateOf(false) }
    var isVerifying by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<Pair<Boolean, String>?>(null) } // isError, text
    val scope = remember { CoroutineScope(Dispatchers.Main) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp)
            .padding(top = 40.dp, bottom = 28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        AppLogo(modifier = Modifier.size(76.dp))
        Spacer(Modifier.height(10.dp))
        Text("VPNFlow", fontSize = 30.sp, fontWeight = FontWeight.Bold, color = Color.White)
        Text(
            lang.t(LKey.appSubtitle),
            fontSize = 15.sp,
            color = Color.White.copy(alpha = 0.6f),
            textAlign = TextAlign.Center,
        )

        Spacer(Modifier.height(22.dp))

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(VPNTheme.CardBackground, RoundedCornerShape(20.dp))
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            LabeledField(label = lang.t(LKey.email)) {
                OutlinedTextField(
                    value = email,
                    onValueChange = { email = it },
                    placeholder = { Text(lang.t(LKey.emailPlaceholder)) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                    modifier = Modifier.fillMaxWidth(),
                    colors = fieldColors(),
                )
            }

            SendCodeButton(
                enabled = !isSending && !isVerifying && email.isNotBlank(),
                loading = isSending,
                text = lang.t(LKey.sendCode),
                onClick = {
                    val trimmed = email.trim()
                    if (!trimmed.contains("@") || !trimmed.contains(".")) {
                        message = true to lang.t(LKey.invalidEmail)
                        return@SendCodeButton
                    }
                    isSending = true
                    message = null
                    scope.launch {
                        try {
                            val debugCode = ControlAPIClient().startEmailLogin(trimmed)
                            codeRequested = true
                            message = false to (debugCode?.let {
                                lang.t(LKey.devCode).replace("%s", it)
                            } ?: lang.t(LKey.loginCodeSent))
                        } catch (e: Exception) {
                            message = true to (e.message ?: "Error")
                        }
                        isSending = false
                    }
                },
            )

            if (codeRequested) {
                LabeledField(label = lang.t(LKey.loginCode)) {
                    OutlinedTextField(
                        value = code,
                        onValueChange = { code = it },
                        placeholder = { Text(lang.t(LKey.codePlaceholder)) },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.fillMaxWidth(),
                        colors = fieldColors(),
                    )
                }

                SendCodeButton(
                    enabled = !isVerifying && !isSending && email.isNotBlank() && code.isNotBlank(),
                    loading = isVerifying,
                    text = lang.t(LKey.verifyCode),
                    onClick = {
                        val trimmed = email.trim()
                        isVerifying = true
                        message = null
                        scope.launch {
                            try {
                                val session = ControlAPIClient().verifyEmailLogin(trimmed, code.trim())
                                app.authStore.save(session)
                                email = ""
                                code = ""
                                codeRequested = false
                                if (app.authStore.isSignedIn) {
                                    onSignedIn()
                                }
                            } catch (e: Exception) {
                                message = true to (e.message ?: "Error")
                            }
                            isVerifying = false
                        }
                    },
                )
            }
        }

        message?.let { (isError, text) ->
            Spacer(Modifier.height(16.dp))
            MessageBanner(isError = isError, text = text)
        }
    }
}

@Composable
private fun LabeledField(label: String, content: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(label, fontSize = 14.sp, color = Color.White.copy(alpha = 0.6f))
        content()
    }
}

@Composable
private fun fieldColors() = OutlinedTextFieldDefaults.colors(
    focusedBorderColor = VPNTheme.Accent.copy(alpha = 0.6f),
    unfocusedBorderColor = Color.White.copy(alpha = 0.15f),
    focusedTextColor = Color.White,
    unfocusedTextColor = Color.White,
    cursorColor = VPNTheme.Accent,
    focusedPlaceholderColor = Color.White.copy(alpha = 0.4f),
    unfocusedPlaceholderColor = Color.White.copy(alpha = 0.4f),
)

@Composable
private fun SendCodeButton(
    enabled: Boolean,
    loading: Boolean,
    text: String,
    onClick: () -> Unit,
) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = if (loading) VPNTheme.Accent.copy(alpha = 0.6f) else VPNTheme.Accent,
            contentColor = Color.Black,
        ),
    ) {
        if (loading) {
            CircularProgressIndicator(modifier = Modifier.size(18.dp), color = Color.Black, strokeWidth = 2.dp)
        } else {
            Text(text, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun MessageBanner(isError: Boolean, text: String) {
    val color = if (isError) VPNTheme.Red else VPNTheme.Accent
    androidx.compose.foundation.layout.Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(color.copy(alpha = 0.15f), RoundedCornerShape(14.dp))
            .padding(14.dp),
    ) {
        Icon(
            if (isError) Icons.Default.Warning else Icons.Default.Info,
            contentDescription = null,
            tint = if (isError) VPNTheme.Red else VPNTheme.Accent,
        )
        Spacer(Modifier.height(0.dp))
        Text(
            text,
            color = if (isError) VPNTheme.Red else Color.White.copy(alpha = 0.9f),
            fontSize = 13.sp,
            modifier = Modifier.padding(start = 10.dp),
        )
    }
}
