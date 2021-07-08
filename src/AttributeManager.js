define([
    'esri/dijit/AttributeInspector',
    'esri/geometry/Point',
    'esri/geometry/ScreenPoint',
    "esri/dijit/InfoWindow",
    "dojo/dom-construct",
    'dojo/dnd/Moveable',
    "dijit/form/Button",
    'esri/request',
], function (AttributeInspector, Point, ScreenPoint, InfoWindow, domConstruct, Moveable, Button, esriRequest) {
    return class AttributeManager {
        constructor({ map, widget, wkid, config, nls, api}) {
            this.map = map;
            this.wkid = wkid;
            this.widget = widget;
            this.config = config;
            this.nls = nls;
            this.api = api
        }

        _constructLayerInfo(layer) {
            const layerInfos = [
                {
                    'featureLayer': layer,
                    'showAttachments': false,
                    'isEditable': layer.isEditable && layer.isEditable() && layer.getEditCapabilities().canUpdate,
                    'fieldInfos': layer.infoTemplate.info.fieldInfos
                }
            ];
            return layerInfos
        }

        _constructInspectorSettings(layer) {
            return {
                layerInfos: this._constructLayerInfo(layer)
            }
        }

        _applyUpdatesToLayer(layer, feature){
            const token = layer.credential && layer.credential.token;
            const options = {
                url: layer.url + "/applyEdits",
                content: {
                    f: "json"
                },
                handleAs: "json"
            };
            options.content.updates = JSON.stringify({attributes: feature.attributes});
            if (token) options.content.token = token;

            return esriRequest(options, { usePost: true });
        }

        _constructNewInspector(layer) {
            this.inspector && this.inspector.destroy()
            this.inspector = new AttributeInspector(
                this._constructInspectorSettings(layer)
            , domConstruct.create("div", {'class': 'cmt-attribute-inspector'}));

            this.inspector.on("delete", (evt) => {
                evt.feature.getLayer().applyEdits(null, null, [evt.feature]);
                this.map.infoWindow.hide();
                this.widget._overlayManager.addOverlaysToViewer()
                this.api.stopMeasurementMode()
            });

            const saveButton = new Button({ label: this.nls.save, "class": "saveButton"},domConstruct.create("div"));
            this.inspector.deleteBtn.label = this.nls.delete
            domConstruct.place(saveButton.domNode, this.inspector.deleteBtn.domNode, "after");

            saveButton.on("click", () => {
                this.map.infoWindow.hide();
                this._applyUpdatesToLayer(layer, this.selectedFeature).then(() => {
                        this.widget._overlayManager.addOverlaysToViewer()
                });
            });

            this.inspector.on("attribute-change", (evt) => {
                //store the updates to apply when the save button is clicked
                this.selectedFeature.attributes[evt.fieldName] = evt.fieldValue;
            });

            this.inspector.on("next", (evt)  => {
                this.selectedFeature = evt.feature;
            });

            const windowToMove = this.map.infoWindow.domNode;
            require(["dojo/query", "dojo/NodeList-dom"], function(query){
                const handle = query(".title", windowToMove)[0];
                const dnd = new Moveable(windowToMove, {
                    handle: handle
                });
            });

            return this.inspector
        }

        _showInfoWindowWithFeature(feature){
            this._showInfoWindow(feature)
            this.map.infoWindow.setFeatures([feature])
        }

        _showInfoWindow(feature){

            const extent = feature.geometry.getExtent && feature.geometry.getExtent();
            const centroid = (extent && extent.getCenter()) || feature.geometry;
            this.map.infoWindow.resize(350, 240);
            this.map.infoWindow.show(new ScreenPoint((window.innerWidth - 50), 20));
            this.map.infoWindow.setTitle('');
            //this.map.centerAt(centroid)
        }

        showInfoOfFeature(feature){
            if(!this.config.allowEditing) return this._showInfoWindowWithFeature(feature)
            const insp = this._constructNewInspector(feature.getLayer())
            this.map.infoWindow.clearFeatures();
            this.map.infoWindow.setContent(insp.domNode);
            this._showInfoWindow(feature)
            this.inspector.showFeature(feature);
            this.selectedFeature = feature
        }

        showInfoById(layer, featureID){
            const field = layer.objectIdField
            const feature = layer.graphics.find((g) => g.attributes[field] === featureID)
            if(!feature) return;
            this.showInfoOfFeature(feature)
        }
    }
});
