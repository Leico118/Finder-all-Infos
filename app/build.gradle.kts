plugins {
    id("com.android.application")
}

android {
    namespace = "com.leico.radar"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.leico.radar"
        minSdk = 30
        targetSdk = 34
        versionCode = 4
        versionName = "1.0.3"
    }

    signingConfigs {
        // Clé fixe (décodée par le workflow) : les futures versions s'installeront par-dessus.
        val ks = rootProject.file("keystore/radar.jks")
        if (ks.exists()) {
            create("fixed") {
                storeFile = ks
                storePassword = "radar-veille"
                keyAlias = "radar"
                keyPassword = "radar-veille"
            }
        }
    }

    buildTypes {
        debug {
            signingConfigs.findByName("fixed")?.let { signingConfig = it }
        }
        release {
            isMinifyEnabled = false
            signingConfigs.findByName("fixed")?.let { signingConfig = it }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.work:work-runtime:2.10.0")
}
