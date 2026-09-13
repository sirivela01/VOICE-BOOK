@echo off
echo ============================================================
echo   Building VoiceBook Native Android App (.apk)
echo ============================================================

cd /d "%~dp0"

if exist "gradlew.bat" (
    call gradlew.bat assembleDebug
) else (
    echo [INFO] Gradle Wrapper script not initialized locally.
    echo Opening project folder in Android Studio or compiling via Gradle:
    echo Run: gradle assembleDebug
)

echo.
echo Complete! Output APK location:
echo android_app\app\build\outputs\apk\debug\app-debug.apk
pause
