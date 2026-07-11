package com.smartstudy.app;

import android.content.Intent;
import android.net.Uri;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

@CapacitorPlugin(name = "PdfIntent")
public class PdfIntentPlugin extends Plugin {

    private String lastPdfUrl = null;

    @Override
    public void load() {
        super.load();
        handleIntent(bridge.getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        String type = intent.getType();
        
        if (Intent.ACTION_VIEW.equals(action) && type != null && type.equals("application/pdf")) {
            Uri uri = intent.getData();
            if (uri != null) {
                // Copy to cache to make it readable by JS WebView
                try {
                    InputStream inputStream = getContext().getContentResolver().openInputStream(uri);
                    if (inputStream == null) return;
                    
                    File cacheDir = getContext().getCacheDir();
                    File cacheFile = new File(cacheDir, "imported_pdf_" + System.currentTimeMillis() + ".pdf");
                    OutputStream outputStream = new FileOutputStream(cacheFile);
                    
                    byte[] buffer = new byte[8192];
                    int bytesRead;
                    while ((bytesRead = inputStream.read(buffer)) != -1) {
                        outputStream.write(buffer, 0, bytesRead);
                    }
                    
                    outputStream.close();
                    inputStream.close();
                    
                    lastPdfUrl = cacheFile.getAbsolutePath();
                    
                    // Notify JS
                    JSObject ret = new JSObject();
                    ret.put("url", "file://" + lastPdfUrl);
                    notifyListeners("onPdfReceived", ret, true);
                    
                } catch (Exception e) {
                    Log.e("PdfIntentPlugin", "Error copying PDF intent data to cache", e);
                }
            }
        }
    }

    @PluginMethod
    public void checkIntent(PluginCall call) {
        JSObject ret = new JSObject();
        if (lastPdfUrl != null) {
            ret.put("url", "file://" + lastPdfUrl);
            lastPdfUrl = null; // Clear after reading so it doesn't trigger again on reload
        } else {
            ret.put("url", JSObject.NULL);
        }
        call.resolve(ret);
    }
}
