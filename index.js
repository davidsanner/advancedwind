module.exports = function (app) {
  const plugin = {};
  let unsubscribes = [];


  plugin.id = "AdvancedWind";
  plugin.name = "Advanced Wind";
  plugin.description = "A plugin that calculates true wind (speed and angle) optionally correcting for vessel motion, upwash, leeway and mast height.";

  plugin.schema = {
    type: "object",
    properties: {
      correctForMisalign: {
        type: "boolean",
        title: "Correct for sensor misalignment",
        description: "A misaligned sensor gives faulty wind direction."
      },
      correctForMastRotation: {
        type: "boolean",
        title: "Correct for mast rotation",
        description: "For vessels with a rotating mast. The correction aligns the sensor with the vessel."
      },
      correctForHeight: {
        type: "boolean",
        title: "Normalize wind speed to 10 meters above sea level",
        description: "Wind speed increases with height above the ground or water. To compare your boat's performance to polar data (based on a 10-meter wind height), this correction adjusts measured wind speed using the height of your sensor and a wind gradient model."
      },
      correctForMastMovement: {
        type: "boolean",
        title: "Compensate for mast motion due to waves",
        description: "The mast amplifies the vessel's rolling and pitching, introducing errors in wind speed and angle measurements. This correction removes the influence of mast motion by accounting for the sensor's movement."
      },
      correctForMastHeel: {
        type: "boolean",
        title: "Adjust for sensor tilt on a heeled mast",
        description: "A heeled mast tilts the wind sensor, causing it to underreport wind speed. This correction calculates the tilt effect based on the boat's heel and pitch, restoring accurate wind measurements."
      },
      correctForUpwash: {
        type: "boolean",
        title: "Account for upwash distortion",
        description: "Sails bend the airflow, causing the apparent wind angle at the sensor to differ from the true wind angle. This correction estimates and compensates for upwash, improving wind direction accuracy."
      },
      correctForLeeway: {
        type: "boolean",
        title: "Adjust for sideways drift (leeway)",
        description: "The wind pushes the boat sideways, creating leeway that affects the apparent wind at the sensor. This correction estimates leeway using boat speed, wind speed, and heel angle."
      },
      backCalculate: {
        type: "boolean",
        title: "Back calculate apparent wind",
        description: "Calculate apparent wind from true wind, effectively applying all checked corrections to apparent wind as well."
      }, 
      useSog: {
        type: "boolean",
        title: "Use Speed Over Ground (SOG) as boat speed",
        description: "When calculating true wind, boat speed through water (STW) is subtracted from apparent wind speed. If STW is unreliable, using GPS-based Speed Over Ground (SOG) can be an alternative, but note that currents can affect accuracy."
      },
      sensorMisalignment: {
        type: "number",
        title: "Misalignment of the wind sensor (°)",
        description: "Enter the misalignment of the windsensor in degrees",
        default: 0,
      },
      rotationPath: {
        type: "string",
        title: "Path for mast rotation",
        description: "Enter the path for mast rotation.",
      },
      heightAboveWater: {
        type: "number",
        title: "Wind sensor height Above Water (meters)",
        description: "Enter the height of the wind sensor above the waterline in meters. This is used for wind gradient correction and mast motion correction.",
        default: 15
      },
      windExponent: {
        type: "number",
        title: "Wind gradient parameter (α)",
        description: "This parameter defines how wind speed changes with height.Typical values are 0.1 to 0.15, depending on atmospheric conditions. Formula used: Normalised windspeed = windspeed * (10 / sensor height above water)^α. ",
        default: 0.14
      },
      upwashSlope: {
        type: "number",
        title: "Upwash slope (α)",
        description: "Defines the sensitivity of upwash correction to apparent wind angle. For racing yachts, use 0.05 to 0.1; for cruising yachts, use 0.03 to 0.07. Formula used: Upwash Angle (°) = α ⋅ AWA(°) + β(°). For racing yachts: 0.05 to 0.1, for cruising yachts: 0.03 to 0.07 ",
        default: 0.05,
        minimum: 0,
        maximum: 0.3,
      },
      upwashOffset: {
        type: "number",
        title: "Upwash offset(°) (β)",
        description: "Adds a constant offset to the upwash correction. Racing yachts typically use values between -1 and 1, while cruising yachts use 1 to 3. Formula used: Upwash Angle (°) = α ⋅ AWA(°) + β(°). For racing yachts: -1 to 1, for cruising yachts: 1 to 3",
        default: 1.5,
        minimum: -1,
        maximum: 4
      },
      leewaySpeed: {
        type: "number",
        title: "Leeway speed coefficient (α)",
        description: "Defines the contribution of boat speed to leeway. Wider or less efficient hulls have higher values (0.4–0.5); slender, high-performance hulls have lower values (0.3–0.4). Formula used: α ⋅ Vboat / Vwind + β ⋅ sin(Heel Angle).",
        default: 0.4,
        minumum: 0.3,
        maximum: 0.5
      },
      leewayAngle: {
        type: "number",
        title: "Leeway Heel Coefficient (β)",
        description: "Defines the effect of heel angle on leeway. Boats with higher centers of gravity have higher values (0.3–0.4); others use 0.2–0.3. Formula used: α ⋅ Vboat / Vwind + β ⋅ sin(Heel Angle). ",
        default: 0.3,
        minimum: 0.2,
        maximum: 0.4
      },
      timeConstant: {
        type: "number",
        title: "Output smoothing time constant",
        description: "Smooths true wind and back-calculated apparent wind outputs. A time constant of 0 disables smoothing, while higher values provide more stable readings.",
        default: 1,
        minimum: 0,
        maximum: 10
      },
      // windInstrumentSource: {
      //   type: "string",
      //   title: "Data source for apparent wind",
      // },
      // boatSpeedSource: {
      //   type: "string",
      //   title: "Data source for boat speed",
      // },
      // attitudeSource: {
      //   type: "string",
      //   title: "Data source for pitch and roll",
      // },
    }
  };

  plugin.start = (options, restartPlugin) => {
    app.debug('Plugin started');

    const apparentWind = { speed: 0, angle: 0 };
    const currentAttitude = { roll: 0, pitch: 0, yaw: 0, timestamp: new Date() };
    const previousAttitude = { roll: 0, pitch: 0, yaw: 0, timestamp: new Date() };
    const boatSpeed = { speed: 0, angle: 0 };
    const mast = { speed: 0, angle: 0 };

    function toVector(obj) {
      if ('x' in obj) return obj;
      return { x: obj.speed * Math.cos(obj.angle), y: obj.speed * Math.sin(obj.angle) };
    }

    function toPolar(obj) {
      if ('speed' in obj) return obj;
      return { speed: Math.sqrt(obj.x * obj.x + obj.y * obj.y), angle: Math.atan2(obj.y, obj.x) };
    }

    function calculateRotation(current, previous) {
      const deltaT = (current.timestamp - previous.timestamp) / 1000;
      if (deltaT == 0) return { roll: 0, pitch: 0, yaw: 0 };
      return {
        roll: (current.roll - previous.roll) / deltaT,
        pitch: (current.pitch - previous.pitch) / deltaT,
        yaw: (current.yaw - previous.yaw) / deltaT
      }
    }

    function rotate(v, R) {
      return {
        x: R[0][0] * v.x,
        y: R[1][0] * v.x + R[1][1] * v.y
      }
    }

    function getRotationMatrix(att) {
      /* const cosRoll = Math.cos(att.roll), sinRoll = Math.sin(att.roll);
      const cosPitch = Math.cos(att.pitch), sinPitch = Math.sin(att.pitch);

      const rotationMatrix = [
        [cosPitch, 0, sinPitch],
        [sinRoll * sinPitch, cosRoll, -cosPitch * sinRoll],
        [-cosRoll * sinPitch, sinRoll, cosRoll * cosPitch]
      ]
      return rotationMatrix; */
      return [[Math.cos(att.pitch), 0], [Math.sin(att.roll) * Math.sin(att.pitch), Math.cos(att.roll)]];
    }

    class ExponentialMovingAverage {
      constructor(timeConstant) {
        this.timeConstant = timeConstant * 1000; // Time constant (τ)
        this.ema = null; // Initial value
        this.lastTime = null; // Track the last update time
      }

      update(newValue, currentTime) {
        if (this.timeConstant == 0) return newValue;
        newValue = toVector(newValue);
        if (this.ema === null) {
          // Initialize EMA with the first value
          this.ema = newValue;
          this.lastTime = currentTime;
          return this.ema;
        }

        // Calculate the time difference
        const deltaTime = currentTime - this.lastTime;

        // Compute alpha
        const alpha = 1 - Math.exp(-deltaTime / this.timeConstant);

        // Update EMA
        this.ema.x = this.ema.x + alpha * (newValue.x - this.ema.x);
        this.ema.y = this.ema.y + alpha * (newValue.y - this.ema.y);

        // Update last time
        this.lastTime = currentTime;

        return Object.assign({}, this.ema);
      }
    }

    const dampenedTrueWind = new ExponentialMovingAverage(options.timeConstant);
    const dampenedApparentWind = new ExponentialMovingAverage(options.timeConstant);
    let localSubscription = {
      context: "vessels.self",
      subscribe: [
        {
          path: "environment.wind.speedApparent",
          policy: "instant",
          //source: options.windInstrumentSource,
        },
        {
          path: "environment.wind.angleApparent",
          policy: "instant",
          //source: options.windInstrumentSource,
        },
      ]
    };
    if (options.correctForMastHeel || options.correctForMastMovement) {
      localSubscription.subscribe.push({
        path: "navigation.attitude",
        policy: "instant",
        //source: options.attitudeSource,
      });
    }
    if (options.useSog) {
      localSubscription.subscribe.push({
        path: "navigation.speedOverGround",
        policy: "instant",
        //source: options.boatSpeedSource,
      });
    }
    else {
      localSubscription.subscribe.push({
        path: "navigation.speedThroughWater",
        policy: "instant",
        //source: options.boatSpeedSource,
      });
    }
    if (options.correctForMastRotation) {
      localSubscription.subscribe.push({
        path: options.rotationPath,
        policy: "instant",
        // source: options.boatSpeedSource,
      });
    }

    // subscribe to deltas
    app.subscriptionmanager.subscribe(
      localSubscription,
      unsubscribes,
      subscriptionError => {
        app.error('Error:' + subscriptionError);
      },
      delta => {
        delta.updates.forEach(u => {
          if (u.source?.label === plugin.id) {
            // Ignore updates that originate from this plugin
            return;
          }
          u.values.forEach(v => {
            //app.debug(`${v.path} = ${v.value}`);
            switch (v.path) {
              case "environment.wind.speedApparent":
                apparentWind.speed = v.value;
                //app.debug(new Date(u.timestamp));
                processDeltas(new Date(u.timestamp));
                break;
              case "environment.wind.angleApparent":
                apparentWind.angle = v.value;
                break;
              case "navigation.attitude":
                currentAttitude.pitch = v.value.pitch;
                currentAttitude.roll = v.value.roll;
                currentAttitude.timestamp = new Date(u.timestamp);
                break;
              case "navigation.speedOverGround":
                  boatSpeed.speed = v.value;
                break;
              case "navigation.speedThroughWater":
                  boatSpeed.speed = v.value;
                break;
              default:
                if (v.path == options.rotationPath) {
                  mast.angle = v.value;
                }
                else {
                  app.debug(`Unhandled subscription: ${v.path}`);
                }
                break;
            }
          });

        });
      }
    );

    // calculate deltas from input
    function processDeltas(timestamp) {
      // delta windspeed serves as a trigger for calculations;
      wind = Object.assign({}, apparentWind);
      boat = Object.assign({}, boatSpeed);
      if (options.correctForMisalign) wind = addAngle(wind, options.sensorMisalignment);
      if (options.correctForMastRotation) wind = addAngle(wind, mast.angle);
      if (options.correctForUpwash) wind = correctForUpwash(wind);
      if (options.correctForMastHeel) wind = correctForMastHeel(wind, currentAttitude);
      if (options.correctForMastMovement) wind = correctForMastMovement(wind, calculateRotation(currentAttitude, previousAttitude));
      if (options.correctForLeeway) boat = addLeeway(boat, wind, currentAttitude);
      wind = calculateTrueWind(wind, boat);
      if (options.correctForHeight) wind = normaliseToTen(wind);
      sendTrue( dampenedTrueWind.update(wind, timestamp));
      if (options.backCalculate) sendApparent(dampenedApparentWind.update(calculateApparentWind(wind, boat), timestamp));
      if (options.correctForLeeway) sendLeeway(boat);
      Object.assign(previousAttitude, currentAttitude);
    }

    function addAngle(wind, angle) {
      wind = toPolar(wind);
      wind.angle += angle;
      return wind;
    }

    // correct for wind upwash due to the sails close to the wind sensor
    function correctForUpwash(wind) {
      wind = toPolar(wind);
      return { speed: wind.speed, angle: (1 + options.upwashSlope) * wind.angle + options.upwashOffset * Math.PI / 180 };
    }

    // correct for the attitude of the boat and wind sensor
    // bug in TWA
    function correctForMastHeel(wind, attitude) {
      return rotate(toVector(wind), getRotationMatrix(attitude));
    }

    // correct for rolling and pitching of the boat 
    function correctForMastMovement(wind, rotation) {
      wind = toVector(wind);
      const r = options.heightAboveWater;
      const sensorSpeed = { x: rotation.pitch * r, y: rotation.roll * r };
      return {
        x: wind.x + sensorSpeed.x,
        y: wind.y + sensorSpeed.y,
        z: 0
      }
    }

    // calculate true wind
    function calculateTrueWind(wind, boat) {
      wind = toVector(wind);
      boat = toVector(boat);
      return {
        x: wind.x - boat.x,
        y: wind.y - boat.y,
      }
    }

    // normalise windspeed to a height of 10 metres above water
    function normaliseToTen(wind) {
      wind = toVector(wind);
      const factor = Math.pow((10 / options.heightAboveWater), options.windExponent);
      return {
        x: wind.x * factor,
        y: wind.y * factor
      }
    }

    // calculate apparent wind from true wind
    function calculateApparentWind(wind, boat) {
      wind = toVector(wind);
      boat = toVector(boat);
      return {
        x: wind.x + boat.x,
        y: wind.y + boat.y,
      }
    }

    // calculate leeway and add to boat speed
    function addLeeway(boat, wind, attitude) {
      boat = toPolar(boat);
      wind = toPolar(wind);
      const leeway = options.leewaySpeed * (boat.speed / wind.speed) + options.leewayAngle * Math.sin(attitude.roll);
      return {
        speed: boat.speed,
        angle: leeway
      };
    }

    // send all calculated deltas
    function sendTrue(trueWind) {
      trueWind = toPolar(trueWind);

      const delta = {
        context: 'vessels.self',
        updates: [
          {
            source: {
              label: plugin.id
            },
            values: [
              { path: 'environment.wind.angleTrueWater', value: trueWind.angle },
              { path: 'environment.wind.speedTrue', value: trueWind.speed },
            ]
          }]
      };
      //app.debug(delta.updates[0]);
      app.handleMessage(plugin.id, delta);
    }

    function sendLeeway( boatSpeed) {
      boatSpeed = toPolar(boatSpeed);
      boatSpeedVector = toVector(boatSpeed);

      const delta = {
        context: 'vessels.self',
        updates: [
          {
            source: {
              label: plugin.id
            },
            values: [
              { path: 'navigation/leewayAngle', value: boatSpeed.angle },
              { path: 'navigation/speedThroughWaterTransverse', value: boatSpeedVector.y },
            ]
          }]
      };
      //app.debug(delta.updates[0]);
      app.handleMessage(plugin.id, delta);
    }

    function sendApparent( appWind) {
      appWind = toPolar(appWind);
      const delta = {
        context: 'vessels.self',
        updates: [
          {
            source: {
              label: plugin.id
            },
            values: [
              { path: 'environment.wind.angleApparent', value: appWind.angle },
              { path: 'environment.wind.speedApparent', value: appWind.speed },
            ]
          }]
      };
      //app.debug(delta.updates[0]);
      app.handleMessage(plugin.id, delta);
    }
  }


  plugin.stop = () => {
    unsubscribes.forEach(f => f());
    unsubscribes = [];
  };
  return plugin;
};