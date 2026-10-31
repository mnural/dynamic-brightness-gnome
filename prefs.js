import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {CurveEditorWidget} from './prefs/graph.js';

export default class DynamicBrightnessPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        // Open tall enough to show the curve editor without scrolling, but never taller than the screen
        const CONTENT_WIDTH = 650;
        const CONTENT_HEIGHT = 650;

        const monitor = Gdk.Display.get_default().get_monitors().get_item(0);
        const screenHeight = monitor?.get_geometry().height ?? CONTENT_HEIGHT;
        window.set_default_size(CONTENT_WIDTH, Math.min(CONTENT_HEIGHT, Math.round(screenHeight * 0.9)));

        const settings = this.getSettings();

        // ==========================================
        //                (GENERAL)
        // ==========================================
        const pageGeneral = new Adw.PreferencesPage({
            title: 'General',
            icon_name: 'preferences-system-symbolic',
        });

        const behaviorGroup = new Adw.PreferencesGroup({title: 'Behavior'});
        pageGeneral.add(behaviorGroup);

        const indicatorRow = new Adw.SwitchRow({
            title: 'Show Panel Indicator',
            subtitle: 'Display an icon in the top bar while active',
        });
        behaviorGroup.add(indicatorRow);
        settings.bind('show-indicator', indicatorRow, 'active', Gio.SettingsBindFlags.DEFAULT);

        const fullscreenRow = new Adw.SwitchRow({
            title: 'Pause in Fullscreen',
            subtitle: 'Pause dynamic brightness when a game or video is fullscreen',
        });
        behaviorGroup.add(fullscreenRow);
        settings.bind('pause-fullscreen', fullscreenRow, 'active', Gio.SettingsBindFlags.DEFAULT);

        const manualOffRow = new Adw.SwitchRow({
            title: 'Turn Off on Manual Change',
            subtitle: 'Turn off when you change brightness yourself',
        });
        behaviorGroup.add(manualOffRow);
        settings.bind('disable-on-manual-change', manualOffRow, 'active', Gio.SettingsBindFlags.DEFAULT);

        const smoothRow = new Adw.SwitchRow({
            title: 'Smooth Transitions',
            subtitle: 'Fade between brightness levels instead of switching instantly',
        });
        behaviorGroup.add(smoothRow);
        settings.bind('smooth-transitions', smoothRow, 'active', Gio.SettingsBindFlags.DEFAULT);

        const hysteresisRow = new Adw.SpinRow({
            title: 'Hysteresis',
            subtitle: 'Ignore content brightness changes smaller than this (%)',
            adjustment: new Gtk.Adjustment({lower: 1, upper: 20, step_increment: 1}),
        });
        behaviorGroup.add(hysteresisRow);
        settings.bind('hysteresis', hysteresisRow, 'value', Gio.SettingsBindFlags.DEFAULT);

        const captureRateRow = new Adw.ComboRow({
            title: 'Sampling Rate',
            subtitle: 'How often the screen is checked while its content changes',
            model: Gtk.StringList.new([
                '10 Hz',
                '5 Hz (default)',
                '4 Hz',
                '3 Hz',
                '2 Hz',
                '1 Hz',
            ]),
        });
        behaviorGroup.add(captureRateRow);
        settings.bind('capture-rate', captureRateRow, 'selected', Gio.SettingsBindFlags.DEFAULT);

        // ==========================================
        //          (ADVANCED / CURVE)
        // ==========================================
        const pageAdvanced = new Adw.PreferencesPage({
            title: 'Advanced',
            icon_name: 'preferences-other-symbolic',
        });

        const curveEditor = new CurveEditorWidget(settings);

        const curveGroup = new Adw.PreferencesGroup({
            title: 'Brightness Curve',
        });

        const curveLabelRow = new Adw.ActionRow({
            title: 'Drag the points to set how screen brightness responds to content brightness',
        });

        const resetButton = new Gtk.Button({
            icon_name: 'edit-clear-symbolic',
            tooltip_text: 'Reset curve',
            valign: Gtk.Align.CENTER,
        });
        resetButton.connect('clicked', () => curveEditor.resetCurve());
        curveLabelRow.add_suffix(resetButton);

        curveGroup.add(curveLabelRow);
        curveGroup.add(new Adw.PreferencesRow({
            child: curveEditor,
            activatable: false,
        }));

        const curveNoteRow = new Adw.ActionRow({
            subtitle: "If 'Automatic Screen Brightness' is enabled, GNOME also uses the ambient light sensor, so the final brightness may differ from this graph.",
        });
        curveGroup.add(curveNoteRow);
        pageAdvanced.add(curveGroup);

        window.add(pageGeneral);
        window.add(pageAdvanced);

        settings.set_boolean('is-prefs-open', true);

        window.connect('close-request', () => {
            settings.set_boolean('is-prefs-open', false);
            settings.set_double('current-luminance', -1);
            curveEditor.cleanup();
            return false;
        });
    }
}
