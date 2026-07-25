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

The current extension supports these GNOME Shell versions: 46 to 50

## Acknowledgments & Inspiration

The core concept of dynamically adjusting screen brightness based on on-screen content luminance is not my original idea. This extension was heavily inspired by existing tools like [wluma](https://github.com/maximbaz/wluma) and [lumen](https://github.com/anishathalye/lumen).

While this project was built entirely from scratch specifically as a native GNOME Shell extension, I want to express my sincere gratitude and give full credit to the creators of those applications for the original inspiration.

## What's Next?

While the extension currently relies purely on screen content luminance, I plan to add support for physical ambient light sensors in the future. Since my current development machine lacks a hardware ALS, contributions, testing, and PRs from users with supported devices are warmly welcomed!
