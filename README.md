# homebridge-http-garagedoorcontroller (v2)
An HTTP based Garage Door/Light plugin for [HomeBridge](https://github.com/nfarina/homebridge)

![Demo](https://github.com/washcroft/HttpGarageDoorController/raw/master/reference/demo.gif "Demo")

# About
This HomeBridge (Apple HomeKit) plugin exposes a garage door accessory and optional garage light, allowing control of your garage door and/or garage light via standard HTTP requests, from within the Apple ecosystem. Since security is important here, both API Key header and **[OAuth 1.0a](https://oauth.net/core/1.0a/) signing/authentication** is supported.

I added an Arduino based WiFi-enabled controller onto my existing garage door operator, the Arduino ran an HTTP server on the network listening for these HTTP requests from HomeBridge.

The Arduino controller toggles GPIO outputs to operate the garage door (using either two separate open/close relays, or more commonly cycling the same one) and also a third output to control the garage light (another relay).

The Arduino controller also uses GPIO inputs to report the state of the garage door (two inputs from separate open/closed reed switches) and also a third input to allow the garage light to be controlled via another source (i.e. the garage door operator itself).

### Arduino Project
My Arduino project which accompanies this HomeBridge plugin can be found at [HttpGarageDoorController](https://github.com/washcroft/HttpGarageDoorController), however this plugin can work for other implementations too.


# Configuration

HomeBridge configuration sample:

```
  "accessories": [
    {
      "accessory": "HttpGarageDoorController",
      "name": "Garage Door",
      "lightName": "Garage Light",
      
      "doorOperationSeconds": 0,
      
      "httpHost": "garagedoorcontroller.local",
      "httpPort": 80,
      "httpSsl": false,
      "httpStatusPollMilliseconds": 4000,
      "httpRequestTimeoutMilliseconds": 10000,
      
      "httpHeaderName": "X-API-Key",
      "httpHeaderValue": "MyAPIKey",
      
      "oauthAuthentication": true,
      "oauthSignatureMethod": "HMAC-SHA256",
      "oauthConsumerKey": "MyOAuthConsumerKey",
      "oauthConsumerSecret": "MyOAuthConsumerSecret",
      "oauthToken": "MyOAuthToken",
      "oauthTokenSecret": "MyOAuthTokenSecret",
      
      "apiConfig":
      {
        "apiType": "HttpGarageDoorController"
      }
    }
  ],
```

For other implementations, the **apiConfig** block should be completed as follows:

### Json API

```
      "apiConfig":
      {
        "apiType": "Json",
        "doorSuccessField": "success",
        
        "doorOpenMethod": "PUT",
        "doorOpenUrl": "/controller/door/open",
        
        "doorCloseMethod": "PUT",
        "doorCloseUrl": "/controller/door/close",
        
        "doorStateMethod": "GET",
        "doorStateUrl": "/controller/door/status",
        "doorStateField": "door-state",
        
        "lightSuccessField": "success",
        
        "lightOnMethod": "PUT",
        "lightOnUrl": "/controller/light/on",
        
        "lightOffMethod": "PUT",
        "lightOffUrl": "/controller/light/off",
        
        "lightStateMethod": "GET",
        "lightStateUrl": "/controller/light/status",
        "lightStateField": "light-state"
      }
```

### Generic / Plain API

```
      "apiConfig":
      {
        "apiType": "Generic",
        
        "doorOpenMethod": "GET",
        "doorOpenUrl": "/controller/door/open",
        "doorOpenSuccessContent": "OK",
        
        "doorCloseMethod": "GET",
        "doorCloseUrl": "/controller/door/close",
        "doorCloseSuccessContent": "OK",
        
        "doorStateMethod": "GET",
        "doorStateUrl":"/controller/door/status",
        
        "lightOnMethod": "GET",
        "lightOnUrl":"/controller/light/on",
        "lightOnSuccessContent": "OK",
        
        "lightOffMethod": "GET",
        "lightOffUrl":"/controller/light/off",
        "lightOffSuccessContent": "OK",
        
        "lightStateMethod": "GET",
        "lightStateUrl":"/controller/light/status"
      }
```


### Fields: 

* name

  The name of the garage door accessory exposed via HomeBridge

* lightName

  The name of the garage light switch exposed via HomeBridge (optional, only set if using the light switch feature)

* doorOperationSeconds

  The average number of seconds it takes for the garage door to open or close (optional, unless no door state API is configured)

#### HTTP Fields

* httpHost

  The hostname or IP address of the HTTP web server controlling the garage door operator (exclude http:// and https://)

* httpPort

  The TCP port the HTTP web server is listening on (default 80)

* httpSsl

  Enable https:// encrypted communication over SSL (default false)

* httpStatusPollMilliseconds

  The number of milliseconds to wait between requests when polling for updated statuses (default 4000 = 4 seconds)

* httpRequestTimeoutMilliseconds

  The number of milliseconds to wait for an HTTP request to complete before timing out (default 10000 = 10  seconds)

* httpHeaderName

  The name of an HTTP header to be included with every request (optional)

* httpHeaderValue

  The value of the above HTTP header to be included with every request (optional)
  
#### OAuth Fields

* oauthAuthentication

  Enable OAuth authentication and signing with every HTTP request (default false)

* oauthSignatureMethod

  The OAuth signature method to be used for OAuth authentication and signing (default HMAC-SHA1, also supports HMAC-SHA256)

* oauthConsumerKey

  The OAuth consumer key to be used for OAuth authentication and signing, similar to a username

* oauthConsumerSecret

  The OAuth consumer secret to be used for OAuth authentication and signing, similar to a password

* oauthToken

  The OAuth token to be used for OAuth authentication and signing, similar to a username (optional)

* oauthTokenSecret

  The OAuth token to be used for OAuth authentication and signing, similar to a password (optional)

#### API Config Fields

* apiConfig

  The API config block holds all the necessary configuration for describing the API the module will be working with. Three separate blocks are exampled above, but you should **only use one** depending on whether you're using the accompanying Arduino project [HttpGarageDoorController](https://github.com/washcroft/HttpGarageDoorController), a Json based API or some other generic API.

* doorSuccessField ("Json" API only)

  The field name in the JSON response which holds whether the request was successful (field value must be boolean true or false)

* doorOpenMethod

  The HTTP request method to use when requesting the associated API URL (i.e. GET, PUT, POST)

* doorOpenUrl

  The API URL to open the garage door

* doorOpenSuccessContent ("Generic" API only)

  The content which must exist somewhere in the HTTP response to indicate whether the request was successful (optional, will assume always successful)

* doorCloseMethod

  The HTTP request method to use when requesting the associated API URL (i.e. GET, PUT, POST)

* doorCloseUrl

  The API URL to close the garage door

* doorCloseSuccessContent ("Generic"API only)

  The content which must exist somewhere in the HTTP response to indicate whether the request was successful (optional, will assume always successful)

* doorStateMethod

  The HTTP request method to use when requesting the associated API URL (i.e. GET, PUT, POST) (optional)

* doorStateUrl

  The API URL to obtain the garage door state (optional)

* doorStateField ("Json" API only)

  The field name in the JSON response which holds the garage door state (optional)

* lightSuccessField ("Json" API only)

  The field name in the JSON response which holds whether the request was successful (field value must be boolean true or false)

* lightOnMethod

  The HTTP request method to use when requesting the associated API URL (i.e. GET, PUT, POST)

* lightOnUrl

  The API URL to switch on the garage light

* lightOnSuccessContent ("Generic" API only)

  The content which must exist somewhere in the HTTP response to indicate whether the request was successful (optional, will assume always successful)

* lightOffMethod

  The HTTP request method to use when requesting the associated API URL (i.e. GET, PUT, POST)

* lightOffUrl

  The API URL to switch off the garage light

* lightOffSuccessContent ("Generic" API only)

  The content which must exist somewhere in the HTTP response to indicate whether the request was successful (optional, will assume always successful)

* lightStateMethod

  The HTTP request method to use when requesting the associated API URL (i.e. GET, PUT, POST) (optional)

* lightStateUrl

  The API URL to obtain the garage light state (optional)

* lightStateField ("Json" API only)

  The field name in the JSON response which holds the garage light state (optional)


**Door State Values:** When a door state API is configured, the API should return one of the following state values only (either in the specified Json field for a Json API, or as the complete response body for a Generic / Plain API).

* OPEN
* CLOSED
* OPENING
* CLOSING
* UNKNOWN
* STOPPED
* STOPPED-OPENING
* STOPPED-CLOSING

**Light State Values:** When a light state API is configured, the API should return one of the following state values only to indicate the light is on, all other values indicate the light is off (either in the specified Json field for a Json API, or as the complete response body for a Generic / Plain API).

* TRUE
* YES
* ON
* 1


# License
```
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
```