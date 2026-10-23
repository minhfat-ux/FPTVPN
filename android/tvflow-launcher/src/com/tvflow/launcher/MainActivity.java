package com.tvflow.launcher;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Color;
import android.graphics.drawable.Drawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * TVFlow Home — launcher kiểu Android TV.
 * Framework views only (no AndroidX) để APK nhỏ và build offline được.
 *
 * Sắp xếp app: A→Z, Z→A, Tự chọn (giữ OK trên một card để vào chế độ di chuyển).
 */
public class MainActivity extends Activity {

    private static final String EXCLUDE_SELF = "com.tvflow.launcher";
    private static final String EXCLUDE_STOCK = "com.mitv.tvhome";

    private static final int SORT_AZ = 0;
    private static final int SORT_ZA = 1;
    private static final int SORT_CUSTOM = 2;

    private static final String PREFS = "tvflow_home";
    private static final String KEY_SORT = "sort_mode";
    private static final String KEY_ORDER = "custom_order";
    private static final String KEY_LANG = "lang";

    private static final int LANG_VI = 0;
    private static final int LANG_EN = 1;
    private static final int LANG_ZH = 2;

    private LinearLayout rowApps;
    private LinearLayout rowShortcuts;
    private TextView clock;
    private TextView date;
    private TextView sortLabel;
    private View sortCard;
    private final Handler handler = new Handler(Looper.getMainLooper());

    private int sortMode = SORT_AZ;
    private int lang = LANG_VI;
    private final List<String> customOrder = new ArrayList<>();
    private final Map<String, View> appCards = new HashMap<>();

    private View movingCard;
    private String movingPkg;
    private boolean swallowFirstCenterUp;
    private long pressDownAt = 0L;
    private View pressCard = null;

    /** Bỏ qua HomeGuard trong khoảng này (ms) — dùng khi người dùng chủ động mở Launcher Xiaomi. */
    public static volatile long guardBypassUntil = 0L;

    private final Runnable tick = new Runnable() {
        @Override public void run() {
            updateClock();
            handler.postDelayed(this, 30_000L);
        }
    };

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        clock = findViewById(R.id.clock);
        date = findViewById(R.id.date);
        rowApps = findViewById(R.id.rowApps);
        rowShortcuts = findViewById(R.id.rowShortcuts);

