package com.voicebook.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Message;
import android.view.View;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

public class MainActivity extends AppCompatActivity {

    private static final int PERMISSION_REQUEST_RECORD_AUDIO = 101;
    private static final String VOICEBOOK_URL = "https://voice-book-llh4.onrender.com/";

    private WebView mainWebView;
    private FrameLayout popupContainer;
    private WebView popupWebView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Setup layout
        setContentView(R.layout.activity_main);
        mainWebView = findViewById(R.id.webview);
        popupContainer = findViewById(R.id.popup_container);

        // Check and request Android Record Audio permission
        checkAudioPermission();

        // Configure WebView
        setupWebView();

        // Load VoiceBook web application
        if (savedInstanceState == null) {
            mainWebView.loadUrl(VOICEBOOK_URL);
        }
    }

    private void checkAudioPermission() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.RECORD_AUDIO}, PERMISSION_REQUEST_RECORD_AUDIO);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == PERMISSION_REQUEST_RECORD_AUDIO) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                Toast.makeText(this, "Microphone permission granted!", Toast.LENGTH_SHORT).show();
            } else {
                Toast.makeText(this, "Microphone permission is required for voice dictation.", Toast.LENGTH_LONG).show();
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void setupWebView() {
        WebSettings settings = mainWebView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);

        // Enable popup window support for Google OAuth
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setSupportMultipleWindows(true);

        // User Agent configuration for seamless Google Auth compatibility
        String defaultUA = settings.getUserAgentString();
        settings.setUserAgentString(defaultUA.replace("; wv", ""));

        mainWebView.setWebViewClient(new WebViewClient() {
            @Deprecated
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return false;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return false;
            }
        });

        mainWebView.setWebChromeClient(new WebChromeClient() {
            // Grant Web Audio / Microphone permissions automatically
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                MainActivity.this.runOnUiThread(() -> request.grant(request.getResources()));
            }

            // Support Google Sign-In Popup Windows
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                popupWebView = new WebView(MainActivity.this);
                WebSettings popupSettings = popupWebView.getSettings();
                popupSettings.setJavaScriptEnabled(true);
                popupSettings.setDomStorageEnabled(true);
                popupSettings.setJavaScriptCanOpenWindowsAutomatically(true);
                popupSettings.setUserAgentString(popupSettings.getUserAgentString().replace("; wv", ""));

                popupWebView.setLayoutParams(new FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.MATCH_PARENT,
                        FrameLayout.LayoutParams.MATCH_PARENT
                ));

                popupWebView.setWebViewClient(new WebViewClient() {
                    @Deprecated
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView view, String url) {
                        return false;
                    }

                    @Override
                    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                        return false;
                    }
                });

                popupWebView.setWebChromeClient(new WebChromeClient() {
                    @Override
                    public void onCloseWindow(WebView window) {
                        closePopupView();
                    }
                });

                popupContainer.addView(popupWebView);
                popupContainer.setVisibility(View.VISIBLE);

                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(popupWebView);
                resultMsg.sendToTarget();
                return true;
            }

            @Override
            public void onCloseWindow(WebView window) {
                closePopupView();
            }
        });
    }

    private void closePopupView() {
        if (popupWebView != null) {
            popupContainer.removeView(popupWebView);
            popupWebView.destroy();
            popupWebView = null;
        }
        popupContainer.setVisibility(View.GONE);
    }

    @Override
    public void onBackPressed() {
        if (popupWebView != null) {
            closePopupView();
        } else if (mainWebView.canGoBack()) {
            mainWebView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
