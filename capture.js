import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import Clutter from 'gi://Clutter';
import Mtk from 'gi://Mtk';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const CAPTURE_INTERVALS_MS = [100, 200, 250, 333, 500, 1000];
const MAX_CAPTURE_FAILURES = 5;

// ~2% scale is plenty for an average and keeps the readback tiny.
const SCALE = 0.02;

// stage.paint_to_content returns wrong colours while window open/close
// animations run (seen with shader effects such as Burn My Windows). Those
// frames have non-opaque pixels, which a normal composited frame never has.
const MIN_OPAQUE_RATIO = 0.9;

// Measures the content brightness of the primary monitor whenever the screen changes
export class ContentSampler {
    constructor(settings, {onLuminance, onFailure}) {
        this._settings = settings;
        this._onLuminance = onLuminance;
        this._onFailure = onFailure;

        this._running = false;
        this._paintId = 0;
        this._timeoutId = 0;
        this._lastCaptureTime = 0;
        this._failCount = 0;
    }

    get running() {
        return this._running;
    }

    start() {
        this._running = true;
        this._failCount = 0;
        this._queue();
    }

    stop() {
        this._running = false;
        if (this._timeoutId) {
            GLib.Source.remove(this._timeoutId);
            this._timeoutId = 0;
        }
        if (this._paintId) {
            global.stage.disconnect(this._paintId);
            this._paintId = 0;
        }
    }

    destroy() {
        this.stop();
    }

    // The stage repainted, i.e. something on screen changed: measure again.
    _armPaintSignal() {
        if (this._paintId || !this._running)
            return;
        this._paintId = global.stage.connect('after-paint', () => {
            global.stage.disconnect(this._paintId);
            this._paintId = 0;
            this._queue();
        });
    }

    // Measures right away if the last capture was long enough ago, otherwise as
    // soon as the interval allows, so changes are seen fast but never more often.
    _queue() {
        if (this._timeoutId || !this._running)
            return;

        const interval = CAPTURE_INTERVALS_MS[this._settings.get_int('capture-rate')];
        const now = GLib.get_monotonic_time() / 1000;
        const delay = Math.max(0, Math.ceil(interval - (now - this._lastCaptureTime)));

        this._timeoutId = GLib.timeout_add(GLib.PRIORITY_LOW, delay, () => {
            this._timeoutId = 0;
            this._lastCaptureTime = GLib.get_monotonic_time() / 1000;
            this._sample().catch(e =>
                console.error(`[DynamicBrightness] Unexpected error: ${e}`));
            return GLib.SOURCE_REMOVE;
        });
    }

    async _sample() {
        // Listen for the next change before anything else.
        this._armPaintSignal();

        if (this._settings.get_boolean('pause-fullscreen') && isPrimaryFullscreen())
            return;

        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor || monitor.width <= 0 || monitor.height <= 0)
            return;

        let luminance;
        try {
            luminance = await measureArea(monitor);
        } catch (e) {
            console.error(`[DynamicBrightness] Capture error: ${e}`);
            if (++this._failCount > MAX_CAPTURE_FAILURES) {
                this.stop();
                this._onFailure();
            }
            return;
        }

        if (luminance === null || !this._running)   // skipped frame, or stopped during await
            return;

        this._failCount = 0;
        this._onLuminance(luminance);
    }
}

function isPrimaryFullscreen() {
    const index = Main.layoutManager.primaryIndex;
    return index >= 0 && global.display.get_monitor_in_fullscreen(index);
}

// Renders an area of the stage at a tiny scale and returns its average content brightness.
async function measureArea({x, y, width, height}) {
    const stage = global.stage;
    const rect = new Mtk.Rectangle({x, y, width, height});

    // GNOME 47+ takes a colour state argument, 46 does not.
    const content = stage.paint_to_content.length >= 4
        ? stage.paint_to_content(rect, SCALE, stage.get_color_state(), Clutter.PaintFlag.NO_CURSORS)
        : stage.paint_to_content(rect, SCALE, Clutter.PaintFlag.NO_CURSORS);
    if (!content)
        return null;

    const stream = Gio.MemoryOutputStream.new_resizable();
    const pixbuf = await Shell.Screenshot.composite_to_stream(
        content.get_texture(), 0, 0, -1, -1, 1, null, 0, 0, 1, stream);
    stream.close(null);

    return averageLuma(pixbuf);
}

function averageLuma(pixbuf) {
    const pixels = pixbuf.get_pixels();
    const channels = pixbuf.get_n_channels();
    const width = pixbuf.get_width();
    const height = pixbuf.get_height();
    const rowstride = pixbuf.get_rowstride();

    // The loop skips a 1px border, so anything smaller leaves no samples.
    if (width < 3 || height < 3)
        return null;

    let total = 0;
    let count = 0;
    let opaque = 0;

    // Skip the outer border: fractional scaling leaves partially covered
    // padding pixels there that would skew the opacity check.
    for (let row = 1; row < height - 1; row++) {
        for (let col = 1; col < width - 1; col++) {
            const i = row * rowstride + col * channels;
            if (channels < 4 || pixels[i + 3] === 255)
                opaque++;
            total += 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
            count++;
        }
    }

    if (opaque / count < MIN_OPAQUE_RATIO)
        return null;

    return total / count / 255 * 100;
}
