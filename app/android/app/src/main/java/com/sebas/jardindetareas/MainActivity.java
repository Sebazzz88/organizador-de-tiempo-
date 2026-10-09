package com.sebas.jardindetareas;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AgenditaPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
