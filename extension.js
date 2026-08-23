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

            this.connectObject('notify::checked', () => {
            
                // Save the status
                this._extension._settings.set_boolean('is-active', this.checked);
            
                if (this.checked) {
                    this._extension.startLoop();
                } else {
                    this._extension.stopLoop();
                }
                
            }, this);

            // 1. Max Brightness Slider (Stepped by 10)
            // Allow user to adjust max brightness 
            // Extension arranges brightness dynamically between 5% and selected value
            
            // Retrieve the last stored max brightness value.
            const savedMaxBrightness = this._extension._settings.get_int('max-brightness');
            this._sliderLabel = new PopupMenu.PopupMenuItem(`Max Brightness Limit: ${savedMaxBrightness}%`, { reactive: false });
            this.menu.addMenuItem(this._sliderLabel);
            
            this._sliderItem = new PopupMenu.PopupBaseMenuItem({ activate: false });
            
            // Start slider with last stored max brightness value. (e.g: 80 -> 0.8)
            this._maxBrightnessSlider = new Slider.Slider(savedMaxBrightness / 100);
            this._maxBrightnessSlider.x_expand = true;
            
            this._sliderItem.add_child(this._maxBrightnessSlider);
            this.menu.addMenuItem(this._sliderItem);
            
            this._maxBrightnessSlider.connectObject('notify::value', (slider) => {
            
                const rawVal = slider.value * 100;
                let snappedVal = Math.round(rawVal / 10) * 10;
                
                // Prevent max brightness from dropping below 20%
                // There is no logic to set max brightness below 20%
                if (snappedVal < 20) {
                    snappedVal = 20;
                }
                
                const snappedSliderVal = snappedVal / 100;
                
                if (Math.abs(slider.value - snappedSliderVal) > 0.01) {
                    slider.value = snappedSliderVal;
                    return;
                }
                
                this._sliderLabel.label.text = `Max Brightness Limit: ${snappedVal}%`;
                this._extension.setMaxBrightness(snappedVal);
                
                // Save the value
                this._extension._settings.set_int('max-brightness', snappedVal);
                
            }, this);
            

            // 2. Refresh Rate Submenu
            this._intervalMenu = new PopupMenu.PopupSubMenuMenuItem('Refresh Rate');
            this.menu.addMenuItem(this._intervalMenu);

            this._intervalItems = [];
            this._createIntervalOption('Fast (1 Second)', 1000);
            this._createIntervalOption('Balanced (2 Seconds)', 2000);
            this._createIntervalOption('Power Save (5 Seconds)', 5000);
            
        }

        _createIntervalOption(label, ms) {
            
            // Retrieve the last stored refresh rate
            const savedRefreshRate = this._extension._settings.get_int('refresh-rate');
            const initialIcon = (ms === savedRefreshRate) ? 'radio-checked-symbolic' : 'radio-unchecked-symbolic';
            
            const item = new PopupMenu.PopupImageMenuItem(label, initialIcon);
            item.connectObject('activate', () => {
                this._extension.setInterval(ms);
                this._intervalItems.forEach(i => i.setIcon('radio-unchecked-symbolic'));
                item.setIcon('radio-checked-symbolic');
                
                // Save the value
                this._extension._settings.set_int('refresh-rate', ms);
                
            }, this);
            
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
            
            // 2. Create our quickSettings button (QuickToggle)
            this.toggle = new DynamicBrightnessToggle(extension);
            this.quickSettingsItems.push(this.toggle);

            // 3. Set initial visibility to match the toggle state
            this._indicator.visible = this.toggle.checked;

            // 4. Sync top panel icon visibility when toggle is clicked
            this.toggle.connectObject('notify::checked', () => {
                this._indicator.visible = this.toggle.checked;
            }, this);
        }
        
        destroy() {
            this.quickSettingsItems.forEach(item => item.destroy());
            super.destroy();
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
    
        this._settings = this.getSettings();
    
        // Retrieve the last stored values.
        this._userMaxBrightness = this._settings.get_int('max-brightness');
        this._intervalMs = this._settings.get_int('refresh-rate');
    
        // Create the System Indicator and inject it into GNOME's Quick Settings
        this._systemIndicator = new DynamicBrightnessSystemIndicator(this);
        Main.panel.statusArea.quickSettings.addExternalIndicator(this._systemIndicator);
        
        // Apply the last active state (on/off).
        const savedState = this._settings.get_boolean('is-active');
        this._systemIndicator.toggle.checked = savedState;
        
    }

    disable() {
        this.stopLoop(); 
        this._systemIndicator?.destroy();
        this._systemIndicator = null;
        this._settings = null;

    }

    startLoop() {
        if (this._isRunning) return; // Prevent multiple loops
        this._isRunning = true;
        this._scheduleNext();
    }

    stopLoop() {
        if (!this._isRunning) return;
        this._isRunning = false;
        if (this._timeoutId !== null) {
            GLib.Source.remove(this._timeoutId);
            this._timeoutId = null;
        }
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
        
        // Guarantee to clear the old timer before creating a new one
        if (this._timeoutId !== null) {
            GLib.Source.remove(this._timeoutId);
            this._timeoutId = null;
        }

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
            const screenshot = new Shell.Screenshot();
            
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
            const bytes = memStream.steal_as_bytes();
            if (!bytes || bytes.get_size() === 0) {
                this._scheduleNext();
                return;
            }
            inputStream = Gio.MemoryInputStream.new_from_bytes(bytes);

            // Load the image into a GdkPixbuf, downscaling it to 32x32 for fast processing
            GdkPixbuf.Pixbuf.new_from_stream_at_scale_async(
                inputStream, 32, 32, false, null,
                (source_object, res) => {
                    try {
                        const pixbuf = GdkPixbuf.Pixbuf.new_from_stream_finish(res);
                        const pixels = pixbuf.get_pixels();
                        
                        if (pixels && pixels.length > 0) {
                            let totalLuminance = 0;
                            let pixelCount = 0;
                            const n_channels = pixbuf.get_n_channels();

                            for (let idx = 0; idx < pixels.length; idx += n_channels) {
                                const r = pixels[idx];     
                                const g = pixels[idx + 1]; 
                                const b = pixels[idx + 2]; 
                                
                                // Calculate perceived luminance (human eye formula)
                                totalLuminance += (0.299 * r) + (0.587 * g) + (0.114 * b);
                                pixelCount++;
                            }

                            const ratio = pixelCount > 0 ? ((totalLuminance / pixelCount) / 255) * 100 : 0;
                            this._adjustBrightness(ratio);
                        }
                    } catch (err) {
                        console.error(`[ERROR] Async processing error: ${err}`);
                    } finally {
                        // Ensure the input stream is closed and the loop continues
                        if (inputStream) {  
                        
                            inputStream.close(null);
                            
                        }
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
        const maxBrightness = this._userMaxBrightness;
        
        // Define minimum brightness: ensure it never drops below 5% to prevent a total black screen (especially for OLED displays)
        const minBrightness = Math.max(5, Math.round(maxBrightness * 0.1)); 
        
        // Inverse proportion: Brighter screen content means lower hardware brightness
        const targetBrightness = Math.round(maxBrightness - (luminanceRatio / 100) * (maxBrightness - minBrightness));
        
        // Hysteresis: Ignore changes smaller than 5% to prevent annoying screen flickering
        if (this._lastBrightness !== -1 && Math.abs(this._lastBrightness - targetBrightness) < 5) {
            return; // Change is too small, skip update
        }

        this._lastBrightness = targetBrightness;

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
                    try {
                        conn.call_finish(res); 
                        } catch (e) {
                            console.error(`[ERROR] DBus finish error: ${e}`);
                        }
                }
            );
        } catch (e) {
            console.error(`[ERROR] Native DBus error: ${e}`);
        }
    }
}
