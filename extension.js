// --- IMPORT SECTION ---
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import GdkPixbuf from 'gi://GdkPixbuf';
import GObject from 'gi://GObject';
import St from 'gi://St';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Slider from 'resource:///org/gnome/shell/ui/slider.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';

// --- QUICK SETTINGS TOGGLE ---
const DynamicBrightnessToggle = GObject.registerClass(
    class DynamicBrightnessToggle extends QuickSettings.QuickMenuToggle {
        _init(extension) {
            super._init({
                title: 'Dynamic',
                iconName: 'preferences-desktop-display-symbolic',
                toggleMode: true, // Creates the split button
            });
            this._extension = extension;

            // Listen to the toggle state of the pill button
            this.connect('notify::checked', () => {
                if (this.checked) {
                    this._extension.startLoop();
                } else {
                    this._extension.stopLoop();
                }
            });

            // 1. Max Brightness Slider (Stepped by 10)
            // Allow user to adjust max brightness 
            // Extension arranges brightness dynamically between 5% and selected value
            this._sliderLabel = new PopupMenu.PopupMenuItem('Max Brightness Limit: 100%', { reactive: false });
            this.menu.addMenuItem(this._sliderLabel);

            this._sliderItem = new PopupMenu.PopupBaseMenuItem({ activate: false });
            this._maxBrightnessSlider = new Slider.Slider(1.0);
            this._maxBrightnessSlider.x_expand = true; 
            
            this._sliderItem.add_child(this._maxBrightnessSlider);
            this.menu.addMenuItem(this._sliderItem);

            this._maxBrightnessSlider.connect('notify::value', (slider) => {
                let rawVal = slider.value * 100;
                let snappedVal = Math.round(rawVal / 10) * 10;
                
                // Prevent max brightness from dropping below 20%
                // There is no logic to set max brightness below 20%
                if (snappedVal < 20) {
                    snappedVal = 20;
                }

                let snappedSliderVal = snappedVal / 100;

                if (Math.abs(slider.value - snappedSliderVal) > 0.01) {
                    slider.value = snappedSliderVal;
                    return;
                }

                this._sliderLabel.label.text = `Max Brightness Limit: ${snappedVal}%`;
                this._extension.setMaxBrightness(snappedVal);
            });

            // 2. Refresh Rate Submenu
            this._intervalMenu = new PopupMenu.PopupSubMenuMenuItem('Refresh Rate');
            this.menu.addMenuItem(this._intervalMenu);

            this._intervalItems = [];
            this._createIntervalOption('Fast (1 Second)', 1000);
            this._createIntervalOption('Balanced (2 Seconds)', 2000);
            this._createIntervalOption('Power Save (5 Seconds)', 5000);
            
            // Set the default checked option to 'Balanced' manually
            this._intervalItems[1].setIcon('radio-checked-symbolic');
        }

        _createIntervalOption(label, ms) {
            let item = new PopupMenu.PopupImageMenuItem(label, 'radio-unchecked-symbolic');
            item.connect('activate', () => {
                this._extension.setInterval(ms);
                this._intervalItems.forEach(i => i.setIcon('radio-unchecked-symbolic'));
                item.setIcon('radio-checked-symbolic');
            });
            this._intervalItems.push(item);
            this._intervalMenu.menu.addMenuItem(item);
        }
    }
);

// --- SYSTEM INDICATOR WRAPPER ---
const DynamicBrightnessSystemIndicator = GObject.registerClass(
    class DynamicBrightnessSystemIndicator extends QuickSettings.SystemIndicator {
        _init(extension) {
            super._init();
            
            // 1. Create the tiny icon that sits next to Wi-Fi/Battery on the top panel
            this._indicator = this._addIndicator();
            this._indicator.icon_name = 'preferences-desktop-display-symbolic';
            
            // 2. Create our pill button (QuickToggle)
            this.toggle = new DynamicBrightnessToggle(extension);
            this.quickSettingsItems.push(this.toggle);

            // 3. Set initial visibility to match the toggle state (which is OFF by default now)
            this._indicator.visible = this.toggle.checked;

            // 4. Sync top panel icon visibility when toggle is clicked
            this.toggle.connect('notify::checked', () => {
                this._indicator.visible = this.toggle.checked;
            });
        }
    }
);

// --- MAIN EXTENSION CLASS ---
export default class DynamicBrightnessExtension extends Extension {

    constructor(metadata) {
        super(metadata);
        this._timeoutId = null; 
        this._lastBrightness = -1; 
        this._isRunning = false; 
        this._intervalMs = 2000; 
        this._userMaxBrightness = 100; 
        this._systemIndicator = null; 
    }

    enable() {
        console.log("[DEBUG] Dynamic Brightness extension loaded (Standby mode).");

        // Create the System Indicator and inject it into GNOME's Quick Settings
        this._systemIndicator = new DynamicBrightnessSystemIndicator(this);
        Main.panel.statusArea.quickSettings.addExternalIndicator(this._systemIndicator);
        
        // By default, we keep the plugin disabled (false). 
        // No scans will start until the user enables it from the menu.
        this._systemIndicator.toggle.checked = false;
    }

    disable() {
        console.log("[DEBUG] Dynamic Brightness Disabled.");
        this.stopLoop(); 
        
        if (this._systemIndicator) {
            this._systemIndicator.toggle.destroy();
            this._systemIndicator.destroy();
            this._systemIndicator = null;
        }
    }

