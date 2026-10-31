import Gio from 'gi://Gio';

// Resolves to true if an ambient light sensor is present, without waking it.
export async function hasAmbientLightSensor() {
    try {
        const proxy = await new Promise((resolve, reject) => {
            Gio.DBusProxy.new_for_bus(
                Gio.BusType.SYSTEM,
                Gio.DBusProxyFlags.NONE,
                null,
                'net.hadess.SensorProxy',
                '/net/hadess/SensorProxy',
                'net.hadess.SensorProxy',
                null,
                (source, res) => {
                    try {
                        resolve(Gio.DBusProxy.new_for_bus_finish(res));
                    } catch (e) {
                        reject(e);
                    }
                });
        });

        if (!proxy.get_name_owner())
            return false;

        return proxy.get_cached_property('HasAmbientLight')?.unpack() === true;
    } catch (e) {
        console.error(`[DynamicBrightness] SensorProxy unavailable: ${e}`);
        return false;
    }
}
