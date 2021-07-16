# Street Smart Widget for ArcGIS Online

A simple Cyclorama Widget based on our Street Smart API.
See: https://www.cyclomedia.com/ for more information.

## Getting Started

- Install node.
- Download the [Web AppBuilder for ArcGIS](https://developers.arcgis.com/web-appbuilder/) and run the executable.
- Insert your ArcGIS credentials and the right portalUrl and appID when asked.
- Create a new app in the AppBuilder
- Copy `.env.example` to `.env` and update `WIDGET_DIR` so it points to the widget folder in the AppBuilder install path on your system.
- Run `npm install`
- Run `npm run build` which builds this widget to both the `dist` folder and `${WIDGET_DIR}`
- Add the StreetSmart widget to your development app.

## Developing

Run `npm start` which automatically transpiles and copies everything to `dist` and your widget directory.
Live reload doesn't work as the AppBuilder in seperate process.

NB: When adding the StreetSmart widget to your development app, the WebAppBuilder copies `client\stemapp\widgets\StreetSmart` to `server\apps\LOCAL_APP_ID\widgets\StreetSmart`.
To prevent caching issues, make a symlink from the server path to the client path.

### Livereload

We rely on the module bundler of the ArcGis WebApp Builder for Widget Development, and we cannot simply hook into this process to add livereload.
To support livereload in this symbiotic setup, we rely on `gulp-livereload` in combination with a browser addon.
Add [this plugin](https://chrome.google.com/webstore/detail/livereload/jnihajbhpnppcggbcgedagnkighmdlei) to Chrome and click on the icon in the ArcGis tab to enable livereload.

## Versioning

Current version: **21.2.3**

We use YEAR.MAJOR.PATCH versioning.
i.e.: 16.1.0 = year 2016, major version 1, patch 0.

We also make use of:

Street Smart API:
*	api.version: 21.4
*	api.location: [Street Smart API](https://streetsmart.cyclomedia.com/api/v21.4/StreetSmartAPI.js)

## Authors

* **Jasper Roosenmaallen** - [Jasper Roosenmaallen](mailto:jroosenmaallen@cyclomedia.com).
* **Harm Bruinsma** - [Harm Bruinsma](mailto:hbruinsmaboekema@cyclomedia.com).
* **Gijs Boekema** - [Gijs Boekema](mailto:gboekema@cyclomedia.com).
* **Sarath Chandra Kalluri** - *Initial work* - [Sarath Chandra Kalluri](mailto:skalluri@cyclomedia.com).
* **Jasper Stam** - https://github.com/stam
* **Chris Taylor** - [Chris Taylor](mailto:ctaylor@cyclomedia.com).

## License

This project is licensed under Commercial License.
Street Smart Widget for ArcGIS Online is a product of CycloMedia Technology B.V. This product is protected by copyright (c) 2016.