    startLoop() {
        if (this._isRunning) return; // Prevent multiple loops
        this._isRunning = true;
        this._scheduleNext();
        console.log("[DEBUG] Dynamic Brightness loop started by user.");
    }

    stopLoop() {
        if (!this._isRunning) return;
        this._isRunning = false;
        if (this._timeoutId !== null) {
            GLib.Source.remove(this._timeoutId);
            this._timeoutId = null;
        }
        console.log("[DEBUG] Dynamic Brightness loop stopped by user.");
    }

    // Updates the scanning frequency
    setInterval(ms) {
        this._intervalMs = ms;
    }

    // Updates the maximum allowed brightness
    setMaxBrightness(val) {
        this._userMaxBrightness = val;
    }

    // Schedules the next screen capture based on the interval
    _scheduleNext() {
        if (!this._isRunning) return; 
        this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, this._intervalMs, () => {
            this._timeoutId = null;
            this._captureContentSilent(); 
            return GLib.SOURCE_REMOVE; 
        });
    }

    // Captures the screen without saving to disk
    // To determine calculate screen luminance, we use Shell.Screenshot to capture the contents and analyse it
    async _captureContentSilent() {
        let memStream = null;
        try {
            // Create an in-memory stream to hold the image data
            memStream = Gio.MemoryOutputStream.new_resizable();
            let screenshot = new Shell.Screenshot();
            
            // Capture the screen and write directly to memory
            await screenshot.screenshot(false, memStream);
            memStream.close(null); 
            
            // Pass the memory data for processing
            this._processImageFromMemoryAsync(memStream);
        } catch (e) {
            console.error(`[ERROR] Silent content capture error: ${e}`);
            this._scheduleNext(); 
        }
    }

    // Processes the captured image data asynchronously
    _processImageFromMemoryAsync(memStream) {
        let inputStream = null;
        try {
            // Extract raw bytes from the memory stream
            let bytes = memStream.steal_as_bytes();
            if (!bytes || bytes.get_size() === 0) {
                this._scheduleNext();
                return;
            }
            // Create an input stream to read the bytes
            inputStream = Gio.MemoryInputStream.new_from_bytes(bytes);

            // Load the image into a GdkPixbuf, downscaling it to 32x32 for fast processing
            GdkPixbuf.Pixbuf.new_from_stream_at_scale_async(
                inputStream, 32, 32, false, null,
                (source_object, res) => {
                    try {
                        let pixbuf = GdkPixbuf.Pixbuf.new_from_stream_finish(res);
                        let pixels = pixbuf.get_pixels();
                        
                        if (pixels && pixels.length > 0) {
                            let totalLuminance = 0;
                            let pixelCount = 0;
                            let n_channels = pixbuf.get_n_channels();

                            for (let idx = 0; idx < pixels.length; idx += n_channels) {
                                let r = pixels[idx];     
                                let g = pixels[idx + 1]; 
                                let b = pixels[idx + 2]; 
                                
                                // Calculate perceived luminance (human eye formula)
                                totalLuminance += (0.299 * r) + (0.587 * g) + (0.114 * b);
                                pixelCount++;
                            }

                            let ratio = pixelCount > 0 ? ((totalLuminance / pixelCount) / 255) * 100 : 0;
                            this._adjustBrightness(ratio);
                        }
                    } catch (err) {
                        console.error(`[ERROR] Async processing error: ${err}`);
                    } finally {
                        // Ensure the input stream is closed and the loop continues
                        if (inputStream) { try { inputStream.close(null); } catch (e) {} }
                        this._scheduleNext();
                    }
                }
            );
        } catch (err) {
            console.error(`[ERROR] Image stream error: ${err}`);
            this._scheduleNext();
        }
    }

    _adjustBrightness(luminanceRatio) {
        let maxBrightness = this._userMaxBrightness;
        
        // Define minimum brightness: ensure it never drops below 5% to prevent a total black screen (especially for OLED displays)
        let minBrightness = Math.max(5, Math.round(maxBrightness * 0.1)); 
        
        // Inverse proportion: Brighter screen content means lower hardware brightness
        let targetBrightness = Math.round(maxBrightness - (luminanceRatio / 100) * (maxBrightness - minBrightness));
        
        // Hysteresis: Ignore changes smaller than 5% to prevent annoying screen flickering
        if (this._lastBrightness !== -1 && Math.abs(this._lastBrightness - targetBrightness) < 5) {
            return; // Change is too small, skip update
        }

        this._lastBrightness = targetBrightness;

        console.log(`[DEBUG] Brightness adjusted! New Target: ${targetBrightness}% (Luminance: ${luminanceRatio.toFixed(2)}%)`);

        try {
            // Communicate directly with GNOME Settings Daemon via D-Bus to change brightness safely
            Gio.DBus.session.call(
                'org.gnome.SettingsDaemon.Power', 
                '/org/gnome/SettingsDaemon/Power', 
                'org.freedesktop.DBus.Properties', 
                'Set', 
                new GLib.Variant('(ssv)', [
                    'org.gnome.SettingsDaemon.Power.Screen', 
                    'Brightness', 
                    new GLib.Variant('i', targetBrightness) 
                ]),
                null,
                Gio.DBusCallFlags.NONE,
                -1,
                null,
                (conn, res) => {
                    try { conn.call_finish(res); } catch (e) {}
                }
            );
        } catch (e) {
            console.error(`[ERROR] Native DBus error: ${e}`);
        }
    }
}
