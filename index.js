var locks = require("locks");
var mutex = locks.createMutex();

var request = require("request");
var Service, Accessory, Characteristic, DoorState;

module.exports = function(homebridge) {
	Service = homebridge.hap.Service;
	Accessory = homebridge.hap.Accessory;
	Characteristic = homebridge.hap.Characteristic;
	DoorState = homebridge.hap.Characteristic.CurrentDoorState;

	uuid = homebridge.hap.uuid;
	homebridge.registerAccessory("homebridge-http-garagedoorcontroller", "HttpGarageDoorController", HttpGarageDoorControllerAccessory);
}

function getConfigValue(config, key, defaultVal) {
	var val = config[key];

	if (val == null) {
		return defaultVal;
	}

	return val;
}

function HttpGarageDoorControllerAccessory(log, config) {
	this.log = log;
	this.version = require("./package.json").version;
	log("Starting HttpGarageDoorControllerAccessory v" + this.version);

	// Read and validate HTTP configuration
	var configurationValid = true;

	this.httpHost = getConfigValue(config, "httpHost", null);
	if (!this.httpHost) {
		this.log.error("ERROR - Missing or invalid configuration field 'httpHost'");
		configurationValid = false;
	}

	this.httpPort = parseInt(getConfigValue(config, "httpPort", 80)) || 0;
	if (!this.httpPort || (this.httpPort <= 0)) {
		this.log.error("ERROR - Missing or invalid configuration field 'httpPort'");
		configurationValid = false;
	}

	this.httpStatusPollMilliseconds = parseInt(getConfigValue(config, "httpStatusPollMilliseconds", 4000));
	if (!this.httpStatusPollMilliseconds || isNaN(this.httpStatusPollMilliseconds)) {
		this.log.error("ERROR - Missing or invalid configuration field 'httpStatusPollMilliseconds'");
		configurationValid = false;
	}

	this.httpHeaderName = getConfigValue(config, "httpHeaderName", null);
	if (this.httpHeaderName) {
		this.httpHeaderValue = getConfigValue(config, "httpHeaderValue", null);
		if (!this.httpHeaderValue) {
			this.log.error("ERROR - Missing or invalid configuration field 'httpHeaderValue' when 'httpHeaderName' is set");
			configurationValid = false;
		}
	}

	// Read and validate door configuration
	this.name = getConfigValue(config, "name", null);
	if (!this.name) {
		this.log.error("ERROR - Missing or invalid configuration field 'name'");
		configurationValid = false;
	}

	this.doorStateUrl = getConfigValue(config, "doorStateUrl", null);
	if (this.doorStateUrl) {
		this.doorStateField = getConfigValue(config, "doorStateField", null);
		if (!this.doorStateField) {
			this.log.error("ERROR - Missing or invalid configuration field 'doorStateField' when 'doorStateUrl' is set");
			configurationValid = false;
		}
	} else {
		this.doorOperationSeconds = parseInt(getConfigValue(config, "doorOperationSeconds", 0)) || 0;
		if (!this.doorOperationSeconds || (this.doorOperationSeconds <= 0)) {
			this.log.error("ERROR - Missing or invalid configuration field 'doorOperationSeconds' when 'doorStateUrl' is not set");
			configurationValid = false;
		}
	}

	this.doorOpenUrl = getConfigValue(config, "doorOpenUrl", null);
	if (!this.doorOpenUrl) {
		this.log.error("ERROR - Missing or invalid configuration field 'doorOpenUrl'");
		configurationValid = false;
	}

	this.doorCloseUrl = getConfigValue(config, "doorCloseUrl", null);
	if (!this.doorCloseUrl) {
		this.log.error("ERROR - Missing or invalid configuration field 'doorCloseUrl'");
		configurationValid = false;
	}

	this.doorSuccessField = getConfigValue(config, "doorSuccessField", null);
	if (!this.doorSuccessField) {
		this.log.error("ERROR - Missing or invalid configuration field 'doorSuccessField'");
		configurationValid = false;
	}

	// Read and validate light configuration
	this.lightName = getConfigValue(config, "lightName", null);

	if (this.lightName) {
		this.lightStateUrl = getConfigValue(config, "lightStateUrl", null);
		if (this.lightStateUrl) {
			this.lightStateField = getConfigValue(config, "lightStateField", null);
			if (!this.lightStateField) {
				this.log.error("ERROR - Missing or invalid configuration field 'lightStateField' when 'lightStateUrl' is set");
				configurationValid = false;
			}
		}

		this.lightOnUrl = getConfigValue(config, "lightOnUrl", null);
		if (!this.lightOnUrl) {
			this.log.error("ERROR - Missing or invalid configuration field 'lightOnUrl' when 'lightName' is set");
			configurationValid = false;
		}

		this.lightOffUrl = getConfigValue(config, "lightOffUrl", null);
		if (!this.lightOffUrl) {
			this.log.error("ERROR - Missing or invalid configuration field 'lightOffUrl' when 'lightName' is set");
			configurationValid = false;
		}

		this.lightSuccessField = getConfigValue(config, "lightSuccessField", null);
		if (!this.lightSuccessField) {
			this.log.error("ERROR - Missing or invalid configuration field 'lightSuccessField'");
			configurationValid = false;
		}
	}

	if (configurationValid) {
		// Fully configured, initialise services
		this.initServices();
	}
}

