import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const RAMP_UP_MS = 500;    // brighter: gentle
const RAMP_DOWN_MS = 300;  // dimmer: quick, to cut glare
const RAMP_TICK_MS = 10;   // 100 Hz: small enough steps for panels without hardware smoothing

export class BrightnessWriter {
    constructor({onUnavailable}) {
        this._onUnavailable = onUnavailable;
        this._rampId = null;
        this._writing = false;

        this.smooth = false;
    }

    // GNOME 49+ emits user-update for our own writes too; this tells them apart.
    get isWriting() {
        return this._writing;
    }

    apply(target) {
        this.stop();

        const from = this._current();
        if (from === null) {    // no controllable backlight: _write reports it
            this._write(target);
            return;
        }

        if (Math.abs(from - target) < 0.5)    // already there, nothing to write
            return;

        if (!this.smooth) {
            this._write(target);
            return;
        }

        const start = GLib.get_monotonic_time() / 1000;
        const duration = target < from ? RAMP_DOWN_MS : RAMP_UP_MS;
        let last = from;

        this._rampId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, RAMP_TICK_MS, () => {
            const t = Math.min(1, (GLib.get_monotonic_time() / 1000 - start) / duration);
            const eased = 1 - (1 - t) ** 2;
            const value = from + (target - from) * eased;

            if (value !== last) {
                last = value;
                this._write(value); // may stop() the ramp if control is lost
            }

            if (t >= 1 || this._rampId === null) {
                this._rampId = null;
                return GLib.SOURCE_REMOVE;
            }
            return GLib.SOURCE_CONTINUE;
        });
    }

    stop() {
        if (this._rampId !== null) {
            GLib.Source.remove(this._rampId);
            this._rampId = null;
        }
    }

    destroy() {
        this.stop();
        this._onUnavailable = null;
    }

    _current() {
        // Read the real value, so a manual change is ramped from correctly.
        const scale = Main.brightnessManager.globalScale;
        return scale ? scale.value * 100 : null;
    }

    _write(value) {
        // Write the Quick Settings brightness scale directly, so the system's own
        // auto-brightness target (fed by an ambient light sensor, when present)
        // keeps working on top of our value instead of fighting over the same slot.
        // globalScale is null when no monitor has a controllable backlight.
        const manager = Main.brightnessManager;
        if (manager.globalScale)
            this._writeScale(manager, value / 100);
        else
            this._fail('No display with a controllable backlight');
    }

    // Setting globalScale.value pops up the brightness OSD, which would show on
    // every adjustment. There is no public way to pass {showOSD: false}, so shadow
    // _showOSD for the duration of our write.
    // Discussed in: https://gitlab.gnome.org/GNOME/gnome-shell/-/work_items/9407
    _writeScale(manager, value) {
        const originalShowOSD = manager._showOSD;
        try {
            manager._showOSD = () => {};
            this._writing = true;
            manager.globalScale.value = value;
        } catch (e) {
            this._fail(`Failed to set global brightness scale: ${e}`);
        } finally {
            this._writing = false;
            manager._showOSD = originalShowOSD;
        }
    }

    _fail(message) {
        console.error(`[DynamicBrightness] ${message}`);
        this.stop();
        this._onUnavailable?.();
    }
}
