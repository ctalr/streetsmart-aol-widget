# Street Smart Widget for ArcGIS Online

A simple Cyclorama Widget based on our Street Smart API.
This widget contains 2 components:
- a proxy: an empty shell which loads all its functionality from the CONTENT_URL
- the content: which is hosted locally during development

This structure is created so we can update the widget without requiring manual actions from the client.
See: https://www.cyclomedia.com/ for more information.

## Getting Started

- Install node.
- Download the [Web AppBuilder for ArcGIS](https://developers.arcgis.com/web-appbuilder/) and run the executable.
- Insert your ArcGIS credentials and the right portalUrl and appID when asked.
- Create a new app in the AppBuilder
- Copy `.env.example` to `.env` and update `WIDGET_DIR` so it points to the widget folder in the AppBuilder install path on your system.
- Run `npm install`
- Run `npm run build-proxy`, this builds a proxy for the actual content and places it in the correct directory.
- Add the StreetSmart widget to your development app. 

## Developing

Run `npm start` which compiles the widget content after a file change and serves it at `http://localhost:3001`.

NB: When adding the StreetSmart widget to your development app, the WebAppBuilder copies `client\stemapp\widgets\StreetSmart` to `server\apps\LOCAL_APP_ID\widgets\StreetSmart`. 
To prevent caching issues, make a symlink from the server path to the client path.

### Livereload

We rely on the module bundler of the ArcGis WebApp Builder for Widget Development, and we cannot simply hook into this process to add livereload.
To support livereload in this symbiotic setup, we rely on `gulp-livereload` in combination with a browser addon.
Add [this plugin](https://chrome.google.com/webstore/detail/livereload/jnihajbhpnppcggbcgedagnkighmdlei) to Chrome and click on the icon in the ArcGis tab to enable livereload.
`npm start` starts a livereload process, this triggers a browser refresh (if the extension is installed and enabled) when the code changes.

## Versioning

We use YEAR.MAJOR.PATCH versioning.
i.e.: 16.1.0 = year 2016, major version 1, patch 0 .

We also make use of:

Street Smart API:
	api.version: 16.1
	api.location: [Street Smart API](https://streetsmart.cyclomedia.com/api/v16.1/StreetSmartAPI.js)

Aperture API:
	api.location: [Aperture API](https://streetsmart.cyclomedia.com/api/v16.1/Aperture.js)



## Authors

* **Sarath Chandra Kalluri** - *Initial work* - [Sarath Chandra Kalluri](mailto:skalluri@cyclomedia.com).
* **Jasper Stam** - https://github.com/stam 

## License

This project is licensed under Commercial License.
Street Smart Widgte for ArcGIS Online is a product of CycloMedia Technology B.V. This product is protected by copyright (c) 2016.
