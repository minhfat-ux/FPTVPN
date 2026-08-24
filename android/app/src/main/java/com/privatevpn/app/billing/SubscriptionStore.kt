package com.privatevpn.app.billing

import android.app.Activity
import android.content.Context
import com.android.billingclient.api.AcknowledgePurchaseParams
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesResponseListener
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import com.privatevpn.app.BuildConfig
import com.privatevpn.app.Config
import com.privatevpn.app.auth.AuthSessionStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Google Play Billing + backend entitlement. Mirrors the iOS SubscriptionStore:
 *  - product IDs Monthly_Premium / Yearly_Premium
 *  - isSubscribed = backendPremium || Play entitlements
 *  - debug builds unlock Premium (matches iOS #if DEBUG)
 */
class SubscriptionStore(
    private val context: Context,
    private val authStore: AuthSessionStore,
) : PurchasesUpdatedListener {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    private val _products = MutableStateFlow<List<ProductDetails>>(emptyList())
    val products: StateFlow<List<ProductDetails>> = _products.asStateFlow()

    private val _purchasedProductIDs = MutableStateFlow<Set<String>>(emptySet())
    val purchasedProductIDs: StateFlow<Set<String>> = _purchasedProductIDs.asStateFlow()

    /** Backend entitlement: true when the signed-in account has an active subscription. */
    private val _backendPremium = MutableStateFlow(false)
    val backendPremium: StateFlow<Boolean> = _backendPremium.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage: StateFlow<String?> = _errorMessage.asStateFlow()

    @Volatile private var billingClient: BillingClient? = null
    @Volatile private var hasStarted = false

    val isSubscribed: Boolean
        get() {
            return if (BuildConfig.DEBUG) {
                true
            } else {
                _backendPremium.value || _purchasedProductIDs.value.any { it in Config.PRODUCT_IDS }
            }
        }

    fun syncBackendPremium() {
        _backendPremium.value = authStore.session.value?.user?.subscriptionStatus?.isActive ?: false
    }

    fun start() {
        if (hasStarted) return
        hasStarted = true
        val client = BillingClient.newBuilder(context)
            .setListener(this)
            .enablePendingPurchases()
            .build()
        billingClient = client
        client.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(result: BillingResult) {
                if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                    loadProducts()
                    refreshEntitlements()
                } else {
                    _errorMessage.value = "Cannot load plans. Please try again."
                }
            }

            override fun onBillingServiceDisconnected() {
                // Will retry on next start()/purchase.
            }
        })
    }

    fun loadProducts() {
        scope.launch {
            _isLoading.value = true
            val client = billingClient ?: run {
                _isLoading.value = false
                return@launch
            }
            val params = QueryProductDetailsParams.newBuilder()
                .setProductList(
                    Config.PRODUCT_IDS.map {
                        QueryProductDetailsParams.Product.newBuilder()
                            .setProductId(it)
                            .setProductType(BillingClient.ProductType.SUBS)
                            .build()
                    }
                )
                .build()
            client.queryProductDetailsAsync(params) { result, details ->
                scope.launch {
                    if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                        val sorted = details.orEmpty().sortedWith(
                            compareBy {
                                it.subscriptionOfferDetails?.firstOrNull()
                                    ?.pricingPhases?.pricingPhaseList?.firstOrNull()
                                    ?.priceAmountMicros ?: 0L
                            }
                        )
                        _products.value = sorted
                        _errorMessage.value = if (sorted.isEmpty())
                            "No Play products found. Check product IDs in Play Console." else null
                    } else {
                        _errorMessage.value = "Cannot load plans. Please try again."
                    }
                    _isLoading.value = false
                }
            }
        }
    }

    fun purchase(activity: Activity, product: ProductDetails) {
        val client = billingClient ?: run {
            _errorMessage.value = "Billing is not ready. Please try again."
            return
        }
        val offer = product.subscriptionOfferDetails?.firstOrNull()
        val params = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(
                listOf(
                    BillingFlowParams.ProductDetailsParams.newBuilder()
                        .setProductDetails(product)
                        .apply { offer?.let { setOfferToken(it.offerToken) } }
                        .build()
                )
            )
            .build()
        val result = client.launchBillingFlow(activity, params)
        if (result.responseCode != BillingClient.BillingResponseCode.OK &&
            result.responseCode != BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) {
            _errorMessage.value = "Purchase failed. Please try again."
        }
    }

    fun restorePurchases() {
        scope.launch {
            _isLoading.value = true
            refreshEntitlements()
            _errorMessage.value = if (isSubscribed) null else "No active Premium purchase was found."
            _isLoading.value = false
        }
    }

    fun refreshEntitlements() {
        val client = billingClient ?: return
        client.queryPurchasesAsync(
            QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build(),
            object : PurchasesResponseListener {
                override fun onQueryPurchasesResponse(billingResult: BillingResult, purchases: List<Purchase>) {
                    val active = purchases
                        .filter { it.purchaseState == Purchase.PurchaseState.PURCHASED }
                        .filter { it.products.any { p -> p in Config.PRODUCT_IDS } }
                        .map { it.products.first() }
                        .toSet()
                    _purchasedProductIDs.value = active
                    purchases
                        .filter { !it.isAcknowledged && it.purchaseState == Purchase.PurchaseState.PURCHASED }
                        .forEach { acknowledge(it) }
                }
            }
        )
    }

    private fun acknowledge(purchase: Purchase) {
        val params = AcknowledgePurchaseParams.newBuilder()
            .setPurchaseToken(purchase.purchaseToken)
            .build()
        billingClient?.acknowledgePurchase(params) { }
    }

    override fun onPurchasesUpdated(billingResult: BillingResult, purchases: List<Purchase>?) {
        when (billingResult.responseCode) {
            BillingClient.BillingResponseCode.OK -> {
                purchases?.filter { it.purchaseState == Purchase.PurchaseState.PURCHASED }?.forEach { acknowledge(it) }
                refreshEntitlements()
            }
            BillingClient.BillingResponseCode.USER_CANCELED -> { /* no-op */ }
            BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED -> refreshEntitlements()
            else -> _errorMessage.value = "Purchase failed. Please try again."
        }
    }
}
