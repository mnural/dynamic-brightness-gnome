import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

const RAMP_UP_MS = 500;    // brighter: gentle
const RAMP_DOWN_MS = 300;  // dimmer: quick, to cut glare
const RAMP_TICK_MS = 10;   // 100 Hz: small enough steps for panels without hardware smoothing

export class BrightnessWriter {
    constructor({onUnavailable}) {
        this._onUnavailable = onUnavailable;
        this._rampId = null;
        this._lastWritten = null;

        this.smooth = false;
    }

    apply(target) {
        this.stop();

        const from = this._current();
        if (from === target)    // already there, nothing to write
            return;

        if (!this.smooth || from === null) {
            this._write(target);
            return;
        }

        const start = GLib.get_monotonic_time() / 1000;
        const duration = target < from ? RAMP_DOWN_MS : RAMP_UP_MS;
        let last = from;

        this._rampId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, RAMP_TICK_MS, () => {
            const t = Math.min(1, (GLib.get_monotonic_time() / 1000 - start) / duration);
            const eased = 1 - (1 - t) ** 2;
            const value = Math.round(from + (target - from) * eased);

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
        return this._lastWritten;
    }

    _write(value) {
        this._lastWritten = value;
        this._writeDBus(value);
    }

    _writeDBus(value) {
        Gio.DBus.session.call(
            'org.gnome.SettingsDaemon.Power', '/org/gnome/SettingsDaemon/Power',
            'org.freedesktop.DBus.Properties', 'Set',
            new GLib.Variant('(ssv)', [
                'org.gnome.SettingsDaemon.Power.Screen', 'Brightness', new GLib.Variant('i', value),
            ]),
            null, Gio.DBusCallFlags.NONE, -1, null,
            (conn, res) => {
                try {
                    conn.call_finish(res);
                } catch (e) {
                    this._fail(`Brightness control unavailable: ${e}`);
                }
            });
    }

    _fail(message) {
        console.error(`[DynamicBrightness] ${message}`);
        this.stop();
        this._onUnavailable?.();
    }
}