HttpGarageDoorControllerAccessory.prototype = {
	getServices: function() {
		this.log.debug("Entered getServices()");

		var availableServices = [];

		if (!this.accessoryInformationService) {
			this.accessoryInformationService = new Service.AccessoryInformation();
			this.accessoryInformationService.setCharacteristic(Characteristic.Manufacturer, "Warren Ashcroft");
			this.accessoryInformationService.setCharacteristic(Characteristic.Model, "HttpGarageDoorController");

			if (this.garageDoorService) {
				this.accessoryInformationService.setCharacteristic(Characteristic.SerialNumber, this.garageDoorService.UUID);
			}
		}

		availableServices.push(this.accessoryInformationService);

		if (this.garageDoorService) {
			availableServices.push(this.garageDoorService);
		}

		if (this.garageLightService) {
			availableServices.push(this.garageLightService);
		}

		return availableServices;
	},

	initServices: function() {
		this.log.debug("Entered initServices()");

		this.garageDoorService = new Service.GarageDoorOpener(this.name);

		this.garageDoorCurrentState = this.garageDoorService.getCharacteristic(Characteristic.CurrentDoorState);
		this.garageDoorCurrentState.on("get", this.getDoorCurrentState.bind(this));

		this.garageDoorTargetState = this.garageDoorService.getCharacteristic(Characteristic.TargetDoorState);
		this.garageDoorTargetState.on("get", this.getDoorTargetState.bind(this));
		this.garageDoorTargetState.on("set", this.setDoorTargetState.bind(this));

		this._doorTargetState = DoorState.CLOSED;
		this._doorCurrentState = DoorState.CLOSED;
		this._setDoorCurrentState(this._doorCurrentState, true);

		if (this.lightName) {
			this.garageLightService = new Service.Lightbulb(this.lightName);

			this.garageLightCurrentState = this.garageLightService.getCharacteristic(Characteristic.On);
			this.garageLightCurrentState.on("get", this.getLightCurrentState.bind(this));
			this.garageLightCurrentState.on("set", this.setLightCurrentState.bind(this));

			this._lightCurrentState = false;
			this._setLightCurrentState(this._lightCurrentState, true);
		}

		if (this._hasDoorState() || this._hasLightState()) {
			this._checkStates(true);
		}
	},

	getDoorCurrentState: function(callback) {
		this.log.debug("Entered getDoorCurrentState()");

		var that = this;
		this._determineDoorState(function(error, state) {
			if (error) {
				var error = new Error("ERROR in getDoorCurrentState() - " + error.message);
				that.log.error(error.message);
				callback(error);
				return;
			}

			callback(null, state);
		});
	},

	getDoorTargetState: function(callback) {
		this.log.debug("Entered getDoorTargetState()");
		callback(null, this._doorTargetState);
	},

	setDoorTargetState: function(newState, callback) {
		this.log.debug("Entered setDoorTargetState(newState: %s)", this._doorStateToString(newState));

		if (this._doorTargetState == newState) {
			callback();
			return;
		}

		this.log.info("Received request to operate the Garage Door: %s (currently %s, target %s)", this._doorStateToString(newState), this._doorStateToString(this._doorCurrentState), this._doorStateToString(this._doorTargetState));

		var that = this;
		this._httpRequest("PUT", (newState == DoorState.OPEN ? this.doorOpenUrl : this.doorCloseUrl), this.doorSuccessField, true, function(error, response, json) {
			if (error) {
				var error = new Error("ERROR in setDoorTargetState() - " + error.message);
				that.log.error(error.message);
				callback(error);
				return;
			}

			that._setDoorTargetState(newState);

			// When no status is available, create a callback to set current state to target state after the specified amount of time
			if (!that._hasDoorState()) {
				var setDoorTargetStateFinal = function() {
					this._setDoorCurrentState(this._doorTargetState);
				};

				setTimeout(setDoorTargetStateFinal.bind(that), that.doorOperationSeconds * 1000);
			}

			callback();
		});
	},

	getLightCurrentState: function(callback) {
		this.log.debug("Entered getLightCurrentState()");

		var that = this;
		this._determineLightState(function(error, state) {
			if (error) {
				var error = new Error("ERROR in getLightCurrentState() - " + error.message);
				that.log.error(error.message);
				callback(error);
				return;
			}

			callback(null, state);
		});
	},

	setLightCurrentState: function(newState, callback) {
		this.log.debug("Entered setLightCurrentState(newState: %s)", newState);

		if (this._lightCurrentState == newState) {
			callback();
			return;
		}

		this.log.info("Received request to operate the Garage Light: %s (currently %s)", (newState ? "ON" : "OFF"), this._lightCurrentState);

		var that = this;
		this._httpRequest("PUT", (newState ? this.lightOnUrl : this.lightOffUrl), this.lightSuccessField, true, function(error, response, json) {
			if (error) {
				var error = new Error("ERROR in setLightCurrentState() - " + error.message);
				that.log.error(error.message);
				callback(error);
				return;
			}

			that._setLightCurrentState(newState);
			callback();
		});
	},

	_checkStates: function(initial) {
		this.log.debug("Entered _checkStates(initial: %s)", (initial || false));

		var that = this;

		if (this._hasDoorState()) {
			this._determineDoorState(function(error, doorState, lightState) {
				if (error) {
					that.log.error("ERROR in _checkStates() - " + error.message);
				} else {
					that._setDoorCurrentState(doorState, initial);

					if (lightState != null) {
						that._setLightCurrentState(lightState, initial);
					}
				}
			});
		}

		// If the door state and light state share the same API, the light state will have been set above
		if (this._hasLightState() && (this.doorStateUrl != this.lightStateUrl)) {
			this._determineLightState(function(error, lightState) {
				if (error) {
					that.log.error("ERROR in _checkStates() - " + error.message);
				} else {
					that._setLightCurrentState(lightState, initial);
				}
			});
		}

		setTimeout(that._checkStates.bind(that), that.httpStatusPollMilliseconds);
	},

	_determineDoorState: function(done) {
		this.log.debug("Entered _determineDoorState()");

		if (!this._hasDoorState()) {
			done(null, this._doorCurrentState);
			return;
		}

		var that = this;
		this._httpRequest("GET", this.doorStateUrl, this.doorStateField, null, function(error, response, json) {
			if (error) {
				done(new Error("ERROR in _determineDoorState() - " + error.message));
				return;
			}

			var doorState = that._doorStateToState(json[that.doorStateField]);

			if (doorState == null) {
				done(new Error("ERROR in _determineDoorState() - The JSON field value of the HTTP response was unexpected: " + json[that.doorStateField]));
				return;
			}

			// If the door state and light state share the same API, return the light state too
			var lightState = null;

			if (that._hasLightState() && (that.doorStateUrl == that.lightStateUrl) && json.hasOwnProperty(that.lightStateField)) {
				lightState = (json[that.lightStateField] == true);
			}

			done(null, doorState, lightState);
		});
	},

	_determineLightState: function(done) {
		this.log.debug("Entered _determineLightState()");

		if (!this._hasLightState()) {
			done(null, this._lightCurrentState);
			return;
		}

		var that = this;
		that._httpRequest("GET", this.lightStateUrl, this.lightStateField, null, function(error, response, json) {
			if (error) {
				done(new Error("ERROR in _determineLightState() - " + error.message));
				return;
			}

			var lightState = (json[that.lightStateField] == true);
			done(null, lightState);
		});
	},

	_setDoorCurrentState: function(state, initial, isFromTargetState) {
		this.log.debug("Entered _setDoorCurrentState(state: %s, initial: %s, isFromTargetState: %s)", this._doorStateToString(state), (initial || false), (isFromTargetState || false));

		if ((this._doorCurrentState == state) && (!initial)) {
			return;
		}

		this.log.info("%s Garage Door state is: %s", (initial ? "INITIAL" : "NEW"), this._doorStateToString(state));

		this._doorCurrentState = state;
		this.garageDoorCurrentState.setValue(this._doorCurrentState);

		if (!isFromTargetState) {
			if ((state == DoorState.OPEN) || (state == DoorState.OPENING)) {
				this._setDoorTargetState(DoorState.OPEN, initial, true);
			} else if ((state == DoorState.CLOSED) || (state == DoorState.CLOSING)) {
				this._setDoorTargetState(DoorState.CLOSED, initial, true);
			}
		}
	},

	_setDoorTargetState: function(state, initial, isFromCurrentState) {
		this.log.debug("Entered _setDoorTargetState(state: %s, initial: %s, isFromCurrentState: %s)", this._doorStateToString(state), (initial || false), (isFromCurrentState || false));

		if ((this._doorTargetState == state) && (!initial)) {
			return;
		}

		this.log.info("%s Garage Door target state is: %s", (initial ? "INITIAL" : "NEW"), this._doorStateToString(state));

		this._doorTargetState = state;
		this.garageDoorTargetState.setValue(this._doorTargetState);

		if (!isFromCurrentState) {
			if (state == DoorState.OPEN) {
				this._setDoorCurrentState(DoorState.OPENING, initial, true);
			} else if (state == DoorState.CLOSED) {
				this._setDoorCurrentState(DoorState.CLOSING, initial, true);
			}
		}
	},

	_setLightCurrentState: function(state, initial) {
		this.log.debug("Entered _setLightCurrentState(state: %s, initial: %s)", state, (initial || false));

		if ((this._lightCurrentState == state) && (!initial)) {
			return;
		}

		this.log.info("%s Garage Light state is: %s", (initial ? "INITIAL" : "NEW"), state);

		this._lightCurrentState = state;
		this.garageLightCurrentState.setValue(this._lightCurrentState);
	},

	_doorStateToString: function(doorState) {
		switch (doorState) {
			case DoorState.OPEN:
				return "OPEN";
			case DoorState.CLOSED:
				return "CLOSED";
			case DoorState.OPENING:
				return "OPENING";
			case DoorState.CLOSING:
				return "CLOSING";
			case DoorState.STOPPED:
				return "STOPPED";
			default:
				return "UNKNOWN";
		}
	},

	_doorStateToState: function(doorState) {
		switch (doorState.toUpperCase()) {
			case "OPEN":
				return DoorState.OPEN;
			case "CLOSED":
				return DoorState.CLOSED;
			case "OPENING":
				return DoorState.OPENING;
			case "CLOSING":
				return DoorState.CLOSING;
			case "UNKNOWN":
			case "STOPPED":
			case "STOPPED-OPENING":
			case "STOPPED-CLOSING":
				return DoorState.STOPPED;
			default:
				return null;
		}
	},

	_hasDoorState: function() {
		return (this.doorStateUrl != null);
	},

	_hasLightState: function() {
		return (this.lightStateUrl != null);
	},

	_httpRequest: function(method, url, expectedJsonField, expectedJsonFieldValue, done) {
		mutex.lock(function() {
			var options = {
				timeout: 5000,
				method: method,
				url: "http://" + this.httpHost + ((this.httpPort == 80) ? "" : ":" + this.httpPort) + url
			};

			if (this.httpHeaderName) {
				var headers = {};
				headers[this.httpHeaderName] = this.httpHeaderValue;
				options.headers = headers;
			}

			var that = this;
			this.log.debug("Requesting HTTP Garage Door Controller URI '%s'...", url);

			request(options, function(error, response, body) {
				var json = null;

				if (error) {
					that.log.debug("Request failed! - %s", error.message);
					error = new Error("An error occurred during the HTTP request: " + error.message);
				} else {
					that.log.debug("Request completed!");

					if ((response.statusCode < 200) || (response.statusCode > 299)) {
						error = new Error("The status code of the HTTP response was unexpected: " + response.statusCode);
					}

					try {
						json = JSON.parse(body);
					} catch (jsonError) {
						json = null;
						error = new Error("The JSON body of the HTTP response could not be parsed: " + jsonError.message);
					}

					if ((json != null) && (expectedJsonField != null)) {
						if (!json.hasOwnProperty(expectedJsonField)) {
							error = new Error("The JSON body of the HTTP response does not contain the field: " + expectedJsonField);
						} else if ((expectedJsonFieldValue != null) && (json[expectedJsonField] != expectedJsonFieldValue)) {
							error = new Error("The JSON field value of the HTTP response was unexpected: " + success);
						}
					}
				}

				mutex.unlock();
				done(error, response, ((json != null) ? json : body));
			});
		}.bind(this));
	}
};