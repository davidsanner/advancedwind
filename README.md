# Wind Gradient Plugin for SignalK

This plugin calculates wind gradients using configurable parameters.

## Configuration Parameters
- **Wind Instrument Source ID**: The source ID for relative windspeed and angle.
- **Pitch Source ID**: The source ID for pitch measurements.
- **Roll Source ID**: The source ID for roll measurements.
- **Height Above Water**: The height of the wind instrument above the water level (in meters).
- **Wind Gradient Determination Method**: Choose between `manual` or `auto`.
- **Wind Gradient Value**: The value for wind gradient if `manual` is selected.
- **Upwash Value**: The upwash value.
- **Leeway Value**: The leeway value.

## Installation
1. Copy the plugin to the SignalK server's `node_modules` folder.
2. Restart the SignalK server.
3. Configure the plugin via the SignalK server web interface.
