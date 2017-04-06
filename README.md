# homebridge-http-garagedoorcontroller
An HTTP based Garage Door/Light plugin for [HomeBridge](https://github.com/nfarina/homebridge)

# About
This HomeBridge (HomeKit) plugin exposes a garage door accessory and garage light, allowing control of your garage door and/or garage light via HTTP requests. State reporting is also supported but it is optional.

In my setup, I added an Arduino based WiFi-enabled controller into my existing garage door operator which ran an HTTP server on the network listening for these HTTP requests from HomeBridge.

The Arduino controller toggles GPIO outputs to operate the garage door (using either two separate open/close relays, or more commonly cycling the same one) and also a third output to control the garage light (another relay).

The Arduino controller also uses GPIO inputs to report the state of the garage door (two inputs from separate open/closed reed switches) and also a third input to allow the garage light to be controlled via another source (i.e. the garage door operator itself).

My Arduino project which accompanies this HomeBridge plugin can be found at [HttpGarageDoorController](https://github.com/washcroft/HttpGarageDoorController).

# Configuration

HomeBridge configuration sample:

```
    "accessories": [
        {
            "accessory": "HttpGarageDoorController",
            
            "httpHost": "garagedoorcontroller.local",
            "httpPort": 80,
            "httpStatusPollMilliseconds": 4000,
            "httpHeaderName": "X-API-Key",
            "httpHeaderValue": "MyAPIKey",
            
            "name": "Garage Door",
            "doorStateUrl": "/controller",
            "doorStateField": "door-state",
            "doorOpenUrl": "/controller/door/open",
            "doorCloseUrl": "/controller/door/close",
            "doorSuccessField": "success",
            "doorOperationSeconds": 15,
            
            "lightName": "Garage Light",
            "lightStateUrl": "/controller",
            "lightStateField": "light-state",
            "lightOnUrl": "/controller/light/on",
            "lightOffUrl": "/controller/light/off",
            "lightSuccessField": "success"
        }
    ],
```

Fields: 

* httpHost - The hostname or IP address of the HTTP web server controlling the garage door operator
* httpPort - The TCP port the HTTP web server is listening on (default 80)
* httpStatusPollMilliseconds - The number of milliseconds to wait between requests when polling for updated statuses
* httpHeaderName - The name of an HTTP header to be included with every request (optional)
* httpHeaderValue - The value of the above HTTP header to be included with every request (optional)

* name - The name of the garage door accessory exposed via HomeBridge
* doorStateUrl - The GET request URL to obtain the garage door state (optional)
* doorStateField - The field name in the JSON response which holds the garage door state (optional)
* doorOpenUrl - The PUT request URL to open the garage door
* doorCloseUrl - The PUT request URL to close the garage door
* doorSuccessField - The field name in the JSON response which holds whether the request was successful
* doorOperationSeconds - The average number of seconds it takes for the garage door to open or close (optional, used when no state API available)

(optional):

* lightName - The name of the garage light switch exposed via HomeBridge
* lightStateUrl - The GET request URL to obtain the garage light state (optional)
* lightStateField - The field name in the JSON response which holds the garage light state (optional)
* lightOnUrl - The PUT request URL to switch on the garage light
* lightOffUrl - The PUT request URL to switch off the garage light
* lightSuccessField - The field name in the JSON response which holds whether the request was successful