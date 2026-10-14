package br.com.zemda.app;

import android.content.Context;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Uses Android's print/save-PDF dialog without a popup or storage permissions. */
@CapacitorPlugin(name = "ZemdaPrint")
public class ZemdaPrintPlugin extends Plugin {
    private WebView printView;

    @PluginMethod
    public void printHtml(PluginCall call) {
        String html = call.getString("html");
        String title = call.getString("title", "Documento Zemda");
        if (html == null || html.isEmpty()) { call.reject("Documento vazio"); return; }
        getActivity().runOnUiThread(() -> {
            if (printView != null) { call.reject("Aguarde a impressão atual"); return; }
            WebView view = new WebView(getContext());
            printView = view;
            view.getSettings().setJavaScriptEnabled(false);
            view.setWebViewClient(new WebViewClient() {
                private boolean opened = false;
                @Override
                public void onPageFinished(WebView finished, String url) {
                    if (opened) return;
                    opened = true;
                    try {
                        PrintManager manager = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                        PrintDocumentAdapter delegate = finished.createPrintDocumentAdapter(title);
                        manager.print(title, new PrintDocumentAdapter() {
                            @Override public void onStart() { delegate.onStart(); }
                            @Override public void onLayout(PrintAttributes oldAttributes, PrintAttributes newAttributes, CancellationSignal signal, LayoutResultCallback callback, Bundle extras) {
                                delegate.onLayout(oldAttributes, newAttributes, signal, callback, extras);
                            }
                            @Override public void onWrite(PageRange[] pages, ParcelFileDescriptor destination, CancellationSignal signal, WriteResultCallback callback) {
                                delegate.onWrite(pages, destination, signal, callback);
                            }
                            @Override public void onFinish() {
                                delegate.onFinish(); finished.destroy(); printView = null;
                            }
                        }, new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build());
                        call.resolve();
                    } catch (Exception error) {
                        finished.destroy(); printView = null; call.reject("Não foi possível abrir a impressão", error);
                    }
                }
            });
            view.loadDataWithBaseURL("https://zemda.com.br/", html, "text/html", "UTF-8", null);
        });
    }
}
