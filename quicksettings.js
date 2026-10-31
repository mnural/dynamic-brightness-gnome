import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';

import {RangeSlider} from './rangeslider.js';

const DynamicBrightnessToggle = GObject.registerClass(
class DynamicBrightnessToggle extends QuickSettings.QuickMenuToggle {
    _init(extension, settings, gicon) {
        super._init({
            title: 'Dynamic',
            subtitle: 'Brightness',
            gicon,
            toggleMode: true,
        });
        this._settings = settings;
        this._gicon = gicon;

        // The toggle and is-active stay in sync both ways; the extension follows is-active.
        settings.bind('is-active', this, 'checked', Gio.SettingsBindFlags.DEFAULT);
        this.connect('destroy', () => Gio.Settings.unbind(this, 'checked'));

        const min = settings.get_int('min-brightness');
        const max = settings.get_int('max-brightness');

        this._rangeLabel = new PopupMenu.PopupMenuItem('', {reactive: false});
        this.menu.addMenuItem(this._rangeLabel);

        this._sliderItem = new PopupMenu.PopupBaseMenuItem({activate: false});
        this._slider = new RangeSlider({
            low: min / 100, high: max / 100,
            floor: 0, step: 0.05, minGap: 0.1,
        });
        this._sliderItem.add_child(this._slider);
        this.menu.addMenuItem(this._sliderItem);

        this._slider.connectObject(
            'notify::low', () => this._onRangeChanged(),
            'notify::high', () => this._onRangeChanged(),
            this);

        this._explanation = new PopupMenu.PopupMenuItem(
            'Brightness stays within this range based on your screen content and the curve in Settings.',
            {reactive: false});
        const text = this._explanation.label.clutter_text;
        text.line_wrap = true;
        text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
        text.ellipsize = Pango.EllipsizeMode.NONE;
        this._explanation.label.style = 'font-size: 0.85em;';
        this._explanation.label.opacity = 180;
        this.menu.addMenuItem(this._explanation);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const settingsItem = new PopupMenu.PopupMenuItem('Settings');
        settingsItem.connectObject('activate', () => {
            Main.panel.statusArea.quickSettings.menu.close();
            extension.openPreferences();
        }, this);
        this.menu.addMenuItem(settingsItem);

        this._setRangeLabel(min, max);
    }

    // Shows whether adjusting is active, or why it stopped.
    sync(active, unavailableReason) {
        const running = active && !unavailableReason;

        let subtitle = 'Off';
        if (active)
            subtitle = unavailableReason ?? 'Active';
        this.menu.setHeader(this._gicon, 'Dynamic Brightness', subtitle);

        for (const item of [this._rangeLabel, this._sliderItem, this._explanation])
            item.sensitive = running;
        this._slider.reactive = running;
        this._slider.opacity = running ? 255 : 128;
    }

    _onRangeChanged() {
        const min = Math.round(this._slider.low * 100);
        const max = Math.round(this._slider.high * 100);
        this._setRangeLabel(min, max);

        // Written live, on 5% steps only, so an open prefs graph follows the drag.
        if (this._settings.get_int('min-brightness') !== min)
            this._settings.set_int('min-brightness', min);
        if (this._settings.get_int('max-brightness') !== max)
            this._settings.set_int('max-brightness', max);
    }

    _setRangeLabel(min, max) {
        this._rangeLabel.label.text = `Range: ${min}% – ${max}%`;
    }
});

export const DynamicBrightnessIndicator = GObject.registerClass(
class DynamicBrightnessIndicator extends QuickSettings.SystemIndicator {
    _init(extension, settings) {
        super._init();
        this._settings = settings;
        this._unavailableReason = null;

        const gicon = Gio.icon_new_for_string(`${extension.path}/dynamic-brightness-symbolic.svg`);
        this._icon = this._addIndicator();
        this._icon.gicon = gicon;

        this._toggle = new DynamicBrightnessToggle(extension, settings, gicon);
        this.quickSettingsItems.push(this._toggle);

        settings.connectObject(
            'changed::is-active', () => this._sync(),
            'changed::show-indicator', () => this._sync(),
            this);
        this._sync();
    }

    // Shows why adjusting stopped; null clears it.
    setUnavailable(reason) {
        this._unavailableReason = reason;
        this._sync();
    }

    _sync() {
        const active = this._settings.get_boolean('is-active');
        this._icon.visible = active && !this._unavailableReason &&
            this._settings.get_boolean('show-indicator');
        this._toggle.sync(active, this._unavailableReason);
    }

    destroy() {
        this._settings.disconnectObject(this);
        this.quickSettingsItems.forEach(item => item.destroy());
        super.destroy();
    }
});
