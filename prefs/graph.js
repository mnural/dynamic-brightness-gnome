import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';
import cairo from 'gi://cairo';
import {POINT_COUNT, loadCurve, evalCurve, toBrightness} from '../curve.js';

const PAD_L = 48, PAD_R = 48, PAD_T = 26, PAD_B = 28;

// Editor for the brightness curve: 11 points at fixed content brightness
// steps, dragged up and down to set the screen brightness for each step.
export const CurveEditorWidget = GObject.registerClass(
    class CurveEditorWidget extends Gtk.Box {
        _init(settings) {
            super._init({
                orientation: Gtk.Orientation.VERTICAL,
                hexpand: true,
                vexpand: true,
                height_request: 340,
                margin_top: 12, margin_bottom: 12, margin_start: 12, margin_end: 12,
            });

            this._settings = settings;
            this._pointRadius = 7;
            this._draggedPoint = null;

            // x positions are fixed (0, 20, 40, ... 100); only y is editable
            this._points = Array.from({ length: POINT_COUNT }, (_, i) => ({
                x: (i / (POINT_COUNT - 1)) * 100,
                y: 100,
            }));
            this._loadCurve();

            this._drawingArea = new Gtk.DrawingArea({ hexpand: true, vexpand: true });
            this._drawingArea.set_draw_func(this._draw.bind(this));

            const dragGesture = new Gtk.GestureDrag();
            dragGesture.connect('drag-begin', this._onDragBegin.bind(this));
            dragGesture.connect('drag-update', this._onDragUpdate.bind(this));
            dragGesture.connect('drag-end', this._onDragEnd.bind(this));
            this._drawingArea.add_controller(dragGesture);

            this._yTitle = new Gtk.Label({
                halign: Gtk.Align.START,
            });

            const xTitle = new Gtk.Label({
                label: 'Content Brightness',
                halign: Gtk.Align.CENTER,
                hexpand: true,
                margin_start: PAD_L,
                margin_end: PAD_R,
            });

            this.append(this._yTitle);
            this.append(this._drawingArea);
            this.append(xTitle);

            this._currentLuminance = settings.get_double('current-luminance');
            this._luminanceChangedId = settings.connect('changed::current-luminance', () => {
                this._currentLuminance = settings.get_double('current-luminance');
                this._drawingArea.queue_draw();
            });

            const readRange = () => {
                this._rangeMin = settings.get_int('min-brightness');
                this._rangeMax = settings.get_int('max-brightness');
                this._yTitle.label =
                    `Screen Brightness (Range: ${this._rangeMin}% – ${this._rangeMax}%)`;
            };
            readRange();

            this._rangeChangedIds = ['min-brightness', 'max-brightness'].map(key =>
                settings.connect(`changed::${key}`, () => {
                    readRange();
                    this._drawingArea.queue_draw();
                }));

            this.connect('destroy', () => this.cleanup());
        }

        _loadCurve() {
            loadCurve(this._settings).forEach((y, i) => (this._points[i].y = y));
        }

        _saveCurve() {
            this._settings.set_value(
                'brightness-curve',
                new GLib.Variant('ad', this._points.map(p => p.y))
            );
        }

        resetCurve() {
            this._settings.reset('brightness-curve');
            this._loadCurve();
            this._drawingArea.queue_draw();
        }

        _plotArea(width, height) {
            return {
                w: width - PAD_L - PAD_R,
                h: height - PAD_T - PAD_B,
            };
        }

        _toScreen(point, plot) {
            return {
                cx: PAD_L + (point.x / 100) * plot.w,
                cy: PAD_T + plot.h - (point.y / 100) * plot.h,
            };
        }

        _evalCurveAt(x) {
            return evalCurve(this._points.map(p => p.y), x / 100);
        }

        _draw(area, cr, width, height) {
            const plot = this._plotArea(width, height);
            const fg = area.get_color();
            const ink = (alpha) => cr.setSourceRGBA(fg.red, fg.green, fg.blue, alpha);

            // Current operating point, if the extension is running
            const hasCurrent = this._currentLuminance >= 0;
            const curX = PAD_L + (this._currentLuminance / 100) * plot.w;
            const curCurveValue = hasCurrent ? this._evalCurveAt(this._currentLuminance) : 0;
            const curY = PAD_T + plot.h - (curCurveValue / 100) * plot.h;

            ink(0.05);
            cr.rectangle(PAD_L, PAD_T, plot.w, plot.h);
            cr.fill();

            cr.selectFontFace('Sans', cairo.FontSlant.NORMAL, cairo.FontWeight.NORMAL);
            cr.setFontSize(10);

            for (let i = 0; i <= 10; i++) {
                // Vertical grid line and x label (content brightness, unchanged)
                const xLabel = `${i * 10}%`;
                const xExt = cr.textExtents(xLabel);
                const x = PAD_L + (i / 10) * plot.w;

                ink(0.10);
                cr.setLineWidth(1);
                cr.moveTo(x, PAD_T);
                cr.lineTo(x, PAD_T + plot.h);
                cr.stroke();

                ink(0.60);
                cr.moveTo(x - xExt.width / 2, PAD_T + plot.h + 18);
                cr.showText(xLabel);

                // Horizontal grid line and y label (real brightness within the range)
                const yLabel = `${toBrightness(i * 10, this._rangeMin, this._rangeMax)}%`;
                const yExt = cr.textExtents(yLabel);
                const y = PAD_T + plot.h - (i / 10) * plot.h;

                ink(0.10);
                cr.moveTo(PAD_L, y);
                cr.lineTo(PAD_L + plot.w, y);
                cr.stroke();

                ink(0.60);
                cr.moveTo(PAD_L - yExt.width - 12, y + yExt.height / 2);
                cr.showText(yLabel);
            }

            if (hasCurrent) {
                ink(0.45);
                cr.setLineWidth(2);
                cr.setDash([4, 3], 0);

                cr.moveTo(curX, PAD_T);
                cr.lineTo(curX, curY);
                cr.stroke();

                cr.moveTo(curX, curY);
                cr.lineTo(PAD_L + plot.w, curY);
                cr.stroke();

                cr.setDash([], 0);
            }

            ink(0.9);
            cr.setLineWidth(3);
            this._points.forEach((p, i) => {
                const { cx, cy } = this._toScreen(p, plot);
                if (i === 0) cr.moveTo(cx, cy);
                else cr.lineTo(cx, cy);
            });
            cr.stroke();

            ink(1.0);
            for (const p of this._points) {
                const { cx, cy } = this._toScreen(p, plot);
                cr.arc(cx, cy, this._pointRadius, 0, 2 * Math.PI);
                cr.fill();
            }

            if (hasCurrent) {

                cr.selectFontFace('Sans', cairo.FontSlant.NORMAL, cairo.FontWeight.NORMAL);
                cr.setFontSize(10);
                ink(0.7);

                const topLabel = `${Math.round(this._currentLuminance)}%`;
                const topExt = cr.textExtents(topLabel);
                const tx = Math.max(PAD_L, Math.min(curX - topExt.width / 2, PAD_L + plot.w - topExt.width));
                cr.moveTo(tx, PAD_T - 10);
                cr.showText(topLabel);

                const sideLabel = `${toBrightness(curCurveValue, this._rangeMin, this._rangeMax)}%`;
                const sideExt = cr.textExtents(sideLabel);
                cr.moveTo(PAD_L + plot.w + 10, curY + sideExt.height / 2);
                cr.showText(sideLabel);
            }

            cr.$dispose();
        }

        _onDragBegin(gesture, startX, startY) {
            const plot = this._plotArea(
                this._drawingArea.get_width(),
                this._drawingArea.get_height()
            );

            this._draggedPoint = null;

            for (const p of this._points) {
                const { cx, cy } = this._toScreen(p, plot);
                if (Math.hypot(cx - startX, cy - startY) <= this._pointRadius + 6) {
                    this._draggedPoint = p;
                    break;
                }
            }
            this._dragSnapshot = this._draggedPoint ? this._points.map(p => p.y) : null;
        }

        _onDragUpdate(gesture, offsetX, offsetY) {
            if (!this._draggedPoint) return;

            const plot = this._plotArea(
                this._drawingArea.get_width(),
                this._drawingArea.get_height()
            );

            const [, , startY] = gesture.get_start_point();
            const currentY = startY + offsetY;

            const pts = this._points;
            const idx = pts.indexOf(this._draggedPoint);

            // Recompute from the positions at drag start, so points pushed aside
            // spring back if the drag reverses before it ends.
            pts.forEach((p, i) => (p.y = this._dragSnapshot[i]));

            const rawY = 100 - ((currentY - PAD_T) / plot.h) * 100;
            const newY = Math.max(0, Math.min(100, Math.round(rawY / 5) * 5));
            pts[idx].y = newY;

            // Keep the curve non-increasing by sweeping neighbours along:
            // earlier points are pushed up, later points are pushed down.
            for (let j = idx - 1; j >= 0 && pts[j].y < newY; j--)
                pts[j].y = newY;
            for (let j = idx + 1; j < pts.length && pts[j].y > newY; j++)
                pts[j].y = newY;

            this._drawingArea.queue_draw();
        }

        _onDragEnd() {
            if (this._draggedPoint)
                this._saveCurve();
            this._draggedPoint = null;
            this._dragSnapshot = null;
        }

        cleanup() {
            for (const id of [this._luminanceChangedId, ...this._rangeChangedIds])
                if (id)
                    this._settings.disconnect(id);
            this._luminanceChangedId = 0;
            this._rangeChangedIds = [];
        }
    }
);
