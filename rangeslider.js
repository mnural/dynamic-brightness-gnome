import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';
import Cairo from 'cairo';

// Room around the handles for their anti-aliased edge, which would be clipped otherwise.
const EDGE = 1;

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

// A custom horizontal slider with two handles that selects a [low, high] range.
export const RangeSlider = GObject.registerClass({
    Properties: {
        'low': GObject.ParamSpec.double(
            'low', null, null,
            GObject.ParamFlags.READWRITE,
            0, 1, 0),
        'high': GObject.ParamSpec.double(
            'high', null, null,
            GObject.ParamFlags.READWRITE,
            0, 1, 1),
    },
}, class RangeSlider extends St.DrawingArea {
    _init({low = 0, high = 1, floor = 0, step = 0.05, minGap = 0.1} = {}) {
        this._floor = floor;
        this._step = step;
        this._minGap = minGap;

        this._low = this._snap(clamp(low, floor, 1 - minGap));
        this._high = this._snap(clamp(high, this._low + minGap, 1));

        this._barHeight = 0;
        this._handleRadius = 0;
        this._trackColor = null;
        this._activeColor = null;

        this._grab = null;
        this._activeHandle = null;
        this._dragStart = null;

        super._init({
            style_class: 'slider',
            reactive: true,
            x_expand: true,
        });

        this.connect('destroy', () => this._endDrag());
    }

    get low() {
        return this._low;
    }

    set low(value) {
        this._moveHandle('low', value);
    }

    get high() {
        return this._high;
    }

    set high(value) {
        this._moveHandle('high', value);
    }

    _snap(value) {
        return Math.round(Math.round(value / this._step) * this._step * 1000) / 1000;
    }

    _moveHandle(which, value) {
        const gap = this._minGap;

        let {low, high} = this._dragStart ?? {low: this._low, high: this._high};
        value = this._snap(value);

        if (which === 'low') {
            low = clamp(value, this._floor, 1 - gap);
            high = Math.max(high, low + gap);
        } else {
            high = clamp(value, this._floor + gap, 1);
            low = Math.min(low, high - gap);
        }

        this._setValues(this._snap(low), this._snap(high));
    }

    _setValues(low, high) {
        const lowChanged = low !== this._low;
        const highChanged = high !== this._high;
        if (!lowChanged && !highChanged)
            return;

        this._low = low;
        this._high = high;
        if (lowChanged)
            this.notify('low');
        if (highChanged)
            this.notify('high');
        this.queue_repaint();
    }

    vfunc_style_changed() {
        super.vfunc_style_changed();

        const node = this.get_theme_node();
        this._barHeight = node.get_length('-barlevel-height') || 4;
        this._handleRadius = node.get_length('-slider-handle-radius') || 8;
        this._trackColor = node.get_color('-barlevel-background-color');
        this._activeColor = node.get_color('-barlevel-active-background-color');

        this.queue_relayout();
    }

    vfunc_get_preferred_height(_forWidth) {
        const height = Math.ceil(Math.max(this._barHeight, 2 * (this._handleRadius + EDGE)));
        return this.get_theme_node().adjust_preferred_height(height, height);
    }

    vfunc_get_preferred_width(_forHeight) {
        const width = 4 * this._handleRadius;
        return this.get_theme_node().adjust_preferred_width(width, width);
    }

    _toX(value, width) {
        const inset = this._handleRadius + EDGE;
        return inset + (width - 2 * inset) * value;
    }

    vfunc_repaint() {
        const cr = this.get_context();
        const [width, height] = this.get_surface_size();
        const handleColor = this.get_theme_node().get_foreground_color();

        const r = this._handleRadius;
        const y = height / 2;
        const lowX = this._toX(this._low, width);
        const highX = this._toX(this._high, width);

        cr.setLineCap(Cairo.LineCap.ROUND);
        cr.setLineWidth(this._barHeight);

        const inset = r + EDGE;

        // Full track
        cr.setSourceColor(this._trackColor);
        cr.moveTo(inset, y);
        cr.lineTo(width - inset, y);
        cr.stroke();

        cr.setSourceColor(this._activeColor);
        cr.moveTo(lowX, y);
        cr.lineTo(highX, y);
        cr.stroke();

        cr.setSourceColor(handleColor);

        for (const x of [lowX, highX]) {
            cr.arc(x, y, r, 0, 2 * Math.PI);
            cr.fill();
        }

        cr.$dispose();
    }

    _valueAt(event) {
        const [absX] = event.get_coords();
        const [actorX] = this.get_transformed_position();
        const width = this.allocation.get_width();
        const inset = this._handleRadius + EDGE;
        return clamp((absX - actorX - inset) / (width - 2 * inset), 0, 1);
    }

    _startDrag(event) {
        if (this._activeHandle)
            return Clutter.EVENT_PROPAGATE;

        const value = this._valueAt(event);

        // Take whichever handle is closer, so a click outside the range
        // moves the nearer end and a click inside picks the closer edge.
        this._activeHandle =
            Math.abs(value - this._low) <= Math.abs(value - this._high) ? 'low' : 'high';

        this._dragStart = {low: this._low, high: this._high};
        this.grab_key_focus();
        this._grab = global.stage.grab(this);
        this._moveHandle(this._activeHandle, value);
        return Clutter.EVENT_STOP;
    }

    _endDrag() {
        this._grab?.dismiss();
        this._grab = null;
        this._dragStart = null;
        this._activeHandle = null;
    }

    vfunc_button_press_event(event) {
        return this._startDrag(event);
    }

    vfunc_motion_event(event) {
        if (!this._activeHandle)
            return Clutter.EVENT_PROPAGATE;

        this._moveHandle(this._activeHandle, this._valueAt(event));
        return Clutter.EVENT_STOP;
    }

    vfunc_button_release_event(_event) {
        if (!this._activeHandle)
            return Clutter.EVENT_PROPAGATE;

        this._endDrag();
        return Clutter.EVENT_STOP;
    }

    vfunc_touch_event(event) {
        switch (event.type()) {
        case Clutter.EventType.TOUCH_BEGIN:
            return this._startDrag(event);
        case Clutter.EventType.TOUCH_UPDATE:
            return this.vfunc_motion_event(event);
        case Clutter.EventType.TOUCH_END:
        case Clutter.EventType.TOUCH_CANCEL:
            return this.vfunc_button_release_event(event);
        default:
            return Clutter.EVENT_PROPAGATE;
        }
    }
});
