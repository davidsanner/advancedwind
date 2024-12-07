module.exports = function(app) {
    const plugin = {};
    let unsubscribes = [];

    plugin.id = "signalk-wind-gradient-plugin";
    plugin.name = "Wind Gradient Plugin";
    plugin.description = "Calculates corrected apparent wind, true wind speed, and true wind angle based on vessel motion, including leeway and normalization to 10m height.";

    plugin.schema = {
        type: "object",
        properties: {
            windInstrumentSource: {
                type: "string",
                title: "Data source for apparent wind",
                default: "Default"
            },
            attitudeSource: {
                type: "string",
                title: "Data source for pitch and roll",
                default: "Default"
            },
            boatSpeedSource: {
                type: "string",
                title: "Data source for boat speed",
                default: "Default"
            },
            speedType: {
                type: "string",
                title: "Base boat speed on",
                enum: ["speedOverGround", "speedThroughWater"],
                default: "speedThroughWater"
            },
            heightAboveWater: {
                type: "number",
                title: "Wind sensor height Above Water (meters)"
            },
            windExponent: {
                type: "number",
                title: "Wind profile exponent (alpha)",
                default: 0.14
            }
        }
    };

    // Store previous values
    let apparentWindSpeed = null;
    let apparentWindAngle = null;
    let boatSpeed = null;
    let boatHeading = null;
    let heelAngle = null;

    plugin.start = function(options) {
        app.debug("Plugin started with options:", options);

        const calculateLeeway = (boatSpeed, windSpeed, heelAngle) => {
            return 0.4 * (boatSpeed / windSpeed) + 0.3 * Math.sin(heelAngle);
        };

        const calculateTrueWind = (aws, awa, boatSpeed, boatHeading) => {
            const apparentWindX = aws * Math.cos(awa);
            const apparentWindY = aws * Math.sin(awa);

            const boatSpeedX = boatSpeed * Math.cos(boatHeading);
            const boatSpeedY = boatSpeed * Math.sin(boatHeading);

            const trueWindX = apparentWindX + boatSpeedX;
            const trueWindY = apparentWindY + boatSpeedY;

            const trueWindSpeed = Math.sqrt(trueWindX ** 2 + trueWindY ** 2);
            const trueWindAngle = Math.atan2(trueWindY, trueWindX);

            return { trueWindSpeed, trueWindAngle };
        };

        const adjustTrueWindForLeeway = (trueWindSpeed, trueWindAngle, leewayAngle) => {
            const adjustedTrueWindAngle = trueWindAngle - leewayAngle;
            return { trueWindSpeed, adjustedTrueWindAngle };
        };

        const normalizeWindSpeedTo10m = (windSpeed, sensorHeight, exponent) => {
            // Power law normalization to 10 meters
            return windSpeed * Math.pow(10 / sensorHeight, exponent);
        };

        const processBoatData = (path, sourceId) => (delta) => {
            delta.updates.forEach((update) => {
                if (update.source && update.source.talker === sourceId) {
                    const data = update.values.find((value) => value.path === path);
                    if (data) {
                        if (
                            (path === "navigation.speedOverGround" && options.speedType === "speedOverGround") ||
                            (path === "navigation.speedThroughWater" && options.speedType === "speedThroughWater")
                        ) {
                            boatSpeed = data.value; // m/s
                            app.debug(`Boat speed received (${options.speedType}): ${boatSpeed}`);
                        } else if (path === "navigation.headingTrue") {
                            boatHeading = data.value; // Heading of the boat (in radians)
                            app.debug(`Boat heading received: ${boatHeading}`);
                        } else if (path === "navigation.heeling") {
                            heelAngle = data.value; // Heel angle in radians
                            app.debug(`Heel angle received: ${heelAngle}`);
                        }
                    }
                }
            });
        };

        const processWindData = (path, sourceId) => (delta) => {
            delta.updates.forEach((update) => {
                if (update.source && update.source.talker === sourceId) {
                    const data = update.values.find((value) => value.path === path);
                    if (data) {
                        if (path === "environment.wind.speedApparent") {
                            apparentWindSpeed = data.value;
                            app.debug(`Apparent Wind Speed received: ${apparentWindSpeed}`);
                            publishTrueWindData();
                        } else if (path === "environment.wind.angleApparent") {
                            apparentWindAngle = data.value; // In radians
                            app.debug(`Apparent Wind Angle received: ${apparentWindAngle}`);
                            publishTrueWindData();
                        }
                    }
                }
            });
        };

        const publishTrueWindData = () => {
            if (apparentWindSpeed && apparentWindAngle && boatSpeed !== null && boatHeading !== null && heelAngle !== null) {
                const leewayAngle = calculateLeeway(boatSpeed, apparentWindSpeed, heelAngle);
                app.debug(`Leeway angle: ${leewayAngle} radians`);

                const { trueWindSpeed, trueWindAngle } = calculateTrueWind(
                    apparentWindSpeed,
                    apparentWindAngle,
                    boatSpeed,
                    boatHeading
                );

                const { trueWindSpeed: adjustedTrueWindSpeed, adjustedTrueWindAngle } = adjustTrueWindForLeeway(
                    trueWindSpeed,
                    trueWindAngle,
                    leewayAngle
                );

                // Normalize true wind speed to 10m height using Power Law
                const normalizedTrueWindSpeed = normalizeWindSpeedTo10m(
                    adjustedTrueWindSpeed,
                    options.heightAboveWater,
                    options.windExponent
                );

                app.handleMessage(plugin.id, {
                    updates: [
                        {
                            values: [
                                {
                                    path: "environment.wind.speedTrue",
                                    value: normalizedTrueWindSpeed
                                },
                                {
                                    path: "environment.wind.angleTrue",
                                    value: adjustedTrueWindAngle
                                }
                            ]
                        }
                    ]
                });
            }
        };

        

        // Subscriptions
        if (options.windInstrumentSource) {
            unsubscribes.push(
                app.signalk.on("delta", processWindData("environment.wind.speedApparent", options.windInstrumentSource))
            );
            unsubscribes.push(
                app.signalk.on("delta", processWindData("environment.wind.angleApparent", options.windInstrumentSource))
            );
        }
        if (options.boatSpeedSource) {
            unsubscribes.push(
                app.signalk.on(
                    "delta",
                    processBoatData(
                        options.speedType === "speedOverGround"
                            ? "navigation.speedOverGround"
                            : "navigation.speedThroughWater",
                        options.boatSpeedSource
                    )
                )
            );
            unsubscribes.push(
                app.signalk.on("delta", processBoatData("navigation.headingTrue", options.boatSpeedSource))
            );
            unsubscribes.push(
                app.signalk.on("delta", processBoatData("navigation.heeling", options.boatSpeedSource))
            );
        }

        app.debug("Subscriptions set up.");
    };

    plugin.stop = function() {
        unsubscribes.forEach((unsub) => unsub());
        app.debug("Plugin stopped.");
    };

    return plugin;


     // Back-calculate the apparent wind from the true wind and boat speed
     backCalculateApparentWind(trueWindSpeed, trueWindAngle, boatSpeed) {
        // Calculate true wind components in X and Y
        const trueWindX = trueWindSpeed * Math.cos(trueWindAngle);
        const trueWindY = trueWindSpeed * Math.sin(trueWindAngle);

        // Boat speed is only in the forward (X) direction
        const boatSpeedX = boatSpeed;

        // Back-calculate the apparent wind components
        const apparentWindX = trueWindX - boatSpeedX;
        const apparentWindY = trueWindY;

        // Calculate apparent wind speed and angle
        const apparentWindSpeed = Math.sqrt(apparentWindX ** 2 + apparentWindY ** 2);
        const apparentWindAngle = Math.atan2(apparentWindY, apparentWindX);

        return { apparentWindSpeed, apparentWindAngle };
    }

    // Update the apparent wind and publish it
    updateApparentWind() {
        // Assuming we have a method to get the true wind values (e.g., from a sensor or calculation)
        const trueWindSpeed = this.windSpeed;  // Example: use the wind speed directly for simplicity
        const trueWindAngle = this.windAngle;  // Example: use the wind angle directly for simplicity

        // Back-calculate the apparent wind based on current true wind and boat speed
        const { apparentWindSpeed, apparentWindAngle } = this.backCalculateApparentWind(trueWindSpeed, trueWindAngle, this.boatSpeed);

        // Publish the apparent wind to SignalK
        this.app.signalk.set('vessels.self.wind.apparentSpeed', apparentWindSpeed);
        this.app.signalk.set('vessels.self.wind.apparentAngle', apparentWindAngle);

        // Log the calculated apparent wind speed and angle for debugging purposes
        console.log(`Apparent Wind Speed: ${apparentWindSpeed}, Apparent Wind Angle: ${apparentWindAngle}`);
    }
};
