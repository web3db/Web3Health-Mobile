# Web3Health-Mobile — Development Setup Guide

This guide explains how to install all required tools and configure your environment on **macOS** and **Windows** to run and build the **Web3Health-Mobile** app for both **Android** and **iOS**.

---

# 1. Clone the Repository

```bash
git clone https://github.com/web3db/Web3Health-Mobile.git
cd Web3Health-Mobile
```

---

# 2. Install Node, npm, Git

Install the following:

* **Node.js (LTS)**
* **npm** (comes with Node)
* **Git**

Verify:

```bash
node -v
npm -v
git --version
```

---

# 3. Install Java 17 (Required for Android Builds)

## macOS — Install & Configure Java 17

1. Install JDK 17 from any official JDK provider.
2. Add to `~/.zshrc`:

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
export PATH="$JAVA_HOME/bin:$PATH"
```

Reload:

```bash
source ~/.zshrc
```

Verify:

```bash
java -version
```

---

## Windows — Install & Configure Java 17

1. Install JDK 17 (Windows x64 MSI installer).
2. Open **System Properties → Environment Variables**:

   * Add new system variable:

     * `JAVA_HOME = C:\Program Files\Java\jdk-17.x.x`
   * Edit `Path` → Add:

     * `%JAVA_HOME%\bin`

Verify:

```powershell
java -version
```

---

# 4. Android Development Setup (macOS + Windows)

## 4.1 Install Android Studio

Download Android Studio and install it.

---

## 4.2 Install Required SDK Packages

Open:

**Android Studio → Settings / Preferences → Appearance & Behavior → System Settings → Android SDK**

Enable under **SDK Tools** (match your screenshot):

* Android SDK Build-Tools
* Android SDK Command-line Tools (latest)
* Android SDK Platform-Tools
* Android Emulator
* NDK (Side by side) *(only if needed)*
* CMake *(only if needed)*

Under **SDK Platforms**, install at least one recent API (API 34 recommended).

Apply and complete installation.

---

## 4.3 Add Android SDK to PATH

### macOS

Typical SDK path:

```
~/Library/Android/sdk
```

Add to `~/.zshrc`:

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$ANDROID_HOME/tools:$ANDROID_HOME/tools/bin"
```

Reload:

```bash
source ~/.zshrc
```

---

### Windows

Typical SDK path:

```
C:\Users\<USER>\AppData\Local\Android\Sdk
```

Add environment variables:

* `ANDROID_HOME = C:\Users\<USER>\AppData\Local\Android\Sdk`
* Add to **Path**:

  * `%ANDROID_HOME%\platform-tools`
  * `%ANDROID_HOME%\emulator`
  * `%ANDROID_HOME%\tools`
  * `%ANDROID_HOME%\tools\bin`

Verify:

```bash
adb version
```

---

## 4.4 Running Android Emulator

Create emulator:

**Android Studio → Virtual Device Manager → Create Device**

Start emulator before running the app.

List devices:

```bash
adb devices
```

---

# 5. iOS Development Setup (macOS Only)

> **iOS building & simulator support requires macOS + Xcode.**

## 5.1 Install Xcode

* Install from the **Mac App Store**.
* Open once to complete component installation.

## 5.2 Install Command Line Tools

Xcode → **Settings → Locations → Command Line Tools**

Choose the latest version.

## 5.3 Install iOS Simulator Runtime

Xcode → **Settings → Platforms**
Download at least one iOS runtime.

---

# 6. Install Project Dependencies

From the project root:

```bash
npm install
```

If installation fails (peer dependency conflict):

```bash
npm install --legacy-peer-deps
```

---

# 7. Running the Project

This project uses predefined scripts instead of `npx expo start`.

---

## 7.1 Run on Android (Emulator or Real Device)

Start emulator first, then:

```bash
npm run android
```

This:

* Builds the native Android dev build
* Installs it on emulator or physical device
* Opens Metro automatically

---

## 7.2 Run on iOS (macOS only)

Open iOS Simulator:

```bash
open -a Simulator
```

Then run:

```bash
npm run ios
```

This:

* Builds the native iOS dev build using Xcode toolchain
* Installs it on iOS Simulator
* Starts Metro

---

## 7.3 Optional: Run Without Building Native (Expo Go)

If needed (for Windows or fast testing):

```bash
npm run start
```

Then scan the QR code in Expo Go.

---

# 8. ADB & Device Commands (Android)

Check connected devices:

```bash
adb devices
```

Restart adb:

```bash
adb kill-server
adb start-server
```

Uninstall previous builds:

```bash
adb uninstall com.web3health.app
```

---

# 9. Common Issues & Fixes

### ❌ `npm install` fails

✔ Use:

```bash
npm install --legacy-peer-deps
```

---

### ❌ `adb: command not found`

✔ PATH variables for Android SDK not set properly.

---

### ❌ iOS build fails

✔ Ensure:

* Xcode installed
* Command Line Tools selected
* Simulator runtime installed
* macOS is used (iOS cannot build on Windows)

---

### ❌ Metro bundler stuck

✔ Run:

```bash
npm run start -- --clear
```

---

# 10. Development Workflow Summary

```bash
git clone https://github.com/web3db/Web3Health-Mobile.git
cd Web3Health-Mobile

npm install                # or npm install --legacy-peer-deps
npm run android            # run on Android emulator / device
npm run ios                # run on iOS simulator (macOS only)
npm run start              # run via Expo Go
```

---
