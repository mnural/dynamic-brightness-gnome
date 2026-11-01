# Dynamic Brightness for GNOME

Adjusts your screen brightness to what's on screen: dimmer for bright pages, brighter for dark ones. 

Easier on the eyes when you switch between light and dark content.

## Features
* Brightness range right in Quick Settings
* Customizable response curve
* Smooth transitions
* Pauses for fullscreen games and videos
* Light on resources: the screen is measured only when its content changes, from a tiny thumbnail rendered on the GPU.


<img width="500" height="500" alt="screenshot1" src="https://github.com/user-attachments/assets/717b3440-fbad-41db-9cfd-1e63ada69221" />

<img width="500" height="500" alt="screenshot2" src="https://github.com/user-attachments/assets/d8926eb6-3d43-4698-a6a9-904c321d91cf" />


## Notes
* No multi-monitor support, only the primary monitor is measured. 
* GNOME 49 and later: works together with Automatic Screen Brightness.
* GNOME 46–48: turn off Automatic Screen Brightness first, since both control the same setting.

## Installation

The easiest way is the one-click install from
[extensions.gnome.org](https://extensions.gnome.org/extension/10557/dynamic-brightness/),
which also picks the right version for your GNOME release.

### Manual installation

1. Download `dynamic-brightness@mnural.com.shell-extension.zip`:
   - GNOME 49 and later: from the [latest release](../../releases/latest)
   - GNOME 46–48: from the [`v2.0.0-gnome46-48`](../../releases/tag/v2.0.0-gnome46-48) release
2. Install it:
   ```
   gnome-extensions install dynamic-brightness@mnural.com.shell-extension.zip
   ```
3. Log out and log back in.
4. Enable the extension:

   ```
   gnome-extensions enable dynamic-brightness@mnural.com
   ```

## Demonstration
<div align="center">
  <video src="https://github.com/user-attachments/assets/1d57157e-d916-4b59-8b5c-8831c6885624" width="80%" autoplay loop muted playsinline></video>
</div>

## Feedback
Bug reports and feature requests are welcome in the [issues](../../issues).
