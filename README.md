# Dynamic Brightness for GNOME

A GNOME Shell extension that dynamically adjusts hardware screen brightness based on the active screen content luminance.

Designed to provide eye comfort, especially when switching between light and dark content on laptop screens.

<div align="center">
  <video src="https://github.com/user-attachments/assets/8f9c4792-4d3f-490a-9c52-dff409902ea8
" width="80%" autoplay loop muted playsinline></video>
</div>

## Features
* GNOME 45+ Quick Settings menu integration.

* Screen content is captured by GNOME Shell's native functions (`Shell.Screenshot`) and analyzed strictly within GNOME Shell's isolated memory process. No image data is ever saved to the disk, logged or exposed. This ensures complete data privacy and security.

* Prevents annoying screen flickering by filtering out minor pixel luminance shifts.

* Adjustable maximum brightness limit.

* Hardcoded safety limits prevent the screen from dropping below 5% hardware brightness, avoiding pitch-black lockouts.

## ⚠️ Limitations & Architectural Trade-offs

While this extension provides a convenient, user-space solution for dynamic brightness on GNOME, it comes with certain architectural trade-offs:

* **UI Performance and Slutters:** Because the screenshot capture, downscaling and pixel luminance analysis run periodically within the GNOME Shell environment, aggressive refresh rates (e.g., every 1 second) can occasionally introduce minor UI stutters, frame drops, or micro-freezes during heavy desktop animations.

* **Resource Usage:** Because the extension periodically captures and analyzes screen content via JavaScript (`Shell.Screenshot`) at set intervals, it introduces a continuous, minor CPU overhead.

* **Battery Impact:** Frequent screen captures and pixel data processing can impact battery life more than a native, hardware-level daemon would.

### Looking for a Battery-Efficient Alternative?
If you are running Wayland and require a truly deep, native, and power-efficient solution for content-aware screen brightness (without the overhead of a GNOME extension), we highly recommend checking out **[wluma](https://github.com/emersion/wluma)**. It operates as an external, low-level daemon specifically optimized for performance and battery conservation.

## Installation
1. Download the latest release `.zip` or clone this repository.
2. Install the extension using the terminal:

   ```
   gnome-extensions install dynamic-brightness@mnural.com.shell-extension.zip
   ```
4. Log out and log back in.
5. Enable the extension:

   ```
   gnome-extensions enable dynamic-brightness@mnural.com
   ```
## Versions support

The current extension supports these GNOME Shell versions: 45 to 50

## Acknowledgments & Inspiration

The core concept of dynamically adjusting screen brightness based on on-screen content luminance is not my original idea. This extension was heavily inspired by existing tools like [wluma](https://github.com/maximbaz/wluma) and [lumen](https://github.com/anishathalye/lumen).

While this project was built entirely from scratch specifically as a native GNOME Shell extension, I want to express my sincere gratitude and give full credit to the creators of those applications for the original inspiration.