        loadPrefs();
        applyTexts();
        updateClock();
        buildAppRow();
        buildShortcutRow();
        wireFocus();
    }

    private void startHomeGuard() {
        try {
            Intent i = new Intent(this, HomeGuardService.class);
            if (android.os.Build.VERSION.SDK_INT >= 26) {
                startForegroundService(i);
            } else {
                startService(i);
            }
        } catch (Exception ignored) { }
    }

    @Override protected void onResume() {
        super.onResume();
        startHomeGuard();
        updateClock();
        handler.removeCallbacks(tick);
        handler.post(tick);
        // dựng lại danh sách: app cài/bật sau khi launcher đang chạy vẫn phải hiện
        buildAppRow();
        buildShortcutRow();
        wireFocus();
        rowApps.post(new Runnable() {
            @Override public void run() {
                if (rowApps.getChildCount() > 0) rowApps.getChildAt(0).requestFocus();
            }
        });
    }

    @Override protected void onPause() {
        super.onPause();
        handler.removeCallbacks(tick);
    }

    @Override public void onBackPressed() {
        // Launcher không thoát bằng Back. Nếu đang di chuyển thì thoát chế độ đó.
        if (movingCard != null) exitMoveMode();
    }

    // --------------------------------------------------------------- prefs
    private void loadPrefs() {
        SharedPreferences sp = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        sortMode = sp.getInt(KEY_SORT, SORT_AZ);
        lang = sp.getInt(KEY_LANG, LANG_VI);
        customOrder.clear();
        String raw = sp.getString(KEY_ORDER, "");
        if (raw != null && raw.length() > 0) {
            for (String s : raw.split("\n")) {
                if (s.trim().length() > 0) customOrder.add(s.trim());
            }
        }
    }

    private void savePrefs() {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < customOrder.size(); i++) {
            if (i > 0) sb.append('\n');
            sb.append(customOrder.get(i));
        }
        getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putInt(KEY_SORT, sortMode)
                .putInt(KEY_LANG, lang)
                .putString(KEY_ORDER, sb.toString())
                .apply();
    }

    // ----------------------------------------------------------------- i18n
    private String t(String vi, String en, String zh) {
        if (lang == LANG_EN) return en;
        if (lang == LANG_ZH) return zh;
        return vi;
    }

    private String langName() {
        if (lang == LANG_EN) return "English";
        if (lang == LANG_ZH) return "中文";
        return "Tiếng Việt";
    }

    private String langLabel() {
        return t("Ngôn ngữ", "Language", "语言") + ": " + langName();
    }

    private void applyTexts() {
        TextView appsLabel = findViewById(R.id.appsLabel);
        if (appsLabel != null) appsLabel.setText(t("Ứng dụng", "APPS", "应用"));
        TextView shortcutsLabel = findViewById(R.id.shortcutsLabel);
        if (shortcutsLabel != null) shortcutsLabel.setText(t("Lối tắt", "SHORTCUTS", "快捷方式"));
        TextView hint = findViewById(R.id.hintSort);
        if (hint != null) {
            hint.setText(t("Giữ OK trên app để sắp xếp",
                    "Hold OK on an app to reorder", "长按 OK 排序"));
        }
    }

    // ------------------------------------------------------------------ clock
    private void updateClock() {
        Date now = new Date();
        clock.setText(new SimpleDateFormat("HH:mm", Locale.getDefault()).format(now));
        Locale loc = lang == LANG_EN ? Locale.ENGLISH
                : lang == LANG_ZH ? Locale.SIMPLIFIED_CHINESE
                : new Locale("vi", "VN");
        date.setText(new SimpleDateFormat("EEEE, d MMMM", loc).format(now));
    }

    // -------------------------------------------------------------- app row
    private void buildAppRow() {
        rowApps.removeAllViews();
        appCards.clear();

        PackageManager pm = getPackageManager();
        LinkedHashMap<String, ResolveInfo> unique = new LinkedHashMap<>();
        addResolved(pm, unique, Intent.CATEGORY_LEANBACK_LAUNCHER);
        addResolved(pm, unique, Intent.CATEGORY_LAUNCHER);

        List<ResolveInfo> apps = new ArrayList<>();
        for (ResolveInfo ri : unique.values()) {
            String pkg = ri.activityInfo.packageName;
            if (EXCLUDE_SELF.equals(pkg) || EXCLUDE_STOCK.equals(pkg)) continue;
            apps.add(ri);
        }

        // sort theo chế độ
        if (sortMode == SORT_ZA) {
            apps.sort((a, b) -> String.CASE_INSENSITIVE_ORDER.compare(
                    b.loadLabel(pm).toString(), a.loadLabel(pm).toString()));
        } else if (sortMode == SORT_CUSTOM) {
            apps.sort((a, b) -> {
                int ia = customOrder.indexOf(a.activityInfo.packageName);
                int ib = customOrder.indexOf(b.activityInfo.packageName);
                if (ia < 0 && ib < 0) return String.CASE_INSENSITIVE_ORDER.compare(
                        a.loadLabel(pm).toString(), b.loadLabel(pm).toString());
                if (ia < 0) return 1;
                if (ib < 0) return -1;
                return Integer.compare(ia, ib);
            });
        } else {
            apps.sort((a, b) -> String.CASE_INSENSITIVE_ORDER.compare(
                    a.loadLabel(pm).toString(), b.loadLabel(pm).toString()));
        }

        if (sortMode == SORT_CUSTOM && customOrder.isEmpty()) {
            for (ResolveInfo ri : apps) customOrder.add(ri.activityInfo.packageName);
            savePrefs();
        }

        java.util.Set<String> seenLabels = new java.util.HashSet<>();
        for (final ResolveInfo ri : apps) {
            final String pkg = ri.activityInfo.packageName;
            final String lbl = ri.loadLabel(pm).toString();
            // nhiều package cùng tên (vd 2 app Settings) -> chỉ hiện 1
            if (!seenLabels.add(lbl.toLowerCase(Locale.getDefault()))) continue;
            View card = addCard(rowApps, lbl, ri.loadIcon(pm),
                    new View.OnClickListener() {
                        @Override public void onClick(View v) { launch(ri); }
                    });
            card.setTag(pkg);
            card.setOnLongClickListener(new View.OnLongClickListener() {
                @Override public boolean onLongClick(View v) {
                    enterMoveMode(v, pkg);
                    return true;
                }
            });
            appCards.put(pkg, card);
        }
    }

    private void addResolved(PackageManager pm, LinkedHashMap<String, ResolveInfo> out, String category) {
        Intent intent = new Intent(Intent.ACTION_MAIN).addCategory(category);
        List<ResolveInfo> list;
        try {
            list = pm.queryIntentActivities(intent, 0);
        } catch (Exception e) {
            return;
        }
        for (ResolveInfo ri : list) {
            String pkg = ri.activityInfo.packageName;
            if (!out.containsKey(pkg)) out.put(pkg, ri);
        }
    }

    // ---------------------------------------------------------- shortcut row
    private void buildShortcutRow() {
        rowShortcuts.removeAllViews();

        addShortcut("net.fptplay.ottbox", "FPT Play", 0xFFF26F21);
        // Settings đã nằm trong hàng ỨNG DỤNG -> không thêm shortcut trùng

        if (isInstalled("com.google.android.youtube.tv")) {
            addShortcut("com.google.android.youtube.tv", "YouTube", 0xFFFF0000);
        } else if (isInstalled("com.google.android.youtube")) {
            addShortcut("com.google.android.youtube", "YouTube", 0xFFFF0000);
        }

        addLangShortcut();
        addInputShortcut();
        addSortShortcut();
        addStockLauncherShortcut();
    }

    /** Card đổi chế độ sắp xếp: A→Z → Z→A → Tự chọn. */
    private void addSortShortcut() {
        View card = addCard(rowShortcuts, sortModeLabel(), getDrawable(R.drawable.ic_sort),
                new View.OnClickListener() {
                    @Override public void onClick(View v) { cycleSort(); }
                });
        TextView label = (TextView) ((ViewGroup) card).getChildAt(1);
        if (label != null) sortLabel = label;
        card.setTag("__sort__");
        sortCard = card;
    }

    /** Card đổi ngôn ngữ: Tiếng Việt → English → 中文. */
    private void addLangShortcut() {
        View card = addCard(rowShortcuts, langLabel(), getDrawable(R.drawable.ic_language),
                new View.OnClickListener() {
                    @Override public void onClick(View v) { cycleLang(); }
                });
        card.setTag("__lang__");
    }

    /** Card mở bảng chọn nguồn vào (HDMI/AV/TV) của TV. */
    private void addInputShortcut() {
        addCard(rowShortcuts, t("Nguồn", "Input", "信号源"), getDrawable(R.drawable.ic_input),
                new View.OnClickListener() {
                    @Override public void onClick(View v) { openInputSelector(); }
                });
    }

    private void cycleLang() {
        lang = (lang + 1) % 3;
        savePrefs();
        applyTexts();
        updateClock();
        buildShortcutRow();
        wireFocus();
        for (int i = 0; i < rowShortcuts.getChildCount(); i++) {
            if ("__lang__".equals(rowShortcuts.getChildAt(i).getTag())) {
                rowShortcuts.getChildAt(i).requestFocus();
                break;
            }
        }
    }

    /** Mở bảng chọn nguồn của hãng (Xiaomi/Amlogic) — không cần quyền hệ thống. */
    private void openInputSelector() {
        String[] targets = {
                "com.xiaomi.mitv.tvplayer/com.xiaomi.mitv.tvplayer.ExternalSourceActivity",
                "com.xiaomi.mitv.tvplayer/com.xiaomi.mitv.tvplayer.AtvActivity",
                "com.droidlogic.tvinput/com.droidlogic.tvinput.shortcut.ShortCutActivity",
                "com.droidlogic.tvinput/com.droidlogic.tvinput.settings.TvSettingsActivity"
        };
        for (String target : targets) {
            ComponentName cn = ComponentName.unflattenFromString(target);
            if (cn == null) continue;
            Intent intent = new Intent(Intent.ACTION_MAIN);
            intent.setComponent(cn);
            if (getPackageManager().resolveActivity(intent, 0) != null) {
                start(intent);
                return;
            }
        }
        Toast.makeText(this, t("Không mở được chọn nguồn", "Cannot open input", "无法打开信号源"),
                Toast.LENGTH_SHORT).show();
    }

    private String sortModeLabel() {
        switch (sortMode) {
            case SORT_ZA: return t("Sắp xếp: Z→A", "Sort: Z→A", "排序: Z→A");
            case SORT_CUSTOM: return t("Sắp xếp: Tự chọn", "Sort: Custom", "排序: 自定义");
            default: return t("Sắp xếp: A→Z", "Sort: A→Z", "排序: A→Z");
        }
    }

    private void cycleSort() {
        if (sortMode == SORT_AZ) {
            sortMode = SORT_ZA;
        } else if (sortMode == SORT_ZA) {
            sortMode = SORT_CUSTOM;
            // khởi tạo thứ tự tự chọn từ thứ tự đang hiển thị
            customOrder.clear();
            for (int i = 0; i < rowApps.getChildCount(); i++) {
                Object tag = rowApps.getChildAt(i).getTag();
                if (tag instanceof String) customOrder.add((String) tag);
            }
        } else {
            sortMode = SORT_AZ;
        }
        savePrefs();
        rebuildApps(null);
        if (sortLabel != null) sortLabel.setText(sortModeLabel());
        android.util.Log.d("TVFlowFocus", "SORT mode=" + sortMode + " apps=" + customOrder.size());
        if (sortCard != null) {
            sortCard.post(new Runnable() {
                @Override public void run() { sortCard.requestFocus(); }
            });
        }
    }

    private void rebuildApps(String focusPkg) {
        buildAppRow();
        wireFocus();
        if (focusPkg != null) {
            View v = appCards.get(focusPkg);
            if (v != null) v.requestFocus();
        } else if (rowApps.getChildCount() > 0) {
            rowApps.getChildAt(0).requestFocus();
        }
    }

    // ------------------------------------------------------- move mode
    private void enterMoveMode(View card, String pkg) {
        if (sortMode != SORT_CUSTOM) {
            sortMode = SORT_CUSTOM;
            customOrder.clear();
            for (int i = 0; i < rowApps.getChildCount(); i++) {
                Object tag = rowApps.getChildAt(i).getTag();
                if (tag instanceof String) customOrder.add((String) tag);
            }
            savePrefs();
            if (sortLabel != null) sortLabel.setText(sortModeLabel());
        }
        movingCard = card;
        movingPkg = pkg;
        swallowFirstCenterUp = true;
        android.util.Log.d("TVFlowFocus", "MOVE enter " + pkg + " visible=" + rowApps.getChildCount()
                + " order=" + customOrder.size());
        card.setTranslationZ(dp(24));
        card.animate().scaleX(1.16f).scaleY(1.16f).setDuration(120).start();
        Toast.makeText(this, t("◀ ▶ để di chuyển · OK để xong",
                "◀ ▶ to move · OK to finish", "◀ ▶ 移动 · OK 完成"), Toast.LENGTH_LONG).show();
    }

    private void exitMoveMode() {
        if (movingCard != null) {
            movingCard.setTranslationZ(0f);
            float sc = movingCard.hasFocus() ? 1.12f : 1.0f;
            movingCard.animate().scaleX(sc).scaleY(sc).setDuration(120).start();
        }
        movingCard = null;
        movingPkg = null;
        android.util.Log.d("TVFlowFocus", "MOVE exit");
    }

    private void moveBy(int dir) {
        if (movingPkg == null) return;

        // Đổi chỗ theo đúng HÀNG ĐANG HIỂN THỊ, không theo chỉ số trong customOrder.
        // Lỗi thật 24/10/2026: customOrder có thể chứa app không hiện ra hàng (bị lọc vì trùng
        // tên, hoặc app đã gỡ) nên box CUỐI nhìn thấy có chỉ số < size-1; bấm ▶ thì đổi chỗ với
        // phần tử vô hình => màn hình không nhúc nhích, tưởng "không di chuyển được box cuối".
        int n = rowApps.getChildCount();
        List<String> visible = new ArrayList<>();
        int idx = -1;
        for (int i = 0; i < n; i++) {
            Object tag = rowApps.getChildAt(i).getTag();
            if (!(tag instanceof String)) continue;
            if (movingPkg.equals(tag)) idx = visible.size();
            visible.add((String) tag);
        }
        int next = idx + dir;
        if (idx < 0 || next < 0 || next >= visible.size()) return;

        Collections.swap(visible, idx, next);
        // Nạp lại danh sách tự chọn đúng thứ tự đang thấy: app không hiển thị rơi khỏi danh sách,
        // app mới sẽ tự chèn theo bảng chữ cái (nhánh indexOf < 0 trong buildAppRow).
        customOrder.clear();
        customOrder.addAll(visible);
        android.util.Log.d("TVFlowFocus", "MOVE swap " + movingPkg + " <-> " + visible.get(idx)
                + " idx=" + idx + "/" + visible.size());
        savePrefs();

        buildAppRow();
        wireFocus();
        View v = appCards.get(movingPkg);
        if (v != null) {
            movingCard = v;
            v.requestFocus();
            v.setTranslationZ(dp(24));
            v.animate().scaleX(1.16f).scaleY(1.16f).setDuration(80).start();
        }
    }

    private View currentAppCard() {
        View f = getCurrentFocus();
        if (f == null) return null;
        Object tag = f.getTag();
        return (tag instanceof String && appCards.containsValue(f)) ? f : null;
    }

    @Override public boolean dispatchKeyEvent(KeyEvent event) {
        if (movingCard == null) {
            // Bắt long-press OK ở mức Activity: một số remote Xiaomi không phát
            // long-click cho View nên phải tự đếm thời gian giữ phím.
            int c = event.getKeyCode();
            if (c == KeyEvent.KEYCODE_DPAD_CENTER || c == KeyEvent.KEYCODE_ENTER) {
                long now = android.os.SystemClock.uptimeMillis();
                if (event.getAction() == KeyEvent.ACTION_DOWN) {
                    if (event.getRepeatCount() == 0) {
                        pressDownAt = now;
                        pressCard = currentAppCard();
                    } else if (pressCard != null && now - pressDownAt >= 550) {
                        enterMoveMode(pressCard, (String) pressCard.getTag());
                        return true;
                    }
                }
            }
            return super.dispatchKeyEvent(event);
        }

        int code = event.getKeyCode();
        int action = event.getAction();

        if (action == KeyEvent.ACTION_DOWN) {
            switch (code) {
                case KeyEvent.KEYCODE_DPAD_LEFT:
                    android.util.Log.d("TVFlowFocus", "MOVE left rep=" + event.getRepeatCount());
                    moveBy(-1);
                    return true;
                case KeyEvent.KEYCODE_DPAD_RIGHT:
                    android.util.Log.d("TVFlowFocus", "MOVE right rep=" + event.getRepeatCount());
                    moveBy(1);
                    return true;
                case KeyEvent.KEYCODE_DPAD_UP:
                case KeyEvent.KEYCODE_DPAD_DOWN:
                    return true; // không cho focus nhảy hàng khi đang di chuyển
                default:
                    return true; // chặn các phím khác
            }
        }

        if (action == KeyEvent.ACTION_UP) {
            if (code == KeyEvent.KEYCODE_DPAD_CENTER || code == KeyEvent.KEYCODE_ENTER) {
                if (swallowFirstCenterUp) {
                    // đây là lần nhả của chính thao tác long-press đã bật chế độ
                    swallowFirstCenterUp = false;
                    return true;
                }
                exitMoveMode();
                return true;
            }
            if (code == KeyEvent.KEYCODE_BACK) {
                exitMoveMode();
                return true;
            }
            if (code == KeyEvent.KEYCODE_DPAD_LEFT || code == KeyEvent.KEYCODE_DPAD_RIGHT) {
                return true;
            }
            return true;
        }

        return super.dispatchKeyEvent(event);
    }

    // ------------------------------------------------------- focus chaining
    private void wireFocus() {
        wireHorizontal(rowApps);
        wireHorizontal(rowShortcuts);

        int nApps = rowApps.getChildCount();
        int nShort = rowShortcuts.getChildCount();

        if (nShort > 0) {
            for (int i = 0; i < nApps; i++) {
                int j = Math.min(i, nShort - 1);
                rowApps.getChildAt(i).setNextFocusDownId(rowShortcuts.getChildAt(j).getId());
            }
        }
        if (nApps > 0) {
            for (int i = 0; i < nShort; i++) {
                int j = Math.min(i, nApps - 1);
                rowShortcuts.getChildAt(i).setNextFocusUpId(rowApps.getChildAt(j).getId());
            }
        }
    }

    private void wireHorizontal(LinearLayout row) {
        int n = row.getChildCount();
        for (int i = 0; i < n; i++) {
            View v = row.getChildAt(i);
            v.setNextFocusLeftId(i == 0 ? v.getId() : row.getChildAt(i - 1).getId());
            v.setNextFocusRightId(i == n - 1 ? v.getId() : row.getChildAt(i + 1).getId());
        }
    }

    // ---------------------------------------------------------- shortcuts
    private void addShortcut(final String pkg, String fallbackLabel, int fallbackColor) {
        PackageManager pm = getPackageManager();
        final Intent launch = findLaunchIntent(pm, pkg);
        if (launch == null) return;

        String label = fallbackLabel;
        Drawable icon = null;

        ResolveInfo ri = pm.resolveActivity(launch, 0);
        if (ri != null) {
            label = ri.loadLabel(pm).toString();
            icon = ri.loadIcon(pm);
        }
        if (icon == null) icon = letterIcon(label, fallbackColor);

        addCard(rowShortcuts, label, icon, new View.OnClickListener() {
            @Override public void onClick(View v) { start(launch); }
        });
    }

    private Intent findLaunchIntent(PackageManager pm, String pkg) {
        Intent li = pm.getLaunchIntentForPackage(pkg);
        if (li != null) return li;

        String[] categories = {Intent.CATEGORY_LEANBACK_LAUNCHER, Intent.CATEGORY_LAUNCHER};
        for (String cat : categories) {
            Intent q = new Intent(Intent.ACTION_MAIN).addCategory(cat).setPackage(pkg);
            List<ResolveInfo> list = pm.queryIntentActivities(q, 0);
            if (list != null && !list.isEmpty()) {
                ResolveInfo ri = list.get(0);
                Intent intent = new Intent(Intent.ACTION_MAIN);
                intent.addCategory(cat);
                intent.setComponent(new ComponentName(ri.activityInfo.packageName, ri.activityInfo.name));
                return intent;
            }
        }
        if ("com.xiaomi.mitv.settings".equals(pkg)) {
            Intent intent = new Intent(Intent.ACTION_MAIN);
            intent.addCategory(Intent.CATEGORY_DEFAULT);
            intent.setComponent(new ComponentName(pkg, "com.xiaomi.mitv.settings.entry.MainActivity"));
            return intent;
        }
        return null;
    }

    private boolean isInstalled(String pkg) {
        try {
            getPackageManager().getPackageInfo(pkg, 0);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /** Shortcut quay về launcher gốc Xiaomi. */
    private void addStockLauncherShortcut() {
        final String pkg = "com.mitv.tvhome";
        if (!isInstalled(pkg)) return;

        Drawable icon = null;
        try {
            icon = getPackageManager().getApplicationIcon(pkg);
        } catch (Exception ignored) { }
        if (icon == null) icon = letterIcon("X", 0xFFF26F21);

        addCard(rowShortcuts, t("Launcher Xiaomi", "Xiaomi launcher", "小米桌面"), icon, new View.OnClickListener() {
            @Override public void onClick(View v) {
                // Người dùng chủ động mở home Xiaomi -> tạm dừng HomeGuard 60s.
                guardBypassUntil = System.currentTimeMillis() + 60_000L;
                // tvhome yêu cầu signature permission HOME_STATE -> không start trực tiếp được.
                // Đưa task của mình xuống nền để lộ home gốc.
                moveTaskToBack(true);
            }
        });
    }

    // ---------------------------------------------------------------- cards
    private View addCard(LinearLayout row, final String label, Drawable icon, View.OnClickListener click) {
        final LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setGravity(Gravity.CENTER);
        card.setFocusable(true);
        card.setClickable(true);
        card.setBackgroundResource(R.drawable.card_selector);

        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(120), dp(120));
        lp.setMarginEnd(dp(10));
        card.setLayoutParams(lp);

        ImageView image = new ImageView(this);
        image.setImageDrawable(icon);
        LinearLayout.LayoutParams ilp = new LinearLayout.LayoutParams(dp(46), dp(46));
        card.addView(image, ilp);

        TextView text = new TextView(this);
        text.setText(label);
        text.setTextSize(11f);
        text.setTextColor(getColor(R.color.text_primary));
        text.setGravity(Gravity.CENTER);
        text.setSingleLine(true);
        text.setEllipsize(TextUtils.TruncateAt.END);
        LinearLayout.LayoutParams tlp = new LinearLayout.LayoutParams(dp(104), ViewGroup.LayoutParams.WRAP_CONTENT);
        tlp.topMargin = dp(6);
        card.addView(text, tlp);

        card.setId(View.generateViewId());
        card.setOnClickListener(click);
        card.setOnFocusChangeListener(new View.OnFocusChangeListener() {
            @Override public void onFocusChange(View v, boolean hasFocus) {
                if (v == movingCard) return; // đang di chuyển thì giữ scale lớn
                android.util.Log.d("TVFlowFocus", (hasFocus ? "FOCUS " : "BLUR  ") + label);
                float scale = hasFocus ? 1.12f : 1.0f;
                v.animate().scaleX(scale).scaleY(scale).setDuration(120).start();
                v.setTranslationZ(hasFocus ? dp(14) : 0f);
            }
        });

        row.addView(card);
        return card;
    }

    private Drawable letterIcon(String label, int color) {
        TextView tv = new TextView(this);
        tv.setText(label != null && label.length() > 0
                ? label.substring(0, 1).toUpperCase(Locale.getDefault()) : "?");
        tv.setTextColor(Color.WHITE);
        tv.setTextSize(26f);
        tv.setGravity(Gravity.CENTER);
        return new android.graphics.drawable.ColorDrawable(color);
    }

    // --------------------------------------------------------------- launch
    private void launch(ResolveInfo ri) {
        Intent intent = new Intent(Intent.ACTION_MAIN);
        intent.addCategory(Intent.CATEGORY_LAUNCHER);
        intent.setComponent(new ComponentName(ri.activityInfo.packageName, ri.activityInfo.name));
        start(intent);
    }

    private void start(Intent intent) {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
        try {
            startActivity(intent);
        } catch (Exception e) {
            String pkg = intent.getComponent() != null ? intent.getComponent().getPackageName() : null;
            if (pkg != null) {
                Intent fallback = getPackageManager().getLaunchIntentForPackage(pkg);
                if (fallback != null) {
                    fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    try { startActivity(fallback); } catch (Exception ignored) { }
                }
            }
        }
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
