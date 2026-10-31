import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {hasAmbientLightSensor} from './als.js';
import {BrightnessWriter} from './brightness.js';
import {ContentSampler} from './capture.js';
import {loadCurve, evalCurve, toBrightness} from './curve.js';
import {DynamicBrightnessIndicator} from './quicksettings.js';

// gsd's automatic brightness writes the same value we do, so the two fight. It only
// runs when a light sensor exists; ambient-enabled defaults to true even without one,
// and Settings just hides the switch then.
function isAutoBrightnessConflict(hasSensor) {
    if (!hasSensor)
        return false;

    const schema = Gio.SettingsSchemaSource.get_default()
        .lookup('org.gnome.settings-daemon.plugins.power', true);
    if (!schema?.has_key('ambient-enabled'))
        return false;

    return new Gio.Settings({settings_schema: schema}).get_boolean('ambient-enabled');
}

export default class DynamicBrightnessExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._curve = loadCurve(this._settings);
        this._lastLuminance = -1;
        this._hasSensor = false;

        this._brightness = new BrightnessWriter({
            onUnavailable: () => this._setUnavailable('Brightness control unavailable'),
        });
        this._brightness.smooth = this._settings.get_boolean('smooth-transitions');

        this._sampler = new ContentSampler(this._settings, {
            onLuminance: luminance => this._adjustBrightness(luminance),
            onFailure: () => this._setUnavailable('Screen capture failed'),
        });

        this._indicator = new DynamicBrightnessIndicator(this, this._settings);
        Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);

        this._settings.connectObject('changed', (_settings, key) => this._onSettingChanged(key), this);

        // The conflict check needs to know whether there is a light sensor,
        // so only start once that is known.
        hasAmbientLightSensor().then(hasSensor => {
            if (!this._settings)   // disabled in the meantime
                return;
            this._hasSensor = hasSensor;
            if (this._settings.get_boolean('is-active'))
                this._start();
        });
    }

    disable() {
        this._stop();
        this._settings.disconnectObject(this);

        this._indicator.destroy();
        this._indicator = null;
        this._sampler.destroy();
        this._sampler = null;
        this._brightness.destroy();
        this._brightness = null;
        this._settings = null;
    }

    _start() {
        if (isAutoBrightnessConflict(this._hasSensor)) {
            Main.notify('Dynamic Brightness',
                'Automatic Screen Brightness is on and conflicts with this extension on GNOME 48 and earlier. ' +
                'Turn it off in Settings › Power, then turn Dynamic Brightness on again.');
            this._settings.set_boolean('is-active', false);   // the toggle follows
            return;
        }

        this._indicator.setUnavailable(null);   // try again each time it is turned on
        this._lastLuminance = -1;
        this._sampler.start();
    }

    _stop() {
        this._sampler.stop();
        this._brightness.stop();
        this._settings.set_double('current-luminance', -1);   // clears the operating point in an open prefs graph
    }

    _setUnavailable(reason) {
        this._stop();
        this._indicator.setUnavailable(reason);
    }

    _onSettingChanged(key) {
        switch (key) {
        case 'is-active':
            if (this._settings.get_boolean('is-active'))
                this._start();
            else
                this._stop();
            break;
        case 'smooth-transitions':
            this._brightness.smooth = this._settings.get_boolean('smooth-transitions');
            break;
        case 'brightness-curve':
            this._curve = loadCurve(this._settings);
            this._lastLuminance = -1;   // apply the new curve without waiting for hysteresis
            break;
        case 'min-brightness':
        case 'max-brightness':
            this._lastLuminance = -1;   // same for a new range
            break;
        }
    }

    _adjustBrightness(luminance) {
        if (this._settings.get_boolean('is-prefs-open')) {
            const rounded = Math.round(luminance);
            if (rounded !== this._settings.get_double('current-luminance'))
                this._settings.set_double('current-luminance', rounded);
        }

        // Hysteresis on content brightness: small content changes are ignored.
        if (this._lastLuminance >= 0 &&
            Math.abs(this._lastLuminance - luminance) < this._settings.get_int('hysteresis'))
            return;
        this._lastLuminance = luminance;

        const curveValue = evalCurve(this._curve, luminance / 100);
        const target = toBrightness(curveValue,
            this._settings.get_int('min-brightness'), this._settings.get_int('max-brightness'));

        // Never write a hard 0: on some panels that switches the backlight off.
        this._brightness.apply(Math.max(1, target));
    }
}
