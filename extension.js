import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {BrightnessWriter} from './brightness.js';
import {ContentSampler} from './capture.js';
import {loadCurve, evalCurve, toBrightness} from './curve.js';
import {DynamicBrightnessIndicator} from './quicksettings.js';

export default class DynamicBrightnessExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._curve = loadCurve(this._settings);
        this._lastLuminance = -1;

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
        Main.brightnessManager.connectObject('user-update', () => this._onUserBrightnessChange(), this);

        if (this._settings.get_boolean('is-active'))
            this._start();
    }

    disable() {
        this._stop();
        Main.brightnessManager.disconnectObject(this);
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

    _onUserBrightnessChange() {
        if (this._brightness.isWriting)   // our own write, not the user
            return;
        if (!this._sampler.running || !this._settings.get_boolean('disable-on-manual-change'))
            return;

        this._settings.set_boolean('is-active', false);   // the toggle and the loop follow
        Main.notify('Dynamic Brightness turned off',
            'Brightness was changed by the user.');
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
