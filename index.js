/*
MIT License

Copyright (c) 2017 Warren Ashcroft

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
var mLocks = require("locks");
var checkStateMutex = mLocks.createMutex();
var httpRequestMutex = mLocks.createMutex();

var mCrypto = require("crypto");
var mRequest = require("request");

var Service, Accessory, Characteristic, DoorState;

module.exports = function(homebridge) {
	Service = homebridge.hap.Service;
	Accessory = homebridge.hap.Accessory;
	Characteristic = homebridge.hap.Characteristic;
	DoorState = homebridge.hap.Characteristic.CurrentDoorState;

	uuid = homebridge.hap.uuid;
	homebridge.registerAccessory("homebridge-http-garagedoorcontroller", "HttpGarageDoorController", HttpGarageDoorControllerAccessory);
}

function getConfigValue(config, key, defaultValue) {
	var val = config[key];

	if (val == null) {
		return defaultValue;
	}

	return val;
}

function base64Encode(string) {
	return (new Buffer(string)).toString('base64');
}

function percentEncode(string) {
	return encodeURIComponent(string).replace(/[!'()*]/g, x => `%${x.charCodeAt(0).toString(16).toUpperCase()}`);
}

function HttpGarageDoorControllerAccessory(log, config) {
	this.log = log;
	this.version = require("./package.json").version;
	log("Starting HttpGarageDoorControllerAccessory v" + this.version);

	this.apiConfig = {};
	var configurationValid = true;

	this.name = getConfigValue(config, "name", null);
	this.lightName = getConfigValue(config, "lightName", null);
	if (!this.name) {
		this.log.error("ERROR - Missing or invalid configuration field 'name'");
		configurationValid = false;
	}

	// Read and validate HTTP configuration
	this.httpSsl = getConfigValue(config, "httpSsl", false);

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

	this.httpRequestTimeoutMilliseconds = parseInt(getConfigValue(config, "httpRequestTimeoutMilliseconds", 10000));
	if (!this.httpRequestTimeoutMilliseconds || isNaN(this.httpRequestTimeoutMilliseconds)) {
		this.log.error("ERROR - Missing or invalid configuration field 'httpRequestTimeoutMilliseconds'");
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

	this.oauthAuthentication = getConfigValue(config, "oauthAuthentication", false);
	if (this.oauthAuthentication) {
		this.oauthSignatureMethod = getConfigValue(config, "oauthSignatureMethod", "HMAC-SHA1");
		if (!this.oauthSignatureMethod || ((this.oauthSignatureMethod != "HMAC-SHA1") && (this.oauthSignatureMethod != "HMAC-SHA256") && (this.oauthSignatureMethod != "PLAINTEXT"))) {
			this.log.error("ERROR - Missing or invalid configuration field 'oauthSignatureMethod' when 'oauthAuthentication' is enabled");
			configurationValid = false;
		}

		this.oauthConsumerKey = getConfigValue(config, "oauthConsumerKey", null);
		if (!this.oauthConsumerKey) {
			this.log.error("ERROR - Missing or invalid configuration field 'oauthConsumerKey' when 'oauthAuthentication' is enabled");
			configurationValid = false;
		}

		this.oauthConsumerSecret = getConfigValue(config, "oauthConsumerSecret", null);
		if (!this.oauthConsumerSecret) {
			this.log.error("ERROR - Missing or invalid configuration field 'oauthConsumerSecret' when 'oauthAuthentication' is enabled");
			configurationValid = false;
		}

		this.oauthToken = getConfigValue(config, "oauthToken", null);
		if (this.oauthToken) {
			this.oauthTokenSecret = getConfigValue(config, "oauthTokenSecret", null);

			if (this.oauthToken && !this.oauthTokenSecret) {
				this.log.error("ERROR - Missing or invalid configuration field 'oauthTokenSecret' when 'oauthToken' is set");
				configurationValid = false;
			}
		}
	}

	// Read and validate API configuration
	if (config.apiConfig == null) {
		this.log.error("ERROR - Missing or invalid configuration field 'apiConfig'");
		configurationValid = false;
	} else {
		this.apiConfig.apiType = getConfigValue(config.apiConfig, "apiType", null);
		if (!this.apiConfig.apiType || ((this.apiConfig.apiType != "HttpGarageDoorController") && (this.apiConfig.apiType != "Json") && (this.apiConfig.apiType != "Generic"))) {
			this.log.error("ERROR - Missing or invalid configuration field 'apiType'");
			configurationValid = false;
		}

		switch (this.apiConfig.apiType) {
			case "HttpGarageDoorController":
				this.httpSsl = false;
				this.oauthSignatureMethod = "HMAC-SHA256";

				this.apiConfig.doorSuccessField = "success";
				this.apiConfig.doorOpenMethod = "PUT";
				this.apiConfig.doorOpenUrl = "/controller/door/open";
				this.apiConfig.doorCloseMethod = "PUT";
				this.apiConfig.doorCloseUrl = "/controller/door/close";
				this.apiConfig.doorStateMethod = "GET";
				this.apiConfig.doorStateUrl = "/controller";
				this.apiConfig.doorStateField = "door-state";

				this.apiConfig.lightSuccessField = "success";
				this.apiConfig.lightOnMethod = "PUT";
				this.apiConfig.lightOnUrl = "/controller/light/on";
				this.apiConfig.lightOffMethod = "PUT";
				this.apiConfig.lightOffUrl = "/controller/light/off";
				this.apiConfig.lightStateMethod = "GET";
				this.apiConfig.lightStateUrl = "/controller";
				this.apiConfig.lightStateField = "light-state";
				break;

			case "Json":
			case "Generic":
				this.apiConfig.doorStateUrl = getConfigValue(config.apiConfig, "doorStateUrl", null);
				if (this.apiConfig.doorStateUrl) {
					this.apiConfig.doorStateMethod = getConfigValue(config.apiConfig, "doorStateMethod", null);
					if (!this.apiConfig.doorStateMethod || ((this.apiConfig.doorStateMethod != "GET") && (this.apiConfig.doorStateMethod != "POST") && (this.apiConfig.doorStateMethod != "PUT"))) {
						this.log.error("ERROR - Missing or invalid configuration field 'doorStateMethod' when 'doorStateUrl' is set");
						configurationValid = false;
					}
				} else {
					this.doorOperationSeconds = parseInt(getConfigValue(config.apiConfig, "doorOperationSeconds", 0)) || 0;
					if (!this.doorOperationSeconds || (this.doorOperationSeconds <= 0)) {
						this.log.error("ERROR - Missing or invalid configuration field 'doorOperationSeconds' when 'doorStateUrl' is not set");
						configurationValid = false;
					}
				}

				this.apiConfig.doorOpenMethod = getConfigValue(config.apiConfig, "doorOpenMethod", null);
				if (!this.apiConfig.doorOpenMethod || ((this.apiConfig.doorOpenMethod != "GET") && (this.apiConfig.doorOpenMethod != "POST") && (this.apiConfig.doorOpenMethod != "PUT"))) {
					this.log.error("ERROR - Missing or invalid configuration field 'doorOpenMethod'");
					configurationValid = false;
				}

				this.apiConfig.doorOpenUrl = getConfigValue(config.apiConfig, "doorOpenUrl", null);
				if (!this.apiConfig.doorOpenUrl) {
					this.log.error("ERROR - Missing or invalid configuration field 'doorOpenUrl'");
					configurationValid = false;
				}

				this.apiConfig.doorCloseMethod = getConfigValue(config.apiConfig, "doorCloseMethod", null);
				if (!this.apiConfig.doorCloseMethod || ((this.apiConfig.doorCloseMethod != "GET") && (this.apiConfig.doorCloseMethod != "POST") && (this.apiConfig.doorCloseMethod != "PUT"))) {
					this.log.error("ERROR - Missing or invalid configuration field 'doorCloseMethod'");
					configurationValid = false;
				}

				this.apiConfig.doorCloseUrl = getConfigValue(config.apiConfig, "doorCloseUrl", null);
				if (!this.apiConfig.doorCloseUrl) {
					this.log.error("ERROR - Missing or invalid configuration field 'doorCloseUrl'");
					configurationValid = false;
				}

				if (this.lightName) {
					this.apiConfig.lightStateUrl = getConfigValue(config.apiConfig, "lightStateUrl", null);
					if (this.apiConfig.lightStateUrl) {
						this.apiConfig.lightStateMethod = getConfigValue(config.apiConfig, "lightStateMethod", null);
						if (!this.apiConfig.lightStateMethod || ((this.apiConfig.lightStateMethod != "GET") && (this.apiConfig.lightStateMethod != "POST") && (this.apiConfig.lightStateMethod != "PUT"))) {
							this.log.error("ERROR - Missing or invalid configuration field 'lightStateMethod' when 'lightStateUrl' is set");
							configurationValid = false;
						}
					}

					this.apiConfig.lightOnMethod = getConfigValue(config.apiConfig, "lightOnMethod", null);
					if (!this.apiConfig.lightOnMethod || ((this.apiConfig.lightOnMethod != "GET") && (this.apiConfig.lightOnMethod != "POST") && (this.apiConfig.lightOnMethod != "PUT"))) {
						this.log.error("ERROR - Missing or invalid configuration field 'lightOnMethod' when 'lightName' is set");
						configurationValid = false;
					}

					this.apiConfig.lightOnUrl = getConfigValue(config.apiConfig, "lightOnUrl", null);
					if (!this.apiConfig.lightOnUrl) {
						this.log.error("ERROR - Missing or invalid configuration field 'lightOnUrl' when 'lightName' is set");
						configurationValid = false;
					}

					this.apiConfig.lightOffMethod = getConfigValue(config.apiConfig, "lightOffMethod", null);
					if (!this.apiConfig.lightOffMethod || ((this.apiConfig.lightOffMethod != "GET") && (this.apiConfig.lightOffMethod != "POST") && (this.apiConfig.lightOffMethod != "PUT"))) {
						this.log.error("ERROR - Missing or invalid configuration field 'lightOffMethod' when 'lightName' is set");
						configurationValid = false;
					}

					this.apiConfig.lightOffUrl = getConfigValue(config.apiConfig, "lightOffUrl", null);
					if (!this.apiConfig.lightOffUrl) {
						this.log.error("ERROR - Missing or invalid configuration field 'lightOffUrl' when 'lightName' is set");
						configurationValid = false;
					}
				}
				break;
		}

		switch (this.apiConfig.apiType) {
			case "Json":
				this.apiConfig.doorSuccessField = getConfigValue(config.apiConfig, "doorSuccessField", null);

				if (this.apiConfig.doorStateUrl) {
					this.apiConfig.doorStateField = getConfigValue(config.apiConfig, "doorStateField", null);
					if (!this.apiConfig.doorStateField) {
						this.log.error("ERROR - Missing or invalid configuration field 'doorStateField' when 'doorStateUrl' is set");
						configurationValid = false;
					}
				}

				if (this.lightName) {
					this.apiConfig.lightSuccessField = getConfigValue(config.apiConfig, "lightSuccessField", null);

					if (this.apiConfig.lightStateUrl) {
						this.apiConfig.lightStateField = getConfigValue(config.apiConfig, "lightStateField", null);
						if (!this.apiConfig.lightStateField) {
							this.log.error("ERROR - Missing or invalid configuration field 'lightStateField' when 'lightStateUrl' is set");
							configurationValid = false;
						}
					}
				}
				break;

			case "Generic":
				this.doorOpenSuccessContent = getConfigValue(config.apiConfig, "doorOpenSuccessContent", null);
				this.doorCloseSuccessContent = getConfigValue(config.apiConfig, "doorCloseSuccessContent", null);

				if (this.lightName) {
					this.lightOnSuccessContent = getConfigValue(config.apiConfig, "lightOnSuccessContent", null);
					this.lightOffSuccessContent = getConfigValue(config.apiConfig, "lightOffSuccessContent", null);
				}
				break;
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
			this.accessoryInformationService.setCharacteristic(Characteristic.Manufacturer, "(c) 2017 Warren Ashcroft");
			this.accessoryInformationService.setCharacteristic(Characteristic.Model, "HttpGarageDoorController");

			if (this.garageDoorService) {
				this.accessoryInformationService.setCharacteristic(Characteristic.Name, this.name);
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

		this.garageDoorObstructionDetected = this.garageDoorService.getCharacteristic(Characteristic.ObstructionDetected);
		this.garageDoorObstructionDetected.on("get", this.getDoorObstructionDetected.bind(this));

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

		if (this._hasStates()) {
			this._checkStates(true);
		}
	},

	getDoorCurrentState: function(callback) {
		this.log.debug("Entered getDoorCurrentState()");

		var error = null;
		if (this._hasStates() && ((Date.now() - this._doorCurrentStateSetAt) >= (this.httpStatusPollMilliseconds * 3))) {
			error = new Error("The Garage Door current state is unknown (last known: " + this._doorStateToString(this._doorCurrentState) + "), it hasn't been reported since " + (new Date(this._doorCurrentStateSetAt)).toString());
			this.log.error(error.message);
		}

		callback(error, this._doorCurrentState);
	},

	getDoorObstructionDetected: function(callback) {
		this.log.debug("Entered getDoorObstructionDetected()");

		var error = null;
		if (this._hasStates() && ((Date.now() - this._doorCurrentStateSetAt) >= (this.httpStatusPollMilliseconds * 3))) {
			error = new Error("The Garage Door current state is unknown (last known: " + this._doorStateToString(this._doorCurrentState) + "), it hasn't been reported since " + (new Date(this._doorCurrentStateSetAt)).toString());
			this.log.error(error.message);
		}

		callback(error, this._doorObstructionDetected);
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

		this.log.info("Received request to operate the Garage Door: %s (currently: %s, target: %s)", this._doorStateToString(newState), this._doorStateToString(this._doorCurrentState), this._doorStateToString(this._doorTargetState));

		var that = this;
		this._httpRequest((newState == DoorState.OPEN ? this.apiConfig.doorOpenMethod : this.apiConfig.doorCloseMethod), (newState == DoorState.OPEN ? this.apiConfig.doorOpenUrl : this.apiConfig.doorCloseUrl), this.apiConfig.doorSuccessField, true, (newState == DoorState.OPEN ? this.apiConfig.doorOpenSuccessContent : this.apiConfig.doorCloseSuccessContent), function(error, response, data) {
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

		var error = null;
		if (this._hasStates() && ((Date.now() - this._lightCurrentStateSetAt) >= (this.httpStatusPollMilliseconds * 3))) {
			error = new Error("The Garage Light current state is unknown (last known: " + this._lightStateToString(this._lightCurrentState) + "), it hasn't been reported since " + (new Date(this._lightCurrentStateSetAt)).toString());
			this.log.error(error.message);
		}

		callback(error, this._lightCurrentState);
	},

	setLightCurrentState: function(newState, callback) {
		this.log.debug("Entered setLightCurrentState(newState: %s)", newState);

		if (this._lightCurrentState == newState) {
			callback();
			return;
		}

		this.log.info("Received request to operate the Garage Light: %s (currently: %s)", this._lightStateToString(newState), this._lightStateToString(this._lightCurrentState));

		var that = this;
		this._httpRequest((newState ? this.apiConfig.lightOnMethod : this.apiConfig.lightOffMethod), (newState ? this.apiConfig.lightOnUrl : this.apiConfig.lightOffUrl), this.apiConfig.lightSuccessField, true, (newState ? this.apiConfig.lightOnSuccessContent : this.apiConfig.lightOffSuccessContent), function(error, response, data) {
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
			checkStateMutex.lock(function() {
				that._determineDoorState(function(error, doorState, lightState) {
					if (error) {
						that.log.error("ERROR in _checkStates() - " + error.message);
					} else {
						that._setDoorCurrentState(doorState, initial);

						if (lightState != null) {
							that._setLightCurrentState(lightState, initial);
						}
					}

					checkStateMutex.unlock();
				});
			});
		}

		// If the door state and light state share the same API, the light state will have been set above
		if (!this._hasDualState() && this.lightName) {
			checkStateMutex.lock(function() {
				that._determineLightState(function(error, lightState) {
					if (error) {
						that.log.error("ERROR in _checkStates() - " + error.message);
					} else {
						that._setLightCurrentState(lightState, initial);
					}

					checkStateMutex.unlock();
				});
			});
		}

		checkStateMutex.lock(function() {
			setTimeout(that._checkStates.bind(that), that.httpStatusPollMilliseconds);
			checkStateMutex.unlock();
		});
	},

	_determineDoorState: function(done) {
		this.log.debug("Entered _determineDoorState()");

		if (!this._hasDoorState()) {
			done(null, this._doorCurrentState);
			return;
		}

		var that = this;
		this._httpRequest(this.apiConfig.doorStateMethod, this.apiConfig.doorStateUrl, this.apiConfig.doorStateField, null, null, function(error, response, data) {
			if (error) {
				done(new Error("ERROR in _determineDoorState() - " + error.message));
				return;
			}

			var doorState = null;
			var lightState = null;

			if (that._isJsonApi()) {
				doorState = that._doorStateToState(data[that.apiConfig.doorStateField]);

				if (doorState == null) {
					done(new Error("ERROR in _determineDoorState() - The JSON field value of the HTTP response was unexpected and could not be translated to a valid door state: " + data[that.apiConfig.doorStateField]));
					return;
				}

				// If the door state and light state share the same API, return the light state too
				if (that._hasDualState() && data.hasOwnProperty(that.apiConfig.lightStateField)) {
					lightState = (data[that.apiConfig.lightStateField] == true);
				}
			} else {
				data = data.toUpperCase().trim();
				doorState = that._doorStateToState(data);

				if (doorState == null) {
					done(new Error("ERROR in _determineDoorState() - The HTTP response body was unexpected and could not be translated to a valid door state: " + data));
					return;
				}
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
		that._httpRequest(this.apiConfig.lightStateMethod, this.apiConfig.lightStateUrl, this.apiConfig.lightStateField, null, null, function(error, response, data) {
			if (error) {
				done(new Error("ERROR in _determineLightState() - " + error.message));
				return;
			}

			var lightState = null;

			if (that._isJsonApi()) {
				lightState = (data[that.apiConfig.lightStateField] == true);
			} else {
				data = data.toLowerCase().trim();
				lightState = ((data == "true") || (data == "yes") || (data == "on") || (data == "1"));
			}

			done(null, lightState);
		});
	},

	_setDoorCurrentState: function(state, initial, isFromTargetState) {
		this.log.debug("Entered _setDoorCurrentState(state: %s, initial: %s, isFromTargetState: %s)", this._doorStateToString(state), (initial || false), (isFromTargetState || false));
		this._doorCurrentStateSetAt = Date.now();

		if ((this._doorCurrentState == state) && (!initial)) {
			return;
		}

		this.log.info("%s Garage Door state is: %s", (initial ? "INITIAL" : "NEW"), this._doorStateToString(state));

		this._doorCurrentState = state;
		this.garageDoorCurrentState.setValue(this._doorCurrentState);

		this._doorObstructionDetected = (this._doorCurrentState == DoorState.STOPPED);
		this.garageDoorObstructionDetected.setValue(this._doorObstructionDetected);

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
		this._doorTargetStateSetAt = Date.now();

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
		this._lightCurrentStateSetAt = Date.now();

		if ((this._lightCurrentState == state) && (!initial)) {
			return;
		}

		this.log.info("%s Garage Light state is: %s", (initial ? "INITIAL" : "NEW"), this._lightStateToString(state));

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

	_lightStateToString: function(lightState) {
		if (lightState) {
			return "ON";
		} else {
			return "OFF";
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

	_isJsonApi: function() {
		return ((this.apiConfig.apiType == "HttpGarageDoorController") || (this.apiConfig.apiType == "Json"));
	},

	_hasStates: function() {
		return (this._hasDoorState() || this._hasLightState());
	},

	_hasDoorState: function() {
		return (this.apiConfig.doorStateUrl != null);
	},

	_hasLightState: function() {
		return (this.apiConfig.lightStateUrl != null);
	},

	_hasDualState: function() {
		return (this._hasDoorState() && this._hasLightState() && this._isJsonApi() && (this.apiConfig.doorStateUrl == this.apiConfig.lightStateUrl));
	},

	_httpRequest: function(method, url, expectedJsonField, expectedJsonFieldValue, expectedContent, done) {
		httpRequestMutex.lock(function() {
			method = method.toUpperCase();
			url = (this.httpSsl ? "httpSsl" : "http") + "://" + this.httpHost + ((!this.httpSsl && this.httpPort == 80) || (this.httpSsl && this.httpPort == 443) ? "" : ":" + this.httpPort) + url;

			if (this.oauthAuthentication) {
				var query = "";
				var parameters = {};
				var queryIndex = url.indexOf('?');

				if (queryIndex != -1) {
					query = url.substring(queryIndex + 1);
					url = url.substring(0, url.length - query.length - 1);

					queries = query.split('&');
					for (var i = 0; i < queries.length; i++) {
						var queryParts = queries[i].split('=');
						parameters[queryParts[0]] = (queryParts[1] || "");
					}
				}

				parameters["oauth_version"] = "1.0a";
				parameters["oauth_token"] = percentEncode(this.oauthToken || "");
				parameters["oauth_consumer_key"] = percentEncode(this.oauthConsumerKey);
				parameters["oauth_signature_method"] = percentEncode(this.oauthSignatureMethod);

				var oauthNonce = base64Encode(mCrypto.randomBytes(48));
				parameters["oauth_nonce"] = percentEncode(oauthNonce);

				var oauthTimestamp = Math.floor(new Date() / 1000);
				parameters["oauth_timestamp"] = percentEncode(oauthTimestamp);

				var sortedParameters = [];
				for (var parameter in parameters) {
					sortedParameters.push(parameter);
				}
				sortedParameters.sort();

				var parameterString = "";
				for (var i = 0; i < sortedParameters.length; ++i) {
					var parameter = sortedParameters[i];
					parameterString += parameter + "=" + parameters[parameter] + "&";
				}

				parameterString = parameterString.slice(0, -1);

				var oauthSignatureKey = percentEncode(this.oauthConsumerSecret) + "&" + percentEncode((this.oauthTokenSecret || ""));
				var oauthSignatureString = percentEncode(method) + "&" + percentEncode(url) + "&" + percentEncode(parameterString);

				var oauthSignature = "";
				switch (this.oauthSignatureMethod) {
					case "HMAC-SHA1":
						oauthSignature = mCrypto.createHmac("sha1", oauthSignatureKey).update(oauthSignatureString).digest("base64");
						break;
					case "HMAC-SHA256":
						oauthSignature = mCrypto.createHmac("sha256", oauthSignatureKey).update(oauthSignatureString).digest("base64");
						break;
					case "PLAINTEXT":
						oauthSignature = base64encode(oauthSignatureString);
						break;
				}

				parameters["oauth_signature"] = percentEncode(oauthSignature);
				parameterString += "&oauth_signature=" + parameters["oauth_signature"];
				url += "?" + parameterString;
			}

			var options = {
				method: method,
				timeout: this.httpRequestTimeoutMilliseconds,
				url: url
			};

			if (this.httpHeaderName) {
				var headers = {};
				headers[this.httpHeaderName] = this.httpHeaderValue;
				options.headers = headers;
			}

			var that = this;
			this.log.debug("Requesting HTTP Garage Door Controller URI '%s'...", url);

			mRequest(options, function(error, response, body) {
				var json = null;

				if (error) {
					that.log.debug("Request failed! - %s", error.message);
					error = new Error("An error occurred during the HTTP request: " + error.message);
				} else {
					that.log.debug("Request completed!");

					if ((response.statusCode < 200) || (response.statusCode > 299)) {
						error = new Error("The status code of the HTTP response was unexpected: " + response.statusCode);
					} else {
						if (that._isJsonApi()) {
							try {
								json = JSON.parse(body);
							} catch (jsonError) {
								json = null;
								that.log(body);
								error = new Error("The JSON body of the HTTP response could not be parsed: " + jsonError.message);
							}

							if ((json != null) && (expectedJsonField != null)) {
								if (!json.hasOwnProperty(expectedJsonField)) {
									error = new Error("The JSON body of the HTTP response does not contain the field: " + expectedJsonField);
								} else if ((expectedJsonFieldValue != null) && (json[expectedJsonField] != expectedJsonFieldValue)) {
									error = new Error("The JSON field value of the HTTP response was unexpected: " + json[expectedJsonField]);
								}
							}
						} else {
							if ((body != null) && (expectedContent != null)) {
								if (body.indexOf(expectedContent) == -1) {
									error = new Error("The body of the HTTP response does not contain the expected content: " + expectedContent);
								}
							}
						}
					}
				}

				httpRequestMutex.unlock();
				done(error, response, ((json != null) ? json : body));
			});
		}.bind(this));
	}
};
